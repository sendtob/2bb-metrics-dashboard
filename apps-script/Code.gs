/**
 * Two Blind Brothers — Weekly Metrics data-entry web app.
 *
 * Serves a simple form and writes weekly numbers into the "2BB Dashboard Data"
 * sheet that the live dashboard reads.
 *
 * DEPLOY: Deploy ▸ New deployment ▸ type "Web app" ▸ Execute as: Me ▸
 *         Who has access: (Anyone in your org, or Anyone with the link) ▸ Deploy.
 *         Copy the web-app URL and share it with the team.
 */
const SHEET_ID = "1tDl5V-2wJrlgX3b9hOOkTVxlYIKgiEaMkHLl6BFoYe0";  // 2BB Weekly Metrics — team entry. Col A = label, Col B = code, Col C+ = weeks.

const METRICS = [
  // Development (donors + partners)
  {id:"g1_ask",   area:"Development",   label:"Asks made this week"},
  {id:"g1_pros",  area:"Development",   label:"Good prospects on our list (running total)"},
  {id:"g1_rate",  area:"Development",   label:"Confirmed they can give $100K and care (running total)"},
  {id:"g1_off",   area:"Development",   label:"Specific projects priced and ready"},
  {id:"g1_cult",  area:"Development",   label:"Donor meetings held this week"},
  {id:"g2_meet",  area:"Development",   label:"Decision-maker meetings this week"},
  {id:"g2_tar",   area:"Development",   label:"Target companies found (running total)"},
  {id:"g2_sh",    area:"Development",   label:"Companies with an idea and a way in (running total)"},
  {id:"g2_out",   area:"Development",   label:"Outreach attempts this week"},
  // AI / Leverage
  {id:"g3_inu",   area:"AI / Leverage", label:"AI agents actually in use"},
  {id:"g3_task",  area:"AI / Leverage", label:"Repeating tasks an agent could take over (running total)"},
  {id:"g3_blt",   area:"AI / Leverage", label:"AI agents built (running total)"},
  {id:"g3_solo",  area:"AI / Leverage", label:"Agents that run on their own"},
  // Impact (breadth + depth)
  {id:"5a_key",   area:"Impact",        label:"People reached who changed their minds"},
  {id:"5a_reach", area:"Impact",        label:"New people reached (first time)"},
  {id:"5a_shift", area:"Impact",        label:"Share who changed their minds", hint:"decimal — 0.25 = 25%"},
  {id:"5a_sov",   area:"Impact",        label:"Our share of the blindness conversation", hint:"decimal — 0.20 = 20%"},
  {id:"5b_key",   area:"Impact",        label:"People funded / taught / connected (this week)"},
  {id:"5b_enr",   area:"Impact",        label:"People in a program right now"},
  {id:"5b_prog",  area:"Impact",        label:"Programs running"},
  {id:"5b_sto",   area:"Impact",        label:"Verified life-change stories (running total)"},
  // Commerce (4A)
  {id:"4a_nm",    area:"Commerce",      label:"Money left after ads and shipping", hint:"$ thousands — 75 = $75k"},
  {id:"4a_nm_vs", area:"Commerce",      label:"Same week last year", hint:"$ thousands"},
  {id:"4a_sales", area:"Commerce",      label:"Sales / revenue", hint:"$ thousands"},
  {id:"4a_roas",  area:"Commerce",      label:"Return on ad spend", hint:"e.g. 2.5"},
  // Product (4B)
  {id:"4b_win",    area:"Product",      label:"Winners — products & campaigns that hit their goal"},
  {id:"4b_rate",   area:"Product",      label:"Win rate", hint:"decimal — 0.5 = 50%"},
  {id:"4b_launch", area:"Product",      label:"Products & campaigns launched this season"},
  {id:"4b_dev",    area:"Product",      label:"Products & campaigns in development"}
];
const AREAS = ["Development", "AI / Leverage", "Impact", "Commerce", "Product"];

function doGet() {
  return HtmlService.createTemplateFromFile('Form').evaluate()
    .setTitle('Two Blind Brothers — Update Weekly Metrics')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function sheet_() {
  return SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
}

function getConfig() {
  const sh = sheet_();
  const header = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  const weeks = header.slice(2).map(String).filter(function (s) { return s !== ''; });
  return { metrics: METRICS, areas: AREAS, weeks: weeks };
}

function getValues(week) {
  const sh = sheet_();
  const data = sh.getDataRange().getValues();
  const header = data[0].map(String);
  const col = header.indexOf(String(week));
  const out = {};
  if (col < 0) return out;
  for (var r = 1; r < data.length; r++) { if (String(data[r][1]) === '') continue; out[String(data[r][1])] = data[r][col]; }
  return out;
}

function saveValues(week, values) {
  week = String(week).trim();
  if (!week) throw new Error('No week given.');
  const sh = sheet_();
  const data = sh.getDataRange().getValues();
  const header = data[0].map(String);
  var col = header.indexOf(week);                 // 0-based
  if (col < 0) {                                  // new week -> append a column
    var pos = sh.getLastColumn() + 1;             // 1-based
    sh.getRange(1, pos).setValue(week);
    col = pos - 1;
  }
  var idRow = {};
  for (var r = 1; r < data.length; r++) idRow[String(data[r][1])] = r; // 0-based (col B = code)
  var n = 0;
  Object.keys(values).forEach(function (id) {
    var v = values[id];
    if (idRow[id] != null && v !== '' && v != null && !isNaN(Number(v))) {
      sh.getRange(idRow[id] + 1, col + 1).setValue(Number(v));
      n++;
    }
  });
  return n;
}
