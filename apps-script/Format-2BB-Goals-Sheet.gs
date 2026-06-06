/**
 * Two Blind Brothers — Goal Sheet beautifier.
 *
 * HOW TO RUN (once, ~20 seconds):
 *   1. Open the goals sheet.
 *   2. Extensions ▸ Apps Script.
 *   3. Delete anything there, paste ALL of this, click Save (💾).
 *   4. Pick "formatGoalsSheet" in the function dropdown ▸ Run.
 *   5. Approve the permission prompt the first time (it only edits this sheet).
 *
 * What it does: frozen names + dates, hidden codes column, color-coded sections
 * (matching the dashboard), clean alternating rows, auto-filled rows greyed with a
 * note, the latest week highlighted gold, tidy fonts/widths/number formats.
 * It changes NO numbers — pure formatting — and is safe to re-run any time
 * (e.g. after you add a new week column).
 */
function formatGoalsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheets()[0]; // the first tab — the one the dashboard reads
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 3) { ss.toast('Sheet looks empty — nothing to format.', '2BB', 5); return; }
  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();

  // ---- palette (matches the dashboard) ----
  var NAVY='#1F3864', GOLD='#E8B84B', GOLDLT='#fff6da', INK='#1f2937', WHITE='#ffffff',
      ZEBRA='#f4f7fb', GREY='#9aa1ab', GREYBG='#f0f1f3', LINE='#dfe5ee';
  // section accent colors keyed by a word in the section title (dashboard north-star colors)
  var SECTIONS = [
    {k:'DONOR',      c:'#4F46E5'},
    {k:'PARTNER',    c:'#0EA5A4'},
    {k:'LEVERAGE',   c:'#7C3AED'},
    {k:'IMPACT',     c:'#DB2777'},
    {k:'COMMERCIAL', c:'#16A34A'}
  ];
  // rows the dashboard auto-fills from e-comm (team should NOT enter these)
  var AUTO = {c_nm:1, c_nm_vs:1, c_ret:1, c_sales:1};  // c_mear is now MRR (manual entry)

  // ---- base reset (clean slate) ----
  var all = sh.getRange(1, 1, lastRow, lastCol);
  all.setFontFamily('Arial').setFontSize(10).setFontColor(INK).setFontStyle('normal')
     .setFontWeight('normal').setBackground(WHITE).setVerticalAlignment('middle');

  // ---- header row ----
  var hdr = sh.getRange(1, 1, 1, lastCol);
  hdr.setBackground(NAVY).setFontColor(WHITE).setFontWeight('bold').setFontSize(10.5)
     .setHorizontalAlignment('center');
  sh.getRange(1, 1).setHorizontalAlignment('left').setWrap(true);
  sh.setRowHeight(1, 40);

  // ---- freeze the names + the dates ----
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);

  // ---- hide the codes column (B) — dashboard still reads it underneath ----
  sh.hideColumns(2);

  // ---- widths + number format + centering for week values ----
  sh.setColumnWidth(1, 320);
  for (var c = 3; c <= lastCol; c++) sh.setColumnWidth(c, 74);
  sh.getRange(2, 3, lastRow - 1, lastCol - 2).setNumberFormat('#,##0').setHorizontalAlignment('center');

  // ---- latest week = rightmost column that has a date header ----
  var latestCol = 0;
  for (var c2 = lastCol; c2 >= 3; c2--) { if (String(data[0][c2 - 1]).trim() !== '') { latestCol = c2; break; } }

  // ---- style each row ----
  var zebra = false;
  for (var r = 2; r <= lastRow; r++) {
    var label = String(data[r - 1][0] || '');
    var code  = String(data[r - 1][1] || '').trim();
    var row = sh.getRange(r, 1, 1, lastCol);

    if (label && !code) {
      // section band
      var up = label.toUpperCase(), color = NAVY;
      for (var s = 0; s < SECTIONS.length; s++) if (up.indexOf(SECTIONS[s].k) >= 0) color = SECTIONS[s].c;
      row.setBackground(color).setFontColor(WHITE).setFontWeight('bold').setFontSize(10.5);
      sh.getRange(r, 1).setHorizontalAlignment('left');
      sh.setRowHeight(r, 30);
      zebra = false;
    } else if (code) {
      // metric row
      var isAuto = !!AUTO[code];
      row.setBackground(isAuto ? GREYBG : (zebra ? ZEBRA : WHITE));
      sh.getRange(r, 1).setHorizontalAlignment('left');
      if (isAuto) {
        row.setFontColor(GREY).setFontStyle('italic');
        sh.getRange(r, 1).setNote('Auto-filled from e-comm (net margin / sales). No entry needed — the dashboard ignores this row.');
      }
      sh.setRowHeight(r, 24);
      zebra = !zebra;
    }
  }

  // ---- highlight the latest week (gold) so the team knows where to type ----
  if (latestCol >= 3) {
    sh.getRange(1, latestCol).setBackground(GOLD).setFontColor(NAVY);
    sh.getRange(2, latestCol, lastRow - 1, 1).setBackground(GOLDLT);
    sh.getRange(1, latestCol).setNote('Latest week — type this week\'s numbers in this column. Add a new column for next week and re-run this script to move the highlight.');
  }

  // ---- light gridlines ----
  all.setBorder(true, true, true, true, true, true, LINE, SpreadsheetApp.BorderStyle.SOLID);

  ss.toast('Goals sheet formatted ✓  (re-run any time)', '2BB', 5);
}
