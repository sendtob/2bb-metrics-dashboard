"""Refresh weekly commercial history (this year + last year) for the Goal Tree's
"Beat last year" goal, and write margin_yoy.json into the dashboard repo.

Monday->Sunday weeks, keyed by the week-ending Sunday (ISO), which is the same
anchor the goal sheet now uses — one clock for the whole dashboard.

TWO REVENUE NUMBERS, DELIBERATELY (2026-07-30)
----------------------------------------------
The dashboard and the weekly memo disagreed by a consistent ~9% because they
were quoting different Shopify metrics. Both are now published side by side:

  gross_revenue  = sum(current_total_price)      what the customer paid:
                                                 INCLUDES shipping charged + sales tax,
                                                 net of refunds/edits/cancellations.
  net_sales      = sum(current_subtotal_price)   line items after discounts, and
                                                 EXCLUDING shipping + tax. This is the
                                                 figure Katie reports in the weekly memo
                                                 ("$16.4K in net sales").

  gross - tax - shipping == net_sales            (verified exactly, week of Jul 20-26:
                                                  17,897.13 - 760.90 - 570.36 = 16,565.87)

Margin is computed from NET SALES, because shipping revenue shouldn't be
counted as margin and then have shipping cost modelled off it as well.
NOTE: COGS is still NOT included — see the `margin_basis` field. This is
"contribution after ads and shipping", not profit.

CLOSED WEEKS ARE FROZEN
-----------------------
Shopify's current_total_price restates downward as refunds land against old
orders: week ending Jul 19 read 17,233 on Jul 20, 17,022 on Jul 27, and 16,648
on Jul 30. Recomputing every week meant the history silently rewrote itself.
Now: once a week is complete it is written into `frozen` and never recomputed.
Only the in-progress week refreshes. Delete the `frozen` block to force a
full rebuild.

Run with the pipeline's Python (has creds + deps): /usr/bin/python3 this.py
"""
import sys, os, json
from datetime import datetime, timedelta

LIVE = "/Users/bradfordmanning/Documents/Claude KB Project/code/pipelines"
sys.path.insert(0, LIVE); os.chdir(LIVE)
from extractors.shopify import ShopifyExtractor
from extractors.northbeam import NorthbeamExtractor

sh = ShopifyExtractor(entity="Two Blind Brothers")
nb = NorthbeamExtractor(entity="Two Blind Brothers")
OUT = "/Users/bradfordmanning/Documents/2bb-dashboard/margin_yoy.json"
N_WEEKS = 14
SHIP_PCT = 0.10
MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# Most recently COMPLETED Sunday (if today is Sunday, use last week's).
_t = datetime.utcnow()
_off = (_t.weekday() + 1) % 7 or 7          # Mon->1 ... Sat->6, Sun->7
LATEST_SUNDAY = (_t - timedelta(days=_off)).replace(hour=0, minute=0, second=0, microsecond=0)


def load_prior():
    try:
        with open(OUT) as f:
            return json.load(f)
    except Exception:
        return {}


PRIOR = load_prior()
FROZEN = dict(PRIOR.get("frozen") or {})


def shopify_week(mon, next_mon):
    """Both revenue definitions for one Mon..Sun week. Shopify's created_at_max
    is exclusive, so next_mon 00:00 closes the Sunday."""
    try:
        r = sh.extract_orders(start_date=mon, end_date=next_mon)
        orders = [o for o in (r.get("orders") or []) if not o.get("cancelled_at")]
        num = lambda o, k: float(o.get(k) or 0)
        gross = sum(num(o, "current_total_price") for o in orders)
        net   = sum(num(o, "current_subtotal_price") for o in orders)
        tax   = sum(num(o, "current_total_tax") for o in orders)
        ship  = sum(sum(float(s.get("price") or 0) for s in (o.get("shipping_lines") or []))
                    for o in orders)
        return {"gross_revenue": round(gross, 2), "net_sales": round(net, 2),
                "tax": round(tax, 2), "shipping_charged": round(ship, 2),
                "orders": len(orders)}
    except Exception as ex:
        print("   shopify err", mon.date(), ex)
        return None


def northbeam_spend(mon, sun):
    """Northbeam period_ending_at is inclusive -> end = the Sunday."""
    try:
        recs = nb.extract_channel_performance(start_date=mon, end_date=sun)
        if isinstance(recs, dict):
            return round(float(recs.get("totals", {}).get("total_spend") or 0), 2)
        return round(sum(nb._extract_numeric(r.get("spend")) or 0 for r in recs), 2)
    except Exception as ex:
        print("   northbeam err", mon.date(), ex)
        return None


def seed_from_legacy():
    """First run on the new format: reuse ad spend (and last-year revenue) from the
    previous margin_yoy.json instead of re-hitting Northbeam 28 times. Spend does
    not restate, so this is safe — and it keeps this migration cheap."""
    if FROZEN or not PRIOR.get("weeks"):
        return {}
    anchor = PRIOR.get("generated_for")
    if not anchor:
        return {}
    try:
        end = datetime.strptime(anchor, "%Y-%m-%d")
    except Exception:
        return {}
    weeks = PRIOR["weeks"]
    ty, ly = PRIOR.get("thisYear", {}), PRIOR.get("lastYear", {})
    seed = {}
    for i in range(len(weeks)):
        sun = end - timedelta(weeks=(len(weeks) - 1 - i))
        pick = lambda o, k: (o.get(k) or [None] * len(weeks))[i]
        seed[sun.strftime("%Y-%m-%d")] = {
            "ty_ad_spend": pick(ty, "ad_spend"),
            "ly_ad_spend": pick(ly, "ad_spend"),
        }
    return seed


