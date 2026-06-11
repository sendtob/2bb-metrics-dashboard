/**
 * Two Blind Brothers — Goal dashboard write-back service.
 * Lets the team edit metrics on the dashboard and save them into this sheet.
 *
 * DEPLOY (once):
 *   1. In the goals sheet: Extensions ▸ Apps Script.
 *   2. Delete anything there, paste ALL of this, Save (💾).
 *   3. Deploy ▸ New deployment ▸ (gear) Web app
 *        • Execute as: Me
 *        • Who has access: Anyone
 *      ▸ Deploy ▸ approve the permissions.
 *   4. Copy the "/exec" Web app URL and send it back to wire into the dashboard.
 *
 * Endpoints (JSONP GET, called by the dashboard):
 *   ?fn=save&code=<metricCode>&value=<number>&label=<label>  → writes value into the CURRENT week column (auto-creates the row if the metric is new)
 *   ?fn=saveweek                                 → locks the week & opens a fresh week column (carries values forward)
 *   ?fn=additem&code=<metricCode>&item=<text>&by=<name>      → appends one item to the "Items" tab (the per-metric list behind the counts — prospects, products, …). Auto-creates the tab.
 *
 * RE-DEPLOY after editing (the /exec URL must keep working):
 *   Deploy ▸ Manage deployments ▸ ✏️ (edit) ▸ Version: "New version" ▸ Deploy.
 *   Do NOT make a "New deployment" — that mints a different URL.
 *
 * WRITE PASSCODE (added 2026-06-10): every write requires &pass=<team passcode>.
 * The passcode is NOT in this file (the repo is public) — it lives in
 * Project Settings ▸ Script properties ▸ WRITE_PASS. Fail-closed: if the
 * property is missing, all writes are rejected. To rotate it, change the
 * property (no re-deploy needed) and give the team the new passcode — the
 * dashboard asks for it once per browser and remembers it.
 * Reads are unaffected (the dashboards read the sheet via gviz, not this app).
 */
function doGet(e) {
  var cb = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : 'callback';
  var out;
  try {
    var fn = e.parameter.fn;
    if (fn === 'ping')          out = { ok: true, pong: true };   // connectivity check stays open
    else if (!passOk_(e))       out = { ok: false, error: 'bad or missing passcode' };
    else if (fn === 'save')     out = saveValue_(e.parameter.code, e.parameter.value, e.parameter.label);
    else if (fn === 'saveweek') out = saveWeek_();
    else if (fn === 'additem')  out = addItem_(e.parameter.code, e.parameter.item, e.parameter.by);
    else                        out = { ok: false, error: 'unknown fn' };
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(out) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// Writes require the shared team passcode. It lives in Script properties
// (WRITE_PASS), never in this repo. Missing property = reject everything
// (fail closed) with a distinct error so misconfiguration is debuggable.
function passOk_(e) {
  var want = PropertiesService.getScriptProperties().getProperty('WRITE_PASS');
  if (!want) throw new Error('WRITE_PASS not configured in Script properties');
  var got = (e && e.parameter && e.parameter.pass) || '';
  return got === want;
}

function sheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]; }

// Active week = rightmost column (>= 3) that has a header date.
function activeCol_(sh) {
  var lastCol = sh.getLastColumn();
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var c = lastCol; c >= 3; c--) { if (String(hdr[c - 1]).trim() !== '') return c; }
  return Math.max(3, lastCol);
}

// Row whose column-B code matches.
function rowForCode_(sh, code) {
  var lastRow = sh.getLastRow();
  var codes = sh.getRange(1, 2, lastRow, 1).getValues();
  for (var r = 0; r < codes.length; r++) { if (String(codes[r][0]).trim() === code) return r + 1; }
  return -1;
}

function saveValue_(code, value, label) {
  if (!code) return { ok: false, error: 'no code' };
  var sh = sheet_();
  var r = rowForCode_(sh, code);
  if (r < 0) {
    // metric doesn't exist yet — auto-create a row so new dashboard metrics just
    // work. Under a lock: two concurrent auto-creates both saw the same lastRow
    // and overwrote each other's new row.
    if (!label) return { ok: false, error: 'code not found: ' + code };
    var lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      r = rowForCode_(sh, code);            // re-check — the other writer may have created it
      if (r < 0) {
        r = sh.getLastRow() + 1;
        sh.getRange(r, 1).setValue(label);
        sh.getRange(r, 2).setValue(code);
      }
    } finally {
      lock.releaseLock();
    }
  }
  var c = activeCol_(sh);
  var v;
  if (value === '' || value == null) { v = ''; }
  else { v = Number(value); if (isNaN(v)) return { ok: false, error: 'not a number' }; }
  sh.getRange(r, c).setValue(v);
  return { ok: true, code: code, value: v, col: c, week: String(sh.getRange(1, c).getValue()) };
}

// ---------------------------------------------------------------------------
// Item lists — the actual things behind the counts (prospects, products, …).
// One row per item in the "Items" tab so the team can see what's already been
// counted (no double counting) and fix entries directly in the Sheet.
// ---------------------------------------------------------------------------

var ITEMS_SHEET = 'Items';

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
  // Lock covers the create-tab-on-first-write race; appends themselves are safe.
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var sh = itemsSheet_();
    sh.appendRow([new Date(), String(code), item, String(by || '').slice(0, 60)]);
    return { ok: true, code: String(code), item: item };
  } finally {
    lock.releaseLock();
  }
}

function saveWeek_() {
  var sh = sheet_();
  var cur = activeCol_(sh);
  var lastRow = sh.getLastRow();
  // open a fresh week column immediately to the right of the current one
  sh.insertColumnAfter(cur);
  var nc = cur + 1;
  // date-stamp it with today
  var d = new Date();
  var MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var label = MO[d.getMonth()] + ' ' + d.getDate();
  sh.getRange(1, nc).setValue(label);
  // carry the just-closed week's numbers forward so running totals don't reset to 0;
  // the team simply adjusts what changed for the new week. (Header row skipped.)
  if (lastRow >= 2) {
    var vals = sh.getRange(2, cur, lastRow - 1, 1).getValues();
    sh.getRange(2, nc, lastRow - 1, 1).setValues(vals);
  }
  return { ok: true, newWeek: label, col: nc };
}
