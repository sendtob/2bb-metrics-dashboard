#!/bin/bash
# Monday-morning refresh — makes the dashboards fresh BEFORE the 9am meeting.
#
# 1. Ensure this week's cloud WBR ran (the GitHub cron targets 04:43 ET but
#    GitHub fires repo crons 1.7–6h late in practice; a workflow_dispatch
#    starts within seconds, so we trigger one if the cron hasn't landed yet).
#    "Ran" means a successful run-wbr JOB — the off-DST cron's gate-skip run
#    is a workflow-level "success" with run-wbr skipped, and doesn't count.
# 2. Run backup.sh: goals snapshot, kpi_history publish, margin_yoy refresh,
#    commit + push (GitHub Pages redeploys the dashboards).
#
# Output is the audit trail — the scheduled task reports what this prints.

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="sendtob/tbb-wbr-pipeline"

GH="$(command -v gh)"
if [ -z "$GH" ]; then
  for p in /opt/homebrew/bin/gh /usr/local/bin/gh; do [ -x "$p" ] && GH="$p" && break; done
fi

TODAY="$(date -u +%Y-%m-%d)"   # run timestamps are UTC

run_ok_today() {
  local ids id
  ids=$("$GH" run list -R "$REPO" --workflow weekly-wbr.yml --status success --limit 10 \
        --json databaseId,createdAt -q ".[] | select(.createdAt >= \"${TODAY}T00:00:00Z\") | .databaseId" 2>/dev/null)
  for id in $ids; do
    if "$GH" run view "$id" -R "$REPO" --json jobs \
         -q '.jobs[] | select(.name=="run-wbr") | .conclusion' 2>/dev/null | grep -q '^success$'; then
      return 0
    fi
  done
  return 1
}

active_run_today() {
  "$GH" run list -R "$REPO" --workflow weekly-wbr.yml --limit 10 --json status,createdAt \
    -q ".[] | select(.createdAt >= \"${TODAY}T00:00:00Z\") | select(.status==\"queued\" or .status==\"in_progress\") | .status" 2>/dev/null | head -1
}

if [ -z "$GH" ]; then
  echo "cloud WBR: gh CLI not found — skipping the cloud check (backup still runs)"
elif run_ok_today; then
  echo "cloud WBR: already succeeded today"
else
  if [ -n "$(active_run_today)" ]; then
    echo "cloud WBR: a run is already queued/in progress — waiting for it"
  else
    echo "cloud WBR: no run yet today — dispatching one now"
    "$GH" workflow run weekly-wbr.yml -R "$REPO" 2>&1 || echo "cloud WBR: dispatch FAILED — continuing with last week's cloud data"
  fi
  DEADLINE=$((SECONDS + 1080))   # 18 min: dispatch latency + ~6 min run + slack
  while ! run_ok_today; do
    if [ "$SECONDS" -ge "$DEADLINE" ]; then
      echo "cloud WBR: no successful run after 18 min — continuing; the Sheet will update when it lands (check the Actions tab if this repeats)"
      break
    fi
    sleep 30
  done
  run_ok_today && echo "cloud WBR: succeeded"
fi

bash "$HERE/backup.sh"
