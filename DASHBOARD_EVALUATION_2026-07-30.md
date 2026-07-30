# 2BB Goal Dashboard — Evaluation & Rebuild Plan
**Date:** 2026-07-30 · **Scope:** goal tree (`index.html`), goals Sheet, ecomm reconciliation vs the weekly memo

> **Status: built.** Everything in §7 "First" and "Second" is implemented, plus the
> Impact rebuild and the scorecard links. See [DEPLOY.md](DEPLOY.md) for the three
> steps needed to switch it on (deploy Apps Script v4, run `?fn=migrate`, fill the
> `Meta` tab). The findings below are kept as written so the reasoning is auditable.
>
> One defect was found *during* the build and is also fixed: **closed weeks were
> silently restating.** Week ending Jul 19 read $17,233 on Jul 20, $17,022 on
> Jul 27 and $16,648 on Jul 30, as refunds landed against the original orders.
> History now freezes once a week is complete.

---

## Bottom line

The dashboard is a good *display* layer sitting on a data layer that can't support what you're asking it to do. Five things are structurally wrong, in priority order:

1. **The week column is not a date.** It's "a column someone created when they clicked Save." Cadence has been 27 days → 4 days → 21 days. Every trend line on the page is therefore a lie about time.
2. **Blank and zero are the same value.** 13 of the 18 columns are pure zeros nobody ever entered. The sparklines render a flat line at 0 from Feb 27 → May 22 as if it were measured.
3. **Nothing records who updated what, when.** So "what's stale" is unanswerable by construction, not just unshown.
4. **The Impact goals measure PR activity, not impact.** They predate Thrive Blind and contain zero program, beneficiary, or fundraising metrics — the entire Programs & Development pillar of Krysta's strategy doc is missing.
5. **Ecom numbers disagree with the memo by a consistent ~9%,** and it's a definitional gap (three different "revenue" numbers are in circulation), not a bug. Krysta asked about exactly this on July 21 and hasn't had an answer.

None of this requires perfection to fix. It requires the sheet to store **dates, blanks, and authorship** — everything else follows from that.

---

## 1. Entering data is harder than it should be

**What the live state actually shows** (read from the Sheet, 2026-07-30):

| | |
|---|---|
| Header says | "Week of **July 20**" |
| Last completed week is | July 26 |
| Ecomm block on the same page shows | week ending **July 26** |
| Columns with any real data | 4 of 18 (May 29, June 25, June 29, July 20) |

The page is showing two different clocks side by side, and the goal-tree clock is 10 days behind.

**Why entry is painful:**

- **One shared passcode, one undifferentiated form.** Every teammate sees all 31 metrics and has to find their own. There is no owner field anywhere in the sheet, so there is no way to give Katie a link that shows Katie's six metrics.
- **"Save & Close This Week" is a manual, one-way, destructive-feeling button** that one person has to remember to press. It has been pressed roughly four times since February. When it isn't pressed, everyone's edits overwrite the *same* column — so a Katie edit on July 30 silently lands in the "July 20" bucket.
- **Carry-forward hides absence.** `saveWeek_()` copies last week's values into the new column. Combined with running totals, a metric that nobody touched is indistinguishable from a metric someone deliberately confirmed as unchanged. Most of this dashboard is currently the former, displayed as the latter.
- **Single-field saves are fire-and-forget** (`mode:"no-cors"`) — the browser cannot read the response, so a rejected write looks identical to a successful one until you click the master Save.
- **Five rows in the sheet are dead.** `c_nm`, `c_nm_vs`, `c_mear`, `c_ret`, `c_sales` are all zeros and are always overwritten at render time from `margin_yoy.json`. Two of them (`c_nm_vs`, `c_ret`) aren't displayed anywhere at all. Anyone who types into those rows is typing into the void.
- **Correction vs. movement is indistinguishable.** `b_social` (a *running total*) went 11 → 10 between the last two columns and the dashboard renders a red ▼ "down vs last week." A running total cannot decrease; that was a correction being displayed as a trend.

