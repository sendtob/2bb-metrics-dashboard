# ✅ v8 DEPLOYED 2026-08-11, 12:28 PM — writes are OPEN, and saving is finally proven

**No passcode any more.** Saving was failing, and the gate wasn't worth what it
cost: this holds a weekly progress read and a set of counts, and reads were always
public. Server side that's `REQUIRE_PASS = false` near the top of the `.gs` —
**flip it to true and the gate is back**, since `WRITE_PASS` is still in Script
properties and `passOk_` is untouched. Client side the prompt and the passcode
link are gone.

Say the consequence out loud so it isn't a surprise later: the `/exec` URL is in a
public repo, so **anyone who finds it can write to the sheet**. The `Log` tab
records every write and Sheets keeps version history, so junk is visible and
revertible rather than silent.

**Saving is verified end to end** — the link that was untested until now:
`?fn=ping` → `{version: 8, requirePass: false}`; a passcode-free `fn=progress`
returned `ok:true` and created row 2; gviz read it back with the week key intact
as the text `2026-08-16`; the test row was then deleted. The `Progress` tab is
back to headers only.

**A third trap, caught live during this deploy** (see the two below): the version
dropdown **stays open after you pick from it**. A triple-click aimed at the
Description field underneath landed on the option list and silently selected
**Version 5** — a two-version rollback, with the dialog looking completely normal.
Read the Version field back from the DOM immediately before clicking Deploy, every
time. Escape does not reliably close the dropdown either; it left the list open
and the dialog up.

---

# ✅ v7 DEPLOYED 2026-08-11, 9:47 AM — and two UI traps that cost most of the time

Version 7 is live on the unchanged `/exec` URL (deployment ID still ends
`…aQYwJGu3A`). Verified: `?fn=ping` → `"version": 7`; `?fn=progress` without a
passcode returns `bad or missing passcode` (so the route exists and is gated, not
`unknown fn`); the `Progress` tab reads clean through gviz with all seven columns;
the live dashboard shows "Live — nothing recorded yet" instead of the amber bar.

**Still owed by a human (one minute):** make the first real save from the
dashboard. That is the only untested link in the chain — it needs the team
passcode typed into the browser prompt, which no automation should be handling.
Tick a box on any pillar, write the sentence, Save. If it lands, a row appears in
the `Progress` tab and the momentum grid colours in.

### TRAP 1 — Apps Script's dropdowns ignore synthetic clicks

Both the **Run function selector** and the **deployment Version selector** are
Material listboxes whose options either render at zero size or swallow coordinate
clicks and keyboard events. The label updates visually while the underlying
selection does **not** change. Two "successful" editor runs of `initProgressTab`
were actually running `doGet` — the Executions page (which lists the real function
name per run) is the only place that tells the truth. The Execution log's
"Execution completed" does not mean your function ran.

What works: dispatch a real pointer sequence at the option element —
`pointerdown → mousedown → pointerup → mouseup → click` — then **verify the field's
text before committing.** This matters most on the Version selector, where a
silent mis-selection redeploys an OLD version and rolls the service back.

### TRAP 2 — pressing Return in the editor starts a debugger

An Enter keystroke aimed at the function dropdown started a **debug session**
paused inside `doGet`, which then blocks the Deploy dialog. The toolbar shows
**Stop** instead of Run when this happens. Click Stop before deploying.

### How the Progress tab actually got created

Not by `fn=progress_init` and not by the editor Run — by hand, because it is four
clicks and zero ambiguity: **+ (add sheet) ▸ rename to `Progress` ▸ paste the
header row.** Note that typing tab characters into a cell puts the whole row in
**one cell**; copy a real TSV line to the clipboard and ⌘V instead, which Sheets
splits into columns.

Hand-creating it is safe because `saveProgress_` sets column A:C to plain text on
**every** write, so the week key stays text no matter how the tab was made.
`fn=progress_init` and `initProgressTab` both still exist and are idempotent.

---

# Deploying v7 (kept for the next redeploy)

The dashboard was rebuilt around a **weekly progress read** instead of per-metric
scoring. Six pillars, four boxes, one required sentence, one priority for next
week. If v7 were ever rolled back, the new `index.html` would load but **not
save** — it says so in an amber bar rather than failing quietly.

### 1. Deploy Apps Script v7

Same rules as always, and the account rule below still bites:

1. Open `https://script.google.com/u/1/home/projects/1u2tx2t7yVqEnUzPWWscmv72NS7LUCOh9SbG_4j4T6oeOLaON3d_EiX4F/edit`
   — **`/u/1` is the 2BB account.** From the personal account the deploy dialog
   fails with a misleading "Something went wrong" (see below).
2. Replace `Code.gs` with `apps-script/2BB-Dashboard-WriteBack.gs` from this repo. Save.
3. **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: "New version" ▸ Deploy.**
   Never "New deployment" — that mints a new URL and everything stops saving.
