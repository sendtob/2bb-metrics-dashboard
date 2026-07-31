# The community agent — counting messages that actually mean something

The Community goal is "1,000 heartfelt thank-you messages". That number only
means anything if a one-line "thanks, love these!" doesn't count. So the agent
splits into a part a machine can do honestly and a part it can't.

```
  1. FETCH + PRE-FILTER   tools/community_scan.py       → candidates.json
  2. JUDGE                a person or Claude session    → accepted.json
  3. WRITE BACK           tools/community_scan.py --write
```

**Why the judging is deliberately not automated by keyword.** A rule can tell
you a message is 40 characters long. It cannot tell you that a 500-character
message about losing your sight at 64 is the real thing and a 500-character
complaint about a late order isn't. The pre-filter only removes what is
*structurally incapable* of being heartfelt — too short, one sentence, obviously
transactional, duplicate. Everything that survives gets read.

---

## Step 1 — Gorgias API key (you, ~2 minutes, needed once)

None of these credentials exist yet, so the scan can't run until this is done.

1. In Gorgias: **Settings → REST API** (you need admin).
2. Create an API key. Copy the key and note which account email it belongs to.
3. On this Mac:

```bash
mkdir -p ~/.2bb && cat > ~/.2bb/gorgias.env <<'EOF'
GORGIAS_DOMAIN=twoblindbrothers
GORGIAS_EMAIL=your-gorgias-login@twoblindbrothers.com
GORGIAS_API_KEY=paste-the-key-here
EOF
chmod 600 ~/.2bb/gorgias.env
```

`GORGIAS_DOMAIN` is the part before `.gorgias.com` in the URL you log in at —
change it if it isn't `twoblindbrothers`.

Then check it works:

```bash
python3 ~/Documents/2bb-dashboard/tools/community_scan.py --days 7 --verbose
```

It prints how many messages it fetched, how many it dropped and why, and writes
the survivors to `~/Documents/2bb-community-scan/candidates.json`.

---

## Step 2 — the judgement

Read `candidates.json` (ranked, most promising first) and keep the ones that are
genuinely heartfelt. The bar:

**Counts**
- Says something specific about their life, sight, or family
- Describes what the product or the brothers' story actually meant to them
- Unprompted — they went out of their way to write it
- Would make you stop and read it out to the team

**Doesn't count**
- Generic praise of any length: "love these", "great socks", "amazing company"
- Positive but transactional: fast shipping, easy return, helpful agent
- A five-star survey with no words
- Anything solicited by us

Write the keepers to `~/Documents/2bb-community-scan/accepted.json` as a JSON
list of the candidate objects you kept (keep `message_id`, `ticket_id`,
`initials`, `when`).

This is a good scheduled Claude task — it's reading and judgement, no API spend.

---

## Step 3 — write back

```bash
export TBB_WRITE_PASS='the dashboard passcode'
python3 ~/Documents/2bb-dashboard/tools/community_scan.py --write
```

Updates `dp_key` (Heartfelt messages received) and adds one row per message to
the Sheet's **Items** tab, so there's a list behind the number and the same
message can't be counted twice. `counted.json` remembers what's already been
counted across runs.

---

## Privacy — please don't loosen this

These are real customers writing about losing their sight.

- **Message text never leaves this Mac.** Output goes to
  `~/Documents/2bb-community-scan/`, deliberately *outside* the dashboard repo,
  because that repo is public on GitHub Pages.
- **The Sheet gets initials and a ticket number only** — never the text, never a
  full name. The Items tab is link-readable by anyone with the Sheet link.
- If you want the full quote for a meeting, open the Gorgias ticket.

---

## Social — not wired up yet

Brad asked for social as well as email. The Meta token already in the WBR
pipeline is **ads-scoped** and cannot read organic comments or DMs, so this
would need a separate Instagram/Facebook Graph token with
`instagram_manage_comments` / `pages_read_engagement`. The code is structured so
a social fetcher returning the same candidate shape drops straight in beside
Gorgias — `fetch_messages()` is the only Gorgias-specific piece.

Worth knowing: Shannen's weekly memos say most feedback arrives through
Facebook and Instagram comments, so this is probably where the richest material
is. It's the natural next step once the Gorgias half is running.
