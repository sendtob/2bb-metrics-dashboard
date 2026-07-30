/**
 * Two Blind Brothers — Goal dashboard write-back service.  v4 (2026-07-30)
 *
 * WHAT CHANGED IN v4 — read this before deploying:
 *   1. WEEK COLUMNS ARE NOW DATES. Headers are stored as real week-ending
 *      Sundays (yyyy-MM-dd) instead of free text like "June 25". The current
 *      week's column is resolved FROM THE CLOCK on every write and created if
 *      it doesn't exist, so the week rolls over on its own every Monday.
 *      "Save & Close This Week" is gone — nobody has to remember to press it.
 *   2. AN AUDIT LOG. Every write appends to the "Log" tab
 *      (when | code | value | action | who | week). This is what makes
 *      "last updated 3 days ago by Katie" possible — and therefore what makes
 *      staleness visible on the dashboard.
 *   3. CONFIRM-NO-CHANGE (fn=confirm). Records that someone LOOKED at a metric
 *      and it genuinely didn't move, without changing the number. Previously a
 *      carried-forward value and a verified-unchanged value were identical.
 *   4. BLANKS STAY BLANK. New week columns start empty for count metrics.
 *      Only running totals carry forward (a running total really does persist),
 *      and a carried value writes NO log entry — so it shows as unconfirmed.
 *   5. A "Meta" tab (code | owner | kind | link) drives per-person entry views
 *      and the scorecard links. Auto-created, safe to hand-edit.
 *
 * DEPLOY (once — the /exec URL must keep working):
 *   Deploy ▸ Manage deployments ▸ ✏️ (edit) ▸ Version: "New version" ▸ Deploy.
 *   Do NOT make a "New deployment" — that mints a different URL.
 *   Then hit  <exec-url>?fn=migrate&pass=<passcode>  ONCE in a browser tab.
 *   Migrate is idempotent: it normalises the legacy text headers to dates and
 *   creates the Meta/Log tabs. Run it twice and nothing bad happens.
 *
 * Endpoints (JSONP GET, called by the dashboard):
 *   ?fn=save&code=&value=&label=&who=   → write into THIS WEEK's column (auto-creates row + column)
 *   ?fn=confirm&code=&who=              → "checked it, no change" (logs, doesn't touch the value)
 *   ?fn=additem&code=&item=&by=         → append one item to the "Items" tab
 *   ?fn=migrate                         → one-time (idempotent) upgrade of an old sheet
 *   ?fn=saveweek                        → deprecated no-op, kept so stale browser tabs don't error
 *
 * WRITE PASSCODE: every write requires &pass=<team passcode>, checked against
 * Project Settings ▸ Script properties ▸ WRITE_PASS. Fail-closed. Reads are
 * unaffected (the dashboards read the sheet via gviz, not this app).
 */

var ITEMS_SHEET = 'Items';
var META_SHEET  = 'Meta';
var LOG_SHEET   = 'Log';
var FIRST_WEEK_COL = 3;          // cols 1-2 are label + code; weeks start at 3

function doGet(e) {
  var cb = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : 'callback';
  var out;
  try {
    var fn = e.parameter.fn;
    if (fn === 'ping')           out = { ok: true, pong: true, version: 4 };
    else if (!passOk_(e))        out = { ok: false, error: 'bad or missing passcode' };
    else if (fn === 'save')      out = saveValue_(e.parameter.code, e.parameter.value, e.parameter.label, e.parameter.who);
    else if (fn === 'confirm')   out = confirmValue_(e.parameter.code, e.parameter.who);
    else if (fn === 'additem')   out = addItem_(e.parameter.code, e.parameter.item, e.parameter.by);
    else if (fn === 'migrate')   out = migrate_();
    else if (fn === 'saveweek')  out = { ok: true, deprecated: true,
                                         note: 'Weeks roll over automatically now — nothing to close.' };
    else                         out = { ok: false, error: 'unknown fn' };
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(out) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function passOk_(e) {
  var want = PropertiesService.getScriptProperties().getProperty('WRITE_PASS');
  if (!want) throw new Error('WRITE_PASS not configured in Script properties');
  var got = (e && e.parameter && e.parameter.pass) || '';
  return got === want;
}

function sheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]; }

// ---------------------------------------------------------------------------
// Weeks are identified by their week-ending SUNDAY, stored as yyyy-MM-dd.
// Same anchor the e-comm feed uses (period_end), so the goal tree and the
// commercial numbers finally sit on one clock instead of two.
// ---------------------------------------------------------------------------
function tz_() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'America/New_York'; }
function iso_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }

// The Sunday that ends the week containing d (Sun itself counts as its own end).
function weekEnd_(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + ((7 - x.getDay()) % 7));
  return x;
}
function currentWeekIso_() { return iso_(weekEnd_(new Date())); }