### What to build

**A. Per-person entry links.** Add an `owner` column to the sheet. `index.html?who=katie` renders only that person's rows, single-column, mobile-first. Keep the passcode, but people stop scrolling past 25 metrics that aren't theirs.

**B. Kill "Save & Close This Week."** The current ISO week should be resolved from the clock, not from a button. `saveValue_` looks up (or creates) the column whose header is this week's Monday date and writes there. The week rolls at Monday 00:00 ET whether or not anyone remembers.

**C. Add "Confirm — no change this week."** One button per metric that stamps `(value, timestamp, who)` without changing the number. This is the single highest-value addition on the list: it's what separates "still 7, verified Tuesday" from "7 because nobody has looked since June."

**D. Write blanks as blanks.** `saveValue_` currently coerces empty to `""` but the gviz reader turns every empty cell into `0`. Fix the reader (`index.html:419`) to emit `null`, and render gaps as gaps.

**E. Aggregate into the memo automatically.** The memo already exists and the team already fills it. Generate a goal digest from the Sheet each Monday morning — "what moved, what didn't, what's stale" — and drop it into the memo doc so the dashboard feeds the meeting instead of competing with it.

---

## 2. Date tracking — the root defect

The sheet's headers are free text: `Feb 27 … May 22, May 29, June 25, June 29, July 20`. Two different formats (abbreviated from the script, spelled-out when typed by hand), no year, and irregular spacing.

`index.html:424` parses these with a month-name regex and a December/January wrap heuristic. It works today and will break the first week of January. More importantly, **it can't fail loudly** — an unparseable header silently falls back to sheet column order.

The sparkline then plots all 18 columns evenly spaced. A 4-day gap and a 27-day gap are drawn the same width. The legend says "the last 14 weeks"; it is actually 18 irregular columns spanning five months.

### What to build

- **Store `YYYY-MM-DD` (the week-ending Sunday) in the header row.** Display it prettily; store it unambiguously. Deterministic parse, no heuristics, no year-wrap bug.
- **Plot on a real time axis** so gaps look like gaps.
- **Backfill picker:** when someone enters data on a Thursday for last week, let them say so. Right now that edit corrupts the current week.
- **Audit tab** (`Log`: `timestamp | code | value | who`). This is what makes staleness computable — you cannot show "last updated" without recording it.

---

## 3. Impact goals — rebuild bottoms-up

### What's there now

"Major Impact" = top-tier media inquiries · mainstream campaign ideas generated / launched / 1M+ impressions · organic posts 10K+ · thank-you messages · people helped.

Current values: `1, 1, 0, 0, 10, 1, 1`.

Two problems. First, six of seven are **awareness activity** — this is a PR scorecard wearing an impact label. Second, **"People helped in a significant way = 1"** is the only outcome metric on the entire dashboard, and it's obviously not a real count; nobody has defined what qualifies, so nobody logs it.

Meanwhile the memo shows Thrive Blind is real and moving — model defined, corporate partner participation, Year 1 pilot scope, staffing, a risk assessment, Form 990 exposure, Kevin as ED, partnerships with NYISE and Lavelle. **None of it appears on the dashboard.** The goal tree still describes the company Krysta's strategy doc says you're leaving behind.

### First-principles frame

The mission is *awareness, education, and opportunities so people thrive with blindness and low vision.* That gives two distinct chains, and they should not be blended into one "Impact" bucket:

**Chain A — Awareness (breadth).** Reach → attention → perception shift → action.
The current metrics live here and mostly work. They just need an *action* rung: reach that produces nothing is vanity, and today nothing on the tree connects a 1M-impression campaign to a single new advocate, subscriber, volunteer, or donor.

**Chain B — Programs (depth).** Dollars & hours → people enrolled → skill delivered → opportunity gained → durable change.
This chain is entirely absent, and it's the one the 990 will be read against.

### Proposed metric set

