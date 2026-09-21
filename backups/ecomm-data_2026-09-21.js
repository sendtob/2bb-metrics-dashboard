/* ============================================================================
   Two Blind Brothers — e-comm helpers for the Goal Tree's
   "Commercial Success → Beat last year" goal (index.html).

   NO estimated data lives here. The goal is populated entirely from REAL data
   at runtime, in preference order:
     • margin_yoy.json  — THIS YEAR and LAST YEAR, weekly, built by
                          tools/backfill_margin_yoy.py (Shopify + Northbeam)
     • kpi_history.json — fallback: this year only (the live weekly store)
     • ecomm.html        — fallback: the current week's snapshot

   TWO REVENUE DEFINITIONS (added 2026-07-30). The dashboard and the weekly memo
   disagreed by a consistent ~9% because they quoted different Shopify metrics.
   Both are carried now, and both are shown:

     net_sales      line items after discounts, EXCLUDING shipping and tax.
                    This is what Katie reports in the memo ("$16.4K in net sales")
                    and it is the basis for margin.
     gross_revenue  what the customer actually paid, INCLUDING shipping and tax.
                    This is the number the dashboard used to label "Sales / revenue".

   Margin = net_sales − shipping − ads. Shipping isn't in the feed, so it's
   modelled at shipPct of net sales (margin_yoy.json may override shipPct).
   COGS IS NOT INCLUDED — this is contribution after ads and shipping, not profit.
   All $ figures are DOLLARS; the Goal Tree shows them in $thousands.
============================================================================ */
window.ECOMM_HIST = {
  shipPct: 0.10,
  weeks:  [],   // ISO week-ending Sundays
  labels: [],   // pretty labels, for tooltips
  dates:  [],   // Date objects — the sparkline's real time axis
  thisYear: { net_sales: [], gross_revenue: [], ad_spend: [] },
  lastYear: { net_sales: [], gross_revenue: [], ad_spend: [], ad_spend_ratio: [] }
};
(function(E){
  var num = function(v){ return (v == null || isNaN(v)) ? null : +v; };
  // Contribution after ads and shipping, $k. Null in, null out — a missing week
  // must stay a gap in the line, never a zero.
  E.marginK = function(y){
    return (y.net_sales || []).map(function(r, i){
      var a = num((y.ad_spend || [])[i]), s = num(r);
      return (s == null || a == null) ? null : +(((s * (1 - E.shipPct)) - a) / 1000).toFixed(2);
    });
  };
  E.salesK = function(y){ return (y.net_sales || []).map(function(v){ v = num(v); return v == null ? null : +(v / 1000).toFixed(2); }); };
  E.grossK = function(y){ return (y.gross_revenue || []).map(function(v){ v = num(v); return v == null ? null : +(v / 1000).toFixed(2); }); };
  // MER on the gross basis where available (that's the revenue the spend actually
  // produced, shipping and tax included), falling back to net sales.
  E.mearX = function(y){
    return (y.net_sales || []).map(function(_, i){
      var r = num((y.gross_revenue || [])[i]); if (r == null) r = num((y.net_sales || [])[i]);
      var a = num((y.ad_spend || [])[i]);
      return (r == null || !a) ? null : +(r / a).toFixed(2);
    });
  };
})(window.ECOMM_HIST);
