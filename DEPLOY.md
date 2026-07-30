# Deploying the 2026-07-30 dashboard rebuild

Three steps, about ten minutes. The dashboard already works without them — it just
can't show freshness until step 1 is done, because nothing is recording who
changed what.

---

## 1. Deploy Apps Script v4 (required)

The `.gs` file in this repo is **not** live until you redeploy. Editing it here
changes nothing on its own.

1. Open the goals Sheet ▸ **Extensions ▸ Apps Script**.
2. Replace the contents with `apps-script/2BB-Dashboard-WriteBack.gs` from this repo. Save.
3. **Deploy ▸ Manage deployments ▸ ✏️ (edit) ▸ Version: "New version" ▸ Deploy.**
   Do **not** use "New deployment" — that mints a different URL and the dashboard
   would stop saving.
4. Then visit this once in a browser tab, substituting the passcode:

   `https://script.google.com/macros/s/AKfycbxFYl7yMenuUkVCV9nSDSIvfP0-UnPN-R1NOYVrQM0kRzk8Z2WYtb9JTZBK-aQYwJGu3A/exec?fn=migrate&pass=YOUR_PASSCODE`

   You should get back `{"ok":true,"migrated":4,...}` with a list of ISO week dates.
   It is safe to run more than once.

**What migrate does:** converts the free-text week headers (`Feb 27`, `June 25`,
`July 20`) into real week-ending Sundays (`2026-03-01`, `2026-06-28`, `2026-07-26`),
and creates the `Meta` and `Log` tabs. It does not touch any of your numbers.

**After this**, every save writes to the column for the week it's actually made in,
a new week column opens by itself each Monday, and the `Log` tab starts recording
`when | code | value | action | who | week` — which is what the freshness chips on
the dashboard read.

### What changes for the team
- "Save & Close This Week" is gone. Nobody has to remember to press anything.
- New week columns start **blank** for weekly counts; only running totals carry
  forward. A carried-forward value is *not* logged, so it correctly shows as
  unconfirmed rather than as fresh.
- There's a **✓** button next to every metric: "I checked it, it genuinely didn't
  move." Use it — it's the only thing that distinguishes a stable number from an
  abandoned one.

---

## 2. Fill in the `Meta` tab (5 minutes, high value)

Migrate creates it empty with the header `code | owner | kind | link`. Add a row
per metric to set its owner:

```
code       owner    kind
d_ask      brad
wp_score   katie    run
tb_served  kevin    run
```

- `owner` — lowercase first name. Powers the per-person links.
- `kind` — `run` marks a running total (a drop is then drawn as a correction, not
  a decline). Defaults sensibly from the label if left blank.

Until you fill this in, the dashboard falls back to the default owners baked into
`index.html`, so the per-person links already work.

**Give each person their own link** — they see only their metrics instead of
scrolling past thirty:

- Krysta — `https://sendtob.github.io/2bb-metrics-dashboard/?who=krysta`
- Kevin — `…/?who=kevin`
- Katie — `…/?who=katie`
- Brad — `…/?who=brad`
- Shannen — `…/?who=shannen`

---

## 3. Paste the Product Scorecard link

`index.html` → `SCORECARDS.product.url` is empty, because Katie's Product
Scorecard doc isn't shared with the account that built this. Until it's set, that
row shows "✱ link not set" instead of a link. The Campaign Scorecard is already
wired.

---

## Open decisions (not code — yours to make)

1. **Revenue source of truth.** Krysta's 21 July email asks this metric by metric
   and proposes Northbeam. The dashboard now shows **both** Shopify figures side
   by side — Net sales (matches the memo) and Gross order value (incl. shipping
   and tax) — with Northbeam used for spend and attribution. If you want
   Northbeam attributed revenue as the headline instead, that's a one-line change
   in `tools/backfill_margin_yoy.py`.
2. **Does "contribution" include COGS?** It does not, today. The footer says so
   explicitly. Adding COGS needs a per-SKU cost feed that isn't in the pipeline yet.
3. **Owners for the new Impact metrics** — Thrive Blind (B) and Funding (C) are
   assigned to Kevin by default and have no data. They'll show "No data yet" until
   someone starts entering. That's deliberate: better an honest gap than a zero.
4. **Verify last year's ad spend.** 10 of the last 14 weeks are flagged: last
   year's Northbeam spend is under 40% of this year's for the same week, collapsing
   to $287 the week of Jul 26. If that's a tracking-coverage gap rather than a real
   spending decision, the "Behind last year" verdict is overstated. The last-year
   line is dimmed and annotated until this is checked.

---

## Rolling back

Everything is in git. `git revert` the rebuild commit and hard-refresh. The Apps
Script rolls back separately via **Manage deployments ▸ ✏️ ▸ Version ▸ (earlier
version)**. Note that v4 headers (ISO dates) are still readable by v3, so a
partial rollback won't corrupt the sheet.