Every metric below is weekly-countable by one named owner from a source that already exists. That constraint is the point — a metric nobody can count on a Tuesday is decoration.

**IMPACT — A: Awareness that converts** *(owner: Krysta)*
| Metric | Source | Note |
|---|---|---|
| ★ People who took a mission action | Klaviyo / site | new subscriber, volunteer signup, program inquiry, donation — the rung that's missing today |
| Top-tier media inbound inquiries | manual | keep as-is |
| Campaigns launched / at 1M+ impressions | Meta, GA4 | keep as-is |
| Organic posts 10K+ | native | keep as-is, fix as running total |

**IMPACT — B: Programs delivered (Thrive Blind)** *(owner: Kevin)*
| Metric | Source | Note |
|---|---|---|
| ★ People served (running total) | program roster | replaces "people helped in a significant way" with a countable definition |
| People enrolled this week | program roster | leading indicator |
| Program sessions delivered | program roster | |
| Partner organizations live | manual | NYISE, Lavelle, … |
| Outcomes recorded (skill / placement / device adopted) | program roster | the rung that makes the 990 defensible |

**IMPACT — C: Funding the mission** *(owner: Kevin / Brad)*
| Metric | Source | Note |
|---|---|---|
| ★ Committed program dollars (running total) | finance | the actual constraint on Chain B |
| Major-gift asks made / in pipeline | existing `d_ask`, `d_pros` | move here from "Major Donors" — same work, correct parent |
| Grants submitted / won | manual | absent today |
| Monthly recurring donors | payments | absent today |
| Corporate partners committed | existing `p_*` | |

**Keep "Depth — 1,000 thank-you messages"** as a culture metric, but move it out of Impact. It measures whether people feel something, which is real and worth watching — it just isn't program impact, and having it as one of two Impact goals is what makes the section feel hollow.

This maps 1:1 onto the Programs & Development column of Krysta's strategy doc (People served · Program participation · Outcomes · Ecosystem growth · Fundraising), so the dashboard and the strategy stop being two separate documents.

---

## 4. Scorecards — exist, not linked

Both scorecards are real and recent:

- **Campaign Scorecard/Checklist** — Krysta, created 2026-07-27. Validation checklist (audience / strategy / creative / mission / measurement / ops), a pre-launch 0–10 score with an 8+ = Proceed gate, and a separate **post-campaign** 0–10 success score.
- **Product Scorecard + validation doc** — Katie, completed the week of 7/20, validated against the Holiday 2026 products. `wp_score` jumped 0 → 7 the same week.

What the dashboard says about them: a single footnote —

> ✱ Scorecard — a screening test that pulls in: (1) a successful comparable product in the market; (2) brand details built into the product; (3) the product's story.

That's the *product* criteria, and it's used as the footnote for the *campaign* scorecard row too. Neither links to the actual document. `wc_score` reads 0 — not because no campaign passed, but because the scorecard was finished three days ago and nobody has scored anything into it.

### What to build

- Link both scorecard docs from their rows (the ✱ becomes a link, not a footnote).
- Split the campaign metric into **pre-launch passed** and **post-campaign scored** — the doc already defines both gates, and only tracking the first one is how you end up with launched campaigns nobody ever graded.
- Log the score itself in the Items tab (`wc_score → "Rudy — 9/10, proceed"`). The item tracker already exists; this is the highest-value thing to point it at, because it turns "7 products passed" into "which 7, and what did they score."
- Katie leaves full-time Aug 13. Getting the product scorecard's 7 entries itemized before then is time-sensitive.

---

## 5. Trend tracking & staleness

Today: a sparkline, and a ▲/▼ vs the previous column. That's it. There is no date on any point, no indication of when a number was last touched, and no distinction between "flat because stable" and "flat because carried forward."

**Add, in order of value:**

