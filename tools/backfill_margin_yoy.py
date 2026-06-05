"""Refresh real weekly net margin (this year + last year) for the Goal Tree's
"Beat last year" goal, and write margin_yoy.json into the dashboard repo.

Source: Shopify total_revenue + Northbeam ad spend (canonical/fixed extractors),
Monday->Sunday weeks. Rolling N_WEEKS window ending at the most recently COMPLETED
Sunday — so re-running it each week rolls the window forward automatically.

Boundaries: Shopify created_at_max is exclusive -> end = next Monday 00:00 (=Mon..Sun).
Northbeam period_ending_at is inclusive -> end = the Sunday (=Mon..Sun). Same 7-day week.
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
MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# Most recently COMPLETED Sunday (if today is Sunday, use last week's).
_t = datetime.utcnow()
_off = (_t.weekday() + 1) % 7 or 7          # Mon->1 ... Sat->6, Sun->7
LATEST_SUNDAY = (_t - timedelta(days=_off)).replace(hour=0, minute=0, second=0, microsecond=0)

def rev(mon, next_mon):            # Shopify [Mon 00:00, next-Mon 00:00) = Mon..Sun
    try:
        r = sh.extract_orders(start_date=mon, end_date=next_mon)
        summ = r.get("summary", {}) if isinstance(r, dict) else {}
        return round(float(summ.get("total_revenue") or 0), 2)
    except Exception as ex:
        print("   shopify err", mon.date(), ex); return None

def spend(mon, sun):              # Northbeam [Mon, Sun] inclusive = Mon..Sun
    try:
        recs = nb.extract_channel_performance(start_date=mon, end_date=sun)
        if isinstance(recs, dict):          # tolerate either interface
            return round(float(recs.get("totals", {}).get("total_spend") or 0), 2)
        return round(sum(nb._extract_numeric(r.get("spend")) or 0 for r in recs), 2)
    except Exception as ex:
        print("   northbeam err", mon.date(), ex); return None

weeks=[]; tyr=[]; tya=[]; lyr=[]; lya=[]
for i in range(N_WEEKS-1, -1, -1):
    sun = LATEST_SUNDAY - timedelta(weeks=i)
    mon, nmon = sun - timedelta(days=6), sun + timedelta(days=1)
    sun2, mon2, nmon2 = sun-timedelta(days=364), mon-timedelta(days=364), nmon-timedelta(days=364)
    lbl = f"{MO[sun.month-1]} {sun.day}"; weeks.append(lbl)
    tr=rev(mon,nmon); ta=spend(mon,sun); lr=rev(mon2,nmon2); la=spend(mon2,sun2)
    tyr.append(tr); tya.append(ta); lyr.append(lr); lya.append(la)
    tm = round((tr*0.9-ta)/1000,1) if (tr is not None and ta is not None) else None
    lm = round((lr*0.9-la)/1000,1) if (lr is not None and la is not None) else None
    print(f"{lbl}: TY rev={tr} ad={ta} margin={tm}k | LY rev={lr} ad={la} margin={lm}k", flush=True)

json.dump({"weeks":weeks, "shipPct":0.10,
           "thisYear":{"net_revenue":tyr, "ad_spend":tya},
           "lastYear":{"net_revenue":lyr, "ad_spend":lya},
           "generated_for": LATEST_SUNDAY.strftime("%Y-%m-%d")}, open(OUT,"w"), indent=0)
print("WROTE", OUT, "for week ending", LATEST_SUNDAY.strftime("%Y-%m-%d"), flush=True)
