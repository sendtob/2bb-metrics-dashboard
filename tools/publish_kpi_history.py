#!/usr/bin/env python3
"""
Publish the WBR KPI history for the dashboards.

Builds  <dashboard-repo>/kpi_history.json  (an array, oldest -> newest) that both
index.html ("Beat last year") and ecomm.html fetch. Run weekly by backup.sh.

It MERGES, by ISO period_end (one row per week), from three sources — later
sources win for the same week:

  1. the existing kpi_history.json          (durable: never lose a captured week)
  2. ecomm.html's SNAPSHOT                   (the current week, refreshed weekly by the user)
  3. the WBR pipeline's kpi_history.jsonl    (authoritative, structured — wins)

Because #2 captures the current week every run, the history GROWS one real row per
week from the weekly snapshot alone — even before the pipeline's own append exists.
When the pipeline does append to kpi_history.jsonl, those rows take over (#3 wins).

Idempotent. Safe to run any number of times.
"""
import json, re, os, glob, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))            # the dashboard repo root
OUT  = os.path.join(REPO, "kpi_history.json")
ECOMM = os.path.join(REPO, "ecomm.html")

# Where the WBR pipeline writes its scorecard history (both known clones).
PIPELINE_GLOBS = [
    os.path.expanduser("~/Documents/GitHub/tbb-wbr-pipeline/output/**/scorecard/kpi_history.jsonl"),
    os.path.expanduser("~/Documents/Claude KB Project/code/pipelines/output/**/scorecard/kpi_history.jsonl"),
]

# KPI keys we publish (mirror ecomm.html SPECS / the pipeline row).
KEYS = ["net_revenue","orders","aov","new_customers","sessions","conversion_rate",
        "meta_spend","meta_conversions","meta_cpa","meta_roas",
        "email_campaigns","email_open_rate","email_click_rate","email_revenue","sms_revenue",
        "ad_spend","roas","mer","cac"]


def iso(d):
    """Normalize a period_end ('2026-05-31' or 'May 31, 2026') to ISO 'YYYY-MM-DD'."""
    d = (d or "").strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", d):
        return d
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.datetime.strptime(d, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return d  # leave as-is if unparseable


def load_existing():
    if not os.path.exists(OUT):
        return []
    try:
        data = json.load(open(OUT))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def from_ecomm_snapshot():
    """Parse the current week out of ecomm.html's SNAPSHOT (values block)."""
    if not os.path.exists(ECOMM):
        return []
    html = open(ECOMM).read()
    block = re.search(r"const SNAPSHOT\s*=\s*\{(.*?)\};", html, re.S)
    if not block:
        return []
    body = block.group(1)
    pe = re.search(r'period_end:\s*"([^"]+)"', body)
    vals = re.search(r"values:\s*\{(.*?)\}", body, re.S)
    if not pe or not vals:
        return []
    row = {"period_end": pe.group(1), "source": "ecomm_snapshot"}
    for k, v in re.findall(r"(\w+)\s*:\s*(-?[\d.]+)", vals.group(1)):
        if k in KEYS:
            row[k] = float(v)
    return [row]


def from_pipeline():
    rows = []
    for g in PIPELINE_GLOBS:
        for f in glob.glob(g, recursive=True):
            try:
                for line in open(f):
                    line = line.strip()
                    if not line:
                        continue
                    r = json.loads(line)
                    r["source"] = "pipeline"
                    rows.append(r)
            except (json.JSONDecodeError, OSError):
                pass
    return rows


def main():
    by_week = {}
    # low -> high priority; later updates overwrite shared keys for the same week
    for r in load_existing() + from_ecomm_snapshot() + from_pipeline():
        wk = iso(r.get("period_end"))
        if not wk:
            continue
        merged = dict(by_week.get(wk, {}))
        merged.update({k: v for k, v in r.items() if v is not None})
        merged["period_end"] = wk
        by_week[wk] = merged

    hist = [by_week[k] for k in sorted(by_week)]
    json.dump(hist, open(OUT, "w"), indent=0)
    print(f"kpi_history.json: {len(hist)} week(s) -> {OUT}")
    if hist:
        srcs = {h.get("source", "?") for h in hist}
        print("  weeks :", ", ".join(h["period_end"] for h in hist))
        print("  source:", ", ".join(sorted(srcs)))


if __name__ == "__main__":
    main()