1. **Freshness per metric** — "updated 3d ago · Katie" / "stale · 5 weeks." Requires the audit log from §2. Green < 7d, amber 7–14d, red > 14d.
2. **Real time axis** — irregular gaps render as gaps.
3. **Running-total guard** — a decrease in a running total renders as a *correction* (grey ✎), never a red ▼.
4. **"Not started" vs "no data."** Eight of the nine key metrics currently read 0 with the pill "Not started yet." For `d_ask` (asks made this week) that's true and useful. For most others it means nobody has entered anything since May. Those are different states and should look different.
5. **Trailing-4-week movement** instead of last-column-vs-previous. With a 21-day gap between columns, "vs last week" is currently comparing July 20 to June 29.

---

## 6. Ecom reconciliation — dashboard vs the weekly memo

**Short answer: no, they are not the same number, and the gap is systematic — the dashboard runs ~7–10% high versus what Katie reports.** Three different "revenue" figures are circulating.

### The comparison

| Week ending | Dashboard "Sales / revenue" | Katie's memo "net sales" | Δ |
|---|---|---|---|
| Jun 7 | $14,720 | $14.5K | +1.5% |
| Jun 14 | $9,747 | $8.2K | +18.9% |
| Jun 21 | $18,940 | $17.3K | +9.5% |
| Jun 28 | $12,589 | $11.4K | +10.4% |
| Jul 5 | $11,408 | $10.6K | +7.6% |
| Jul 12 | $17,379 | $15.8K | +10.0% |
| Jul 19 | $17,022 | $15.9K | +7.1% |
| Jul 26 | $17,897 | $16.4K | +9.1% |

Consistent one-directional bias ≈ **+9%**. That's a definition gap, not drift.

### Why

The dashboard's number is Shopify `current_total_price` summed over non-cancelled orders (`extractors/shopify.py:201`) — i.e. **the customer-facing order total, including shipping charged and sales tax**, net of refunds and edits.

Katie's "net sales" is the Shopify Analytics *Net sales* metric — gross − discounts − returns, and **excluding shipping and tax**.

Shipping + tax on a ~$110 AOV comfortably accounts for the ~9%.

Cross-check: Krysta's own Shopify figures in the memo match the dashboard almost exactly — $17,156 vs $17,022 (Jul 19), $17,118 vs $17,379 (Jul 12), $11,594 vs $11,408 (Jul 5) — all within ±1.6%. So the dashboard agrees with Krysta's Shopify pull and disagrees with Katie's Shopify pull, because those two are pulling **different Shopify metrics**.