4. Verify: `…/exec?fn=ping` must return `"version": 7`.

v7 is **strictly additive** — every v6 endpoint is untouched, so the archived
metric dashboard (`goal-tree-archive.html`) keeps saving exactly as before.

### 2. Create the Progress tab

Once, in a browser tab (substituting the passcode):

```
https://script.google.com/macros/s/AKfycbxFYl7yMenuUkVCV9nSDSIvfP0-UnPN-R1NOYVrQM0kRzk8Z2WYtb9JTZBK-aQYwJGu3A/exec?fn=progress_init&pass=YOUR_PASSCODE
```

Expect `{"ok":true,"tab":"Progress","rows":0,"week":"2026-08-16"}`. Idempotent —
running it twice does nothing. (`fn=migrate` also creates it.)

The tab is `week | pillar | state | note | priority | who | when`, one row per
pillar per week, **upserted** — saving again corrects the row rather than adding
a second answer. Column A is deliberately **plain text**: Sheets will happily turn
`2026-08-16` into a date value, and a sheet rendering dates as `16/08/2026` then
hands the dashboard a key it has to guess at.

`state` is one of `regression` · `none` · `little` · `big`. Anything else is
rejected server-side, and a save with no justification sentence is rejected too —
the discipline is enforced in both places, not just in the browser.

### 3. Push the dashboard

`index.html` is committed but **not pushed**. Push it *after* step 1, or the live
site shows the amber can't-save bar to everyone. Note the Monday 07:45
`monday_refresh.sh` auto-commit **will push it for you** if you leave it — so this
is a deadline, not a preference.

### What the team sees

- Six pillar cards, current week by default. Tick one box, write one sentence,
  set next week's priority, Save.
- **Save stays disabled until there's a sentence.** That's on purpose: "Big win"
  with no sentence is worth nothing three months from now.
- Last week's priority and last week's sentence sit at the top of each card, so
  the first thing you read is what you said you'd do.
- ◀ ▶ walk back through past weeks; past weeks stay editable (people log late).
- The Momentum grid is every pillar × every week — the pattern nobody could see
  when this was thirty metrics.
- Personal links still work: `?who=krysta` puts their name on their saves.
- Pillar names and one-liners are the `PILLARS` array at the top of `index.html`.

### Rolling back

`git revert` the rebuild commit — `goal-tree-archive.html` is the old dashboard,
unchanged and still live, so the fallback is a link away rather than a deploy.
The Apps Script rolls back separately (Manage deployments ▸ ✏️ ▸ earlier version);
the Progress tab is inert to v6 and can be left in place.

---

## ✅ v6 deployed 2026-08-04, 10:28 AM — and WHICH ACCOUNT matters

Version 6 is live on the same `/exec` URL (deployment ID unchanged, ending
`…aQYwJGu3A`). Verified: `?fn=ping` returns `version: 6`, and `fn=confirm` on
`b_social` resolved `week: 2026-08-09` with value `14` without creating a
duplicate column.

**Read this before any future redeploy — it cost three failed attempts.**

The Apps Script project is owned by **bradford@twoblindbrothers.com**, not
`sendtobrad@gmail.com`. The personal account can open the editor and *save*
`Code.gs` perfectly well, so everything looks fine — but **Manage deployments**
fails for it. The visible error is a red "Something went wrong, please reload
the page", which reads like Google flakiness and invites pointless retrying. The
real message is underneath that box, and it is **"You do not have permission to
perform this action."**

So: deploy from the 2BB account. Either switch accounts, or go straight to

```
https://script.google.com/u/1/home/projects/<scriptId>/edit
```

`/u/1` is the 2BB account in this Chrome profile (`/u/0` personal, `/u/2`
drakefoundry). Under `/u/1` the dialog opens first try.

**What v6 fixed:** on 2026-08-04 three saves landed within one second, raced the
week-column code, and created a *second* column headed `2026-08-09`. Writes went
to the first, the dashboard displayed the second — so a `14` entered at 6:45 sat
invisible behind a stale `12` from 6:44. The duplicate column was deleted; v6
writes to the LAST column for the week and flushes the new header inside the
lock, so it can't recur.

---

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
4. **Why isn't the paid spend working?** Now verified rather than open: last
   year's near-zero ad spend is real (Northbeam matches Meta's API to the cent).
   Over 14 weeks, last year did **$286K of sales on $44K of ads**; this year is
   **$223K on $100K**. That is the commercial question the dashboard is pointing at.

---

## Rolling back

Everything is in git. `git revert` the rebuild commit and hard-refresh. The Apps
Script rolls back separately via **Manage deployments ▸ ✏️ ▸ Version ▸ (earlier
version)**. Note that v4 headers (ISO dates) are still readable by v3, so a
partial rollback won't corrupt the sheet.