// Read the header row as ISO strings (dates come back as Date objects).
function headerIsos_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < FIRST_WEEK_COL) return [];
  var vals = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var out = [];
  for (var c = FIRST_WEEK_COL; c <= lastCol; c++) {
    var v = vals[c - 1];
    out.push({ col: c, iso: (v instanceof Date) ? iso_(v) : String(v || '').trim() });
  }
  return out;
}

// Column for THIS week, creating it at the right edge if missing.
// Count metrics start blank; running totals carry forward (silently — a carried
// value writes no log entry, so the dashboard still shows it as unconfirmed).
function currentWeekCol_(sh) {
  var want = currentWeekIso_(), hdrs = headerIsos_(sh), i;
  for (i = 0; i < hdrs.length; i++) if (hdrs[i].iso === want) return hdrs[i].col;

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    hdrs = headerIsos_(sh);                         // re-check under the lock
    for (i = 0; i < hdrs.length; i++) if (hdrs[i].iso === want) return hdrs[i].col;

    var prev = sh.getLastColumn() < FIRST_WEEK_COL ? (FIRST_WEEK_COL - 1) : sh.getLastColumn();
    var nc = prev + 1;
    sh.insertColumnAfter(prev);
    sh.getRange(1, nc).setValue(want).setNumberFormat('yyyy-mm-dd');

    var lastRow = sh.getLastRow();
    if (lastRow >= 2 && prev >= FIRST_WEEK_COL) {
      var codes = sh.getRange(2, 2, lastRow - 1, 1).getValues();
      var labels = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      var prevVals = sh.getRange(2, prev, lastRow - 1, 1).getValues();
      var meta = metaMap_();
      var carried = [];
      for (var r = 0; r < codes.length; r++) {
        var code = String(codes[r][0]).trim();
        carried.push([ isRunning_(code, String(labels[r][0]), meta) ? prevVals[r][0] : '' ]);
      }
      sh.getRange(2, nc, carried.length, 1).setValues(carried);
    }
    return nc;
  } finally {
    lock.releaseLock();
  }
}

function isRunning_(code, label, meta) {
  var m = meta[code];
  if (m && m.kind) return String(m.kind).toLowerCase().indexOf('run') === 0;
  return /running total/i.test(label || '');
}

function rowForCode_(sh, code) {
  var lastRow = sh.getLastRow();
  var codes = sh.getRange(1, 2, lastRow, 1).getValues();
  for (var r = 0; r < codes.length; r++) if (String(codes[r][0]).trim() === code) return r + 1;
  return -1;
}

function saveValue_(code, value, label, who) {
  if (!code) return { ok: false, error: 'no code' };
  var sh = sheet_();
  var r = rowForCode_(sh, code);
  if (r < 0) {
    if (!label) return { ok: false, error: 'code not found: ' + code };
    var lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      r = rowForCode_(sh, code);
      if (r < 0) {
        r = sh.getLastRow() + 1;
        sh.getRange(r, 1).setValue(label);
        sh.getRange(r, 2).setValue(code);
      }
    } finally { lock.releaseLock(); }
  }
  var c = currentWeekCol_(sh);
  var v;
  if (value === '' || value == null) { v = ''; }
  else { v = Number(value); if (isNaN(v)) return { ok: false, error: 'not a number' }; }
  sh.getRange(r, c).setValue(v);
  logWrite_(code, v, 'set', who);
  return { ok: true, code: code, value: v, col: c, week: currentWeekIso_() };
}

// "I checked this and it genuinely didn't change." Stamps the log so the
// dashboard can tell a verified-flat metric from one nobody has looked at.
function confirmValue_(code, who) {
  if (!code) return { ok: false, error: 'no code' };
  var sh = sheet_();
  var r = rowForCode_(sh, code);
  if (r < 0) return { ok: false, error: 'code not found: ' + code };
  var c = currentWeekCol_(sh);
  var cur = sh.getRange(r, c).getValue();
  logWrite_(code, cur, 'confirm', who);
  return { ok: true, code: code, value: cur, week: currentWeekIso_() };
}

// ---------------------------------------------------------------------------
// Audit log — the record that makes staleness computable.
// ---------------------------------------------------------------------------
function logSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET);
    sh.appendRow(['when', 'code', 'value', 'action', 'who', 'week']);
    sh.setFrozenRows(1);
  }
  return sh;
}
function logWrite_(code, value, action, who) {
  try {
    logSheet_().appendRow([new Date(), String(code), value, action,
                           String(who || '').slice(0, 60), currentWeekIso_()]);
  } catch (err) { /* logging must never break a save */ }
}