The third number is **Northbeam attributed revenue** ($17.7K for the week of 7/20 vs the dashboard's $17.9K), which wanders ±9% against Shopify with no fixed relationship.

Spend, by contrast, reconciles well: dashboard $6,680 vs Krysta $6,760 for Jul 26; $6,772 vs $6.77K for Jun 21. Within ~1.5% throughout.

**MER** differs by construction: the dashboard computes Shopify revenue ÷ Northbeam spend (2.68x for Jul 26); Krysta reports Northbeam revenue ÷ Northbeam spend (2.62x).

### Krysta's July 21 email is still unanswered

She asked, metric by metric, which source is authoritative and said *"in most cases we will use Northbeam as the source of truth."* That's a decision the dashboard hasn't implemented — it currently uses Shopify revenue + Northbeam spend, which is one of the three options she listed. **This needs a decision from you before any dashboard rework**, because it changes what every commercial number means.

My recommendation: **keep Shopify as the source of truth for revenue** (it's the money that actually arrived; Northbeam attributed revenue is a modelled number that shouldn't be the top-line), **use Northbeam for spend and channel attribution**, and **relabel** the dashboard row from "Sales / revenue" to "Gross order value (incl. shipping & tax)" so it stops looking like it should equal Katie's number. Then add Shopify Net sales as a second row so the memo and the dashboard show the same figure side by side. That answers Krysta's question without pretending one number can serve both purposes.

### Two more things to fix in the ecom block

**Net margin is modelled, not measured.** `margin = revenue × 0.9 − ad spend` — shipping is a hardcoded 10% assumption (`shipPct`) and **COGS is not in it at all**. The label says "money left after ads & shipping," which is literally accurate, but the headline goal "Beat last year" is being judged on a number that ignores cost of goods. Krysta asked about this too ("Is COGS included?"). It should either include COGS or be renamed to "contribution after ads & shipping."

**The last-year comparison looks unreliable.** Last-year ad spend in `margin_yoy.json` collapses from ~$10.1K (late Apr 2025) to $287–$1,700/week from mid-May 2025 onward, while this year runs a steady $6.6–7.9K. A 5× cliff that lands mid-May and never recovers reads like a data-coverage change in Northbeam, not a spending decision. Because margin subtracts ad spend, this inflates last year's margin by roughly $5–6K/week — so the flagship goal currently reports "Behind last year · $9.4k vs $25.9k" when a like-for-like spend basis would put last year nearer $19.5k. The revenue decline is real; **the size of the margin gap is probably an artifact.** Worth verifying in Northbeam directly before this number is shown at another meeting.

---

## 7. What was built

**Done — the data layer**
1. ✅ ISO week-ending dates in the header row; the current week's column is resolved from the clock and auto-created; "Save & Close This Week" retired. Legacy `Jun 25` headers still parse, and `?fn=migrate` converts them in place.
2. ✅ `Log` tab (`when | code | value | action | who | week`) written on every save and confirm.
3. ✅ Blanks stay blank (gviz `0`-coercion removed); gaps render as gaps; 13 empty pre-launch columns are hidden with a note saying so.
4. ✅ Closed weeks frozen in `margin_yoy.json` so history stops restating.

**Done — usable and trustworthy**
5. ✅ Per-person entry links (`?who=katie` → 5 rows instead of 31) + a **✓ "checked it, no change"** button per metric.
6. ✅ Freshness chips everywhere (green <7d / amber 7–14 / red older / grey never), fed by the `Log` tab.
7. ✅ Running-total corrections render as a grey ✎, never a red ▼. Sparklines plot on a real date axis; the WoW label says "vs 21 days earlier" when that's the truth.
8. ✅ Revenue relabelled and split: **Net sales** (memo-comparable) and **Gross order value incl. shipping & tax**, with contribution now computed from net sales. Footer states plainly that COGS is excluded.
9. ✅ Last-year spend anomaly flagged in the data (`ad_spend_suspect`, 10 of 14 weeks) and surfaced as a dimmed line + "last-year spend data looks incomplete".

**Done — makes it mean something**
10. ✅ Impact rebuilt as three chains — A: awareness that turns into action (new key metric: people who took a mission action); B: Programs delivered / Thrive Blind (people served, enrolled, sessions, partners, outcomes); C: Funding the mission (committed program dollars, grants submitted/won, recurring donors, corporate partners). Thank-you messages moved out of Impact into a "Community" star.
11. ✅ Campaign Scorecard linked from its rows; pre-launch and post-launch scoring split into two metrics. Product scorecard row is wired but needs its URL (§DEPLOY step 3).
12. ✅ Fabricated fallback series deleted — every series now starts empty, so a failed load shows nothing rather than plausible-looking numbers nobody entered. (The old file shipped a hardcoded 440 thank-you messages as its offline fallback.)

**Still needs a human**
- Verify last year's ad-spend data in Northbeam before trusting the YoY margin verdict.
- Itemize the 7 scorecard-passing products in the Items tab before Katie goes part-time **Aug 13**.
- Program definitions for Impact B with Kevin — the metrics exist and are empty by design.

**Open decisions for Brad**
- Northbeam vs Shopify as revenue source of truth (Krysta's July 21 email). Both Shopify figures now ship; switching the headline to Northbeam is a one-line change.
- Does "contribution" include COGS? Today it does not, and the page says so.
- Who owns each Impact metric once Angela is on leave through Nov 19 and Katie goes part-time Aug 13?