SEED = seed_from_legacy()
if SEED:
    print("seeded ad spend for %d weeks from the previous file (no Northbeam calls)" % len(SEED))

weeks, rows = [], []
for i in range(N_WEEKS - 1, -1, -1):
    sun = LATEST_SUNDAY - timedelta(weeks=i)
    key = sun.strftime("%Y-%m-%d")
    mon, nmon = sun - timedelta(days=6), sun + timedelta(days=1)
    sun2, mon2, nmon2 = (sun - timedelta(days=364), mon - timedelta(days=364),
                         nmon - timedelta(days=364))

    if key in FROZEN:
        rec = FROZEN[key]
        print("%s: frozen" % key)
    else:
        ty = shopify_week(mon, nmon) or {}
        ly = shopify_week(mon2, nmon2) or {}
        seed = SEED.get(key, {})
        ty_ad = seed.get("ty_ad_spend")
        ly_ad = seed.get("ly_ad_spend")
        if ty_ad is None:
            ty_ad = northbeam_spend(mon, sun)
        if ly_ad is None:
            ly_ad = northbeam_spend(mon2, sun2)
        rec = {
            "thisYear": {**ty, "ad_spend": ty_ad},
            "lastYear": {**ly, "ad_spend": ly_ad},
        }
        print("%s: TY net=%s ad=%s | LY net=%s ad=%s"
              % (key, ty.get("net_sales"), ty_ad, ly.get("net_sales"), ly_ad), flush=True)
        # Freeze it only once the week is actually over.
        if sun < LATEST_SUNDAY or sun == LATEST_SUNDAY:
            FROZEN[key] = rec

    weeks.append(key)
    rows.append(rec)


def series(side, field):
    out = []
    for r in rows:
        v = (r.get(side) or {}).get(field)
        out.append(None if v is None else round(float(v), 2))
    return out


def margin_k(side):
    """Contribution after ads and shipping, in $ thousands. Built from NET SALES
    (shipping revenue excluded) so shipping isn't both counted and charged."""
    out = []
    for r in rows:
        s = r.get(side) or {}
        n, a = s.get("net_sales"), s.get("ad_spend")
        out.append(None if (n is None or a is None)
                   else round((float(n) * (1 - SHIP_PCT) - float(a)) / 1000, 2))
    return out


ty_ad, ly_ad = series("thisYear", "ad_spend"), series("lastYear", "ad_spend")

# Last year's spend really was near zero for most of this window, and that is
# NOT a data gap. Verified 2026-07-30 against Meta's own API, which matches
# Northbeam's facebook figure to the cent:
#     w/e 2025-04-27  Northbeam fb 5,276.25  |  Meta 5,276.25
#     w/e 2025-07-27  Northbeam fb     0.30  |  Meta     0.30
# So 2BB genuinely paused Meta spend from around mid-May 2025 through the
# summer. The year-over-year comparison is real, and it is unflattering:
# last year did MORE revenue on LESS ad spend. Do not explain it away.
# The ratio is published so the chart can say so plainly.
ly_spend_ratio = [
    (None if (t is None or l is None or not t) else round(l / t, 3))
    for t, l in zip(ty_ad, ly_ad)
]

payload = {
    "weeks": weeks,                                            # ISO week-ending Sundays
    "labels": [MO[datetime.strptime(w, "%Y-%m-%d").month - 1] + " "
               + str(datetime.strptime(w, "%Y-%m-%d").day) for w in weeks],
    "shipPct": SHIP_PCT,
    "margin_basis": "net_sales * (1 - shipPct) - ad_spend  |  COGS NOT included",
    "revenue_note": ("gross_revenue includes shipping + tax (what the dashboard used to show); "
                     "net_sales excludes both and matches the weekly memo"),
    "thisYear": {
        "net_sales":     series("thisYear", "net_sales"),
        "gross_revenue": series("thisYear", "gross_revenue"),
        "ad_spend":      ty_ad,
        "tax":           series("thisYear", "tax"),
        "shipping_charged": series("thisYear", "shipping_charged"),
        "orders":        series("thisYear", "orders"),
        "net_revenue":   series("thisYear", "gross_revenue"),   # back-compat alias
        "margin_k":      margin_k("thisYear"),
    },
    "lastYear": {
        "net_sales":     series("lastYear", "net_sales"),
        "gross_revenue": series("lastYear", "gross_revenue"),
        "ad_spend":      ly_ad,
        "net_revenue":   series("lastYear", "gross_revenue"),   # back-compat alias
        "margin_k":      margin_k("lastYear"),
        "ad_spend_ratio_vs_this_year": ly_spend_ratio,
        "ad_spend_verified": "Cross-checked against Meta Ads API 2026-07-30; Northbeam matches to the cent. The near-zero 2025 spend is real, not a tracking gap.",
    },
    "generated_for": LATEST_SUNDAY.strftime("%Y-%m-%d"),
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "frozen": FROZEN,
}

with open(OUT, "w") as f:
    json.dump(payload, f, indent=0)
_ty = sum(v for v in ty_ad if v) or 0
_ly = sum(v for v in ly_ad if v) or 0
print("WROTE", OUT, "for week ending", LATEST_SUNDAY.strftime("%Y-%m-%d"),
      "| ad spend this year %.0f vs last year %.0f (%.0f%%)" % (_ty, _ly, (_ly / _ty * 100) if _ty else 0),
      flush=True)