// ---------------------------------------------------------------------------
// Meta — per-metric owner / kind / link. Drives ?who= entry views and the
// scorecard links. Hand-editable; the dashboard reads it via gviz.
// ---------------------------------------------------------------------------
function metaSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(META_SHEET);
  if (!sh) {
    sh = ss.insertSheet(META_SHEET);
    sh.appendRow(['code', 'owner', 'kind', 'link']);
    sh.setFrozenRows(1);
    sh.setColumnWidth(4, 320);
  }
  return sh;
}
function metaMap_() {
  var out = {};
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(META_SHEET);
    if (!sh || sh.getLastRow() < 2) return out;
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    for (var i = 0; i < v.length; i++) {
      var code = String(v[i][0]).trim();
      if (code) out[code] = { owner: String(v[i][1] || '').trim(),
                              kind:  String(v[i][2] || '').trim(),
                              link:  String(v[i][3] || '').trim() };
    }
  } catch (err) {}
  return out;
}

// ---------------------------------------------------------------------------
// Item lists — the actual things behind the counts (unchanged from v3).
// ---------------------------------------------------------------------------
function itemsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ITEMS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ITEMS_SHEET);
    sh.appendRow(['added_at', 'code', 'item', 'by']);
    sh.setFrozenRows(1);
    sh.setColumnWidth(3, 340);
  }
  return sh;
}
function addItem_(code, item, by) {
  if (!code) return { ok: false, error: 'no code' };
  item = String(item == null ? '' : item).trim();
  if (!item) return { ok: false, error: 'empty item' };
  if (item.length > 200) item = item.slice(0, 200);
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    itemsSheet_().appendRow([new Date(), String(code), item, String(by || '').slice(0, 60)]);
    return { ok: true, code: String(code), item: item };
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------------------
// One-time (idempotent) migration of an old sheet.
//   • Normalises free-text week headers ("June 25") to the week-ending Sunday
//     of the week that contained them, stored as a real date.
//   • Years are inferred by walking left→right and only rolling the year when
//     the month goes backwards, so the sequence stays monotonic. No wrap
//     heuristics, no ambiguity — and it can't silently reorder columns.
//   • Creates the Meta and Log tabs.
// ---------------------------------------------------------------------------
function migrate_() {
  var sh = sheet_();
  metaSheet_(); logSheet_();

  var lastCol = sh.getLastColumn();
  if (lastCol < FIRST_WEEK_COL) return { ok: true, migrated: 0, note: 'no week columns' };

  var MO = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  // Anchor: the newest column should land in the week we're in now (or earlier).
  var thisYear = new Date().getFullYear();
  var parsed = [], i, changed = 0;
  for (i = FIRST_WEEK_COL; i <= lastCol; i++) {
    var raw = hdr[i - 1];
    if (raw instanceof Date) { parsed.push({ col: i, d: weekEnd_(raw), already: true }); continue; }
    var s = String(raw || '').trim();
    if (!s) { parsed.push({ col: i, d: null }); continue; }
    var isoM = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (isoM) { parsed.push({ col: i, d: weekEnd_(new Date(+isoM[1], +isoM[2] - 1, +isoM[3])), already: true }); continue; }
    var m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})$/.exec(s);
    if (!m) { parsed.push({ col: i, d: null }); continue; }
    var mo = MO[m[1].slice(0, 3).toLowerCase()];
    if (mo == null) { parsed.push({ col: i, d: null }); continue; }
    parsed.push({ col: i, mo: mo, day: +m[2] });
  }

  // Walk forward assigning years, rolling only when the month regresses.
  var year = null, prevMo = -1;
  for (i = 0; i < parsed.length; i++) {
    var p = parsed[i];
    if (p.d || p.mo == null) { if (p.d) prevMo = p.d.getMonth(); continue; }
    if (year === null) year = thisYear;
    if (p.mo < prevMo) year++;
    prevMo = p.mo;
    p.d = weekEnd_(new Date(year, p.mo, p.day));
  }
  // If that pushed anything into the future, shift the whole run back a year.
  var todayEnd = weekEnd_(new Date()), maxD = null;
  for (i = 0; i < parsed.length; i++) if (parsed[i].d && (!maxD || parsed[i].d > maxD)) maxD = parsed[i].d;
  if (maxD && maxD > todayEnd) {
    for (i = 0; i < parsed.length; i++) {
      if (parsed[i].d && !parsed[i].already) parsed[i].d = weekEnd_(new Date(parsed[i].d.getFullYear() - 1, parsed[i].d.getMonth(), parsed[i].d.getDate()));
    }
  }

  for (i = 0; i < parsed.length; i++) {
    if (!parsed[i].d || parsed[i].already) continue;
    sh.getRange(1, parsed[i].col).setValue(iso_(parsed[i].d)).setNumberFormat('yyyy-mm-dd');
    changed++;
  }
  return { ok: true, migrated: changed, weeks: headerIsos_(sh).map(function (h) { return h.iso; }) };
}
