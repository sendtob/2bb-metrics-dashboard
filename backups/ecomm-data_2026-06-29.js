/* ============================================================================
   Two Blind Brothers — e-comm helpers for the Goal Tree's
   "Commercial Success → Beat last year" goal (index.html).

   NO estimated data lives here. The goal is populated entirely from REAL data
   at runtime, in preference order:
     • margin_yoy.json  — THIS YEAR and LAST YEAR, weekly (Shopify total_revenue +
                          Northbeam ad spend), built by tools/backfill_margin_yoy.py
     • kpi_history.json — fallback: this year only (the live weekly store)
     • ecomm.html        — fallback: the current week's snapshot

   Net margin = net_revenue − ad_spend − shipping.
   Shipping isn't in the feed, so it's modeled at shipPct of revenue
   (set shipPct to 0 for pure contribution-after-ads); margin_yoy.json may override it.
   All $ figures are DOLLARS; the Goal Tree shows them in $thousands.
============================================================================ */
window.ECOMM_HIST = {
  shipPct: 0.10,
  weeks: [],
  thisYear: { net_revenue: [], ad_spend: [] },
  lastYear: { net_revenue: [], ad_spend: [] }   // real last-year (from margin_yoy.json); empty until loaded
};
window.ECOMM_HIST.marginK = y => y.net_revenue.map((r,i)=> +((r*(1-window.ECOMM_HIST.shipPct) - y.ad_spend[i]) / 1000).toFixed(2)); // $k
window.ECOMM_HIST.salesK  = y => y.net_revenue.map(r => +(r/1000).toFixed(2));                                                      // $k
window.ECOMM_HIST.mearX   = y => y.net_revenue.map((r,i)=> +(r / y.ad_spend[i]).toFixed(2));                                        // x
