/* ============================================================================
   Two Blind Brothers — e-comm history that feeds the Goal Tree's
   "Commercial Success → Beat last year, every month" goal (index.html).

   WHY THIS FILE EXISTS
   The net-margin-vs-last-year goal shouldn't be hand-typed into the team sheet —
   it's already measured by the e-comm WBR. So index.html pulls it from here:
     • CURRENT week  -> read live from ecomm.html (its SNAPSHOT / WBR sheet).
     • Prior weeks   -> the "thisYear" arrays below.
     • Last year     -> the "lastYear" arrays below (the baseline to beat).

   The prior-week and last-year numbers are an ESTIMATED fill — there's no real
   per-week history store wired up yet. When the WBR KPI history Sheet is
   connected (the one ecomm.html is built to read), swap these arrays for it and
   the goal becomes fully live, end to end.

   DEFINITIONS (Brad's)
     Net margin = net_revenue − ad_spend − shipping    (agnostic to new vs returning)
     MEAR       = net_revenue ÷ ad_spend                (this is e-comm's `mer`)
   Shipping isn't in the e-comm feed, so we estimate it at shipPct of revenue.
   All $ figures below are in DOLLARS. The Goal Tree displays them in $thousands.
============================================================================ */
window.ECOMM_HIST = {
  shipPct: 0.10,   // estimated shipping as a share of net revenue — tune to taste

  // 14-week window. The last label is replaced by ecomm.html's period_end at runtime.
  weeks: ["Feb 28","Mar 7","Mar 14","Mar 21","Mar 28","Apr 4","Apr 11","Apr 18",
          "Apr 25","May 2","May 9","May 16","May 23","May 31"],

  // THIS YEAR — the last entry is a fallback for the current week and gets
  // overwritten live from ecomm.html (net_revenue 15,509 / ad_spend 7,831 today).
  thisYear: {
    net_revenue: [13200,13800,12600,14100,14800,13500,15600,14700,16400,15100,17200,18100,16900,15509],
    ad_spend:    [ 7100, 7300, 6900, 7400, 7600, 7200, 7900, 7500, 8100, 7700, 8400, 8600, 8200, 7831],
    returning:   [  118,  124,  112,  131,  138,  126,  149,  140,  158,  146,  170,  179,  165,  152]
  },

  // LAST YEAR — same calendar weeks, the baseline to beat.
  lastYear: {
    net_revenue: [11800,12300,11500,12700,13100,12200,13700,12900,14300,13400,14900,15400,15100,16100],
    ad_spend:    [ 6500, 6700, 6300, 6800, 7000, 6600, 7200, 6900, 7400, 7100, 7600, 7800, 7700, 8000],
    returning:   [  104,  108,  101,  112,  116,  108,  123,  116,  128,  120,  131,  136,  134,  139]
  }
};

// Derived series, returned in the units the Goal Tree wants.
window.ECOMM_HIST.marginK = y => y.net_revenue.map((r,i)=> +((r*(1-window.ECOMM_HIST.shipPct) - y.ad_spend[i]) / 1000).toFixed(2)); // $k
window.ECOMM_HIST.salesK  = y => y.net_revenue.map(r => +(r/1000).toFixed(2));                                                      // $k
window.ECOMM_HIST.mearX   = y => y.net_revenue.map((r,i)=> +(r / y.ad_spend[i]).toFixed(2));                                        // x
