#!/bin/bash
# Two Blind Brothers — weekly metrics backup.
# Snapshots the goals sheet + the ecomm metrics into ./backups/ (dated), then commits.
# Runs from wherever this script lives (local clone or fresh clone), so it's portable.
# This output IS the audit trail: the scheduled task reports what this prints,
# so failures must print loudly — a swallowed error reads as success.

REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO" || exit 1

# Deterministic interpreter. Scheduled runs get a minimal PATH, and the margin
# refresh needs the pipeline deps, which are installed for the system python
# (3.9 user-site). Both tools run fine under it.
PY=/usr/bin/python3

git pull --no-rebase -X ours --no-edit -q 2>/dev/null || echo "git pull failed — continuing with local state"
mkdir -p backups
DATE="$(date +%Y-%m-%d)"

# --- Goals metrics: the live team sheet (public, gviz CSV) ---
GOALS_ID="1tvvGwAdkTx8Kzk91RMrUgGVV8fedHAmdgfy35rSpr6w"
if curl -sL --fail "https://docs.google.com/spreadsheets/d/${GOALS_ID}/gviz/tq?tqx=out:csv" -o "backups/goals_${DATE}.csv.tmp"; then
  mv "backups/goals_${DATE}.csv.tmp" "backups/goals_${DATE}.csv"
  echo "goals snapshot saved"
else
  rm -f "backups/goals_${DATE}.csv.tmp"
  echo "goals snapshot FAILED (sheet not reachable) — skipped this week"
fi

# --- Ecomm metrics ---
# Once the WBR KPI Sheet ID is set in ecomm.html, set ECOMM_ID below and this grabs its CSV.
# Until then, archive the deployed ecomm dashboard (its SNAPSHOT holds the latest week's data).
ECOMM_ID=""
if [ -n "$ECOMM_ID" ]; then
  curl -sL --fail "https://docs.google.com/spreadsheets/d/${ECOMM_ID}/gviz/tq?tqx=out:csv" -o "backups/ecomm_${DATE}.csv" \
    || echo "ecomm sheet snapshot FAILED — skipped this week"
else
  cp ecomm.html "backups/ecomm_${DATE}.html"   # ecomm data is hard-coded in ecomm.html — snapshot the source file
fi

# --- Goal Tree's e-comm net-margin history (feeds the "Beat last year" goal) ---
cp ecomm-data.js "backups/ecomm-data_${DATE}.js" 2>/dev/null || true

# --- Publish the WBR KPI history the dashboards read (captures this week, grows the store) ---
if "$PY" tools/publish_kpi_history.py; then
  cp kpi_history.json "backups/kpi_history_${DATE}.json" 2>/dev/null || true
  git add kpi_history.json
else
  echo "kpi history publish FAILED — repo copy left as-is"
fi

# --- Refresh the YoY net-margin the Goal Tree's "Beat last year" reads ---
# Re-pulls the latest completed week + the same week last year (Shopify + Northbeam) and
# rolls the 14-week window forward. Best-effort: a failed pull never blocks the backup, and
# margin_yoy.json keeps its last good data. Log kept (and committed) only on failure.
MLOG="backups/margin_refresh_${DATE}.log"
if "$PY" tools/backfill_margin_yoy.py > "$MLOG" 2>&1; then
  rm -f "$MLOG"
  cp margin_yoy.json "backups/margin_yoy_${DATE}.json" 2>/dev/null || true
  git add margin_yoy.json
  echo "margin_yoy refreshed (week ending $("$PY" -c "import json;print(json.load(open('margin_yoy.json'))['generated_for'])" 2>/dev/null))"
else
  echo "margin_yoy refresh FAILED — last good data kept; tail of $MLOG:"
  tail -5 "$MLOG" | sed 's/^/    /'
fi

# --- Store it (cloud-durable via the repo; falls back to local if push can't auth) ---
git add backups/
if git diff --cached --quiet; then
  echo "no new changes to back up for ${DATE}"
else
  if git commit -q -m "Weekly metrics backup ${DATE}"; then
    git pull --no-rebase -X ours --no-edit -q 2>/dev/null || true
    if git push -q 2>&1; then echo "pushed"; else echo "PUSH FAILED — backup committed locally only; next run will retry the push"; fi
  else
    echo "GIT COMMIT FAILED:"
    git status --short | head -8
  fi
fi
echo "Backup ${DATE} complete — $(ls backups | grep -c "${DATE}") file(s) this run, $(ls backups | wc -l | tr -d ' ') total in backups/"
