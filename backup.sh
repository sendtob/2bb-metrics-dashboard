#!/bin/bash
# Two Blind Brothers — weekly metrics backup.
# Snapshots the goals sheet + the ecomm metrics into ./backups/ (dated), then commits.
# Runs from wherever this script lives (local clone or fresh clone), so it's portable.

REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO" || exit 1

git pull --no-rebase -X ours --no-edit -q 2>/dev/null || true
mkdir -p backups
DATE="$(date +%Y-%m-%d)"

# --- Goals metrics: the live team sheet (public, gviz CSV) ---
GOALS_ID="1tvvGwAdkTx8Kzk91RMrUgGVV8fedHAmdgfy35rSpr6w"
curl -sL "https://docs.google.com/spreadsheets/d/${GOALS_ID}/gviz/tq?tqx=out:csv" -o "backups/goals_${DATE}.csv"

# --- Ecomm metrics ---
# Once the WBR KPI Sheet ID is set in ecomm.html, set ECOMM_ID below and this grabs its CSV.
# Until then, archive the deployed ecomm dashboard (its SNAPSHOT holds the latest week's data).
ECOMM_ID=""
if [ -n "$ECOMM_ID" ]; then
  curl -sL "https://docs.google.com/spreadsheets/d/${ECOMM_ID}/gviz/tq?tqx=out:csv" -o "backups/ecomm_${DATE}.csv"
else
  cp ecomm.html "backups/ecomm_${DATE}.html"   # ecomm data is hard-coded in ecomm.html — snapshot the source file
fi

# --- Goal Tree's e-comm net-margin history (feeds the "Beat last year" goal) ---
cp ecomm-data.js "backups/ecomm-data_${DATE}.js" 2>/dev/null || true

# --- Publish the WBR KPI history the dashboards read (captures this week, grows the store) ---
if python3 tools/publish_kpi_history.py; then
  cp kpi_history.json "backups/kpi_history_${DATE}.json" 2>/dev/null || true
  git add kpi_history.json
else
  echo "kpi history publish skipped"
fi

# --- Store it (cloud-durable via the repo; falls back to local if push can't auth) ---
git add backups/
if git commit -q -m "Weekly metrics backup ${DATE}" 2>/dev/null; then
  git pull --no-rebase -X ours --no-edit -q 2>/dev/null || true
  git push -q 2>/dev/null && echo "pushed" || echo "push skipped — backup saved locally in backups/"
else
  echo "no new changes to back up for ${DATE}"
fi
echo "Backup ${DATE} complete — $(ls backups | grep -c "${DATE}") file(s) this run, $(ls backups | wc -l | tr -d ' ') total in backups/"
