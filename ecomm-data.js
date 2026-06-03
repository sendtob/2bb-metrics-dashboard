/* ============================================================================
   Two Blind Brothers — e-comm helpers for the Goal Tree's
   "Commercial Success → Beat last year" goal (index.html).

   NO estimated data lives here anymore. The goal is populated entirely from the
   REAL WBR history (kpi_history.json) at runtime — see index.html's
   loadKpiHistory(). There is intentionally NO last-year series: we don't have
   real last-year ad-spend data, and we don't fabricate it.

   Net margin = net_revenue − ad_spend − shipping.
   Shipping isn't in the WBR feed, so it's modeled at shipPct of revenue
   (set shipPct to 0 to show pure contribution-after-ads instead).
   All $ figures are DOLLARS; the Goal Tree shows them in $thousands.
============================================================================ */
window.ECOMM_HIST = {
  shipPct: 0.10,                          // transparent shipping assumption (tunable; 0 = none)
  weeks: [],                              // filled from kpi_history.json
  thisYear: { net_revenue: [], ad_spend: [] }   // filled from kpi_history.json
  // (no lastYear — last-year estimates removed; a real one needs ad-spend history)
};
window.ECOMM_HIST.marginK = y => y.net_revenue.map((r,i)=> +((r*(1-window.ECOMM_HIST.shipPct) - y.ad_spend[i]) / 1000).toFixed(2)); // $k
window.ECOMM_HIST.salesK  = y => y.net_revenue.map(r => +(r/1000).toFixed(2));                                                      // $k
window.ECOMM_HIST.mearX   = y => y.net_revenue.map((r,i)=> +(r / y.ad_spend[i]).toFixed(2));                                        // x
