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
  curl -sL "https://sendtob.github.io/2bb-metrics-dashboard/ecomm.html" -o "backups/ecomm_${DATE}.html"
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
