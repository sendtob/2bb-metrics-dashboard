"""Find the messages that actually mean something.

Feeds the Goal Tree's Community goal — "1,000 heartfelt thank-you messages".
That number is worthless if it counts every "thanks, love these socks!", so this
tool does the part a machine can do honestly (fetch everything a customer wrote,
throw out what is structurally incapable of being heartfelt) and deliberately
STOPS before the judgement call.

    Stage 1  this script      fetch + mechanical pre-filter  -> candidates.json
    Stage 2  a Claude session read candidates, judge each one -> accepted.json
    Stage 3  this script      --write  push count + list to the dashboard

Stage 2 is a person or a scheduled Claude session reading the actual words. A
keyword rule cannot tell "thank you so much, these are perfect" from a letter
about losing your sight at 64 — and pretending otherwise is how the metric
becomes a lie. See COMMUNITY_AGENT.md.

SOURCES
  Gorgias  — customer service email/chat. Implemented here.
  Social   — IG/FB comments and DMs. Not yet: the Meta token in the WBR pipeline
             is ads-scoped and can't read organic comments. Add a fetcher that
             returns the same candidate shape and it drops straight in.

PRIVACY — read before changing the output paths
  These are real customers writing about their sight loss. Message bodies never
  leave this machine: OUT_DIR defaults OUTSIDE the dashboard repo, because that
  repo is public. What gets written back to the Sheet is initials plus a ticket
  reference — never the text, never a full name. The Items tab is link-readable.

CREDENTIALS (none of these exist yet — see COMMUNITY_AGENT.md step 1)
  GORGIAS_DOMAIN    e.g. twoblindbrothers   (the bit before .gorgias.com)
  GORGIAS_EMAIL     the account the API key belongs to
  GORGIAS_API_KEY   Settings > REST API in Gorgias
Read from the environment, or from ~/.2bb/gorgias.env as KEY=value lines.

USAGE
  python3 community_scan.py --days 7            # fetch + pre-filter
  python3 community_scan.py --days 7 --verbose  # show what was dropped and why
  python3 community_scan.py --write             # push judged results (stage 3)
"""
import argparse, base64, json, os, re, sys, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUT_DIR = Path(os.environ.get("COMMUNITY_OUT", Path.home() / "Documents" / "2bb-community-scan"))
CRED_FILE = Path.home() / ".2bb" / "gorgias.env"
APPS_URL = ("https://script.google.com/macros/s/AKfycbxFYl7yMenuUkVCV9nSDSIvfP0-"
            "UnPN-R1NOYVrQM0kRzk8Z2WYtb9JTZBK-aQYwJGu3A/exec")

# A message this short cannot carry a story. Tuned against the examples in the
# weekly memos: the brain-lymphoma letter runs ~500 chars, "Fast and helpy."
# runs 15. 220 keeps the former and drops the latter without needing to
# understand either.
MIN_CHARS = 220
MIN_SENTENCES = 2

# Transactional traffic. These are about an order, not about the mission, and no
# amount of length makes them heartfelt.
TRANSACTIONAL = re.compile(
    r"\b(order\s*#|tracking|refund|return label|exchange|wrong size|never arrived|"
    r"cancel my|invoice|discount code|promo code|coupon|unsubscribe|password)\b", re.I)

# Not scoring for truth — only for ranking, so a human reads the most promising
# first. Nothing here decides anything.
# Note the trailing \w* rather than \b: several of these are prefixes, and
# "diagnos" followed by "ed" has no word boundary between them, so a trailing \b
# silently matched nothing. That scored a letter about a lymphoma diagnosis at
# zero and buried it at the bottom of the queue.
DEPTH_HINTS = re.compile(
    r"\b(?:diagnos|blind|low vision|vision|retinitis|macular|stargardt|glaucoma|"
    r"sight|my son|my daughter|my husband|my wife|my mother|my father|"
    r"grandson|granddaughter|surgery|journey|struggl|hope|meant so much|"
    r"chang|inspir|grateful|thank you for what you do|mission)\w*", re.I)


def load_creds():
    if CRED_FILE.exists():
        for line in CRED_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    missing = [k for k in ("GORGIAS_DOMAIN", "GORGIAS_EMAIL", "GORGIAS_API_KEY")
               if not os.environ.get(k)]
    if missing:
        print("Gorgias credentials not set: " + ", ".join(missing))
        print(f"Put them in {CRED_FILE} as KEY=value lines, or export them.")
        print("See COMMUNITY_AGENT.md step 1 — it takes about two minutes in Gorgias.")
        sys.exit(2)
    return (os.environ["GORGIAS_DOMAIN"], os.environ["GORGIAS_EMAIL"],
            os.environ["GORGIAS_API_KEY"])


def gorgias_get(domain, email, key, path, params):
    url = f"https://{domain}.gorgias.com/api/{path}?" + urllib.parse.urlencode(params)
    token = base64.b64encode(f"{email}:{key}".encode()).decode()
    req = urllib.request.Request(url, headers={
        "Authorization": "Basic " + token, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def fetch_messages(domain, email, key, since, verbose=False):
    """Every customer-written public message since `since`, newest first."""
    out, cursor, pages = [], None, 0
    while pages < 60:
        params = {"limit": 100, "order_by": "created_datetime:desc"}
        if cursor:
            params["cursor"] = cursor
        data = gorgias_get(domain, email, key, "messages", params)
        batch = data.get("data") or []
        if not batch:
            break
        stop = False
        for m in batch:
            ts = (m.get("created_datetime") or "")[:19]
            try:
                when = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if when < since:
                stop = True
                break
            out.append(m)
        pages += 1
        if verbose:
            print(f"  page {pages}: {len(batch)} messages, {len(out)} in window")
        if stop:
            break
        cursor = (data.get("meta") or {}).get("next_cursor")
        if not cursor:
            break
    return out


def initials(name):
    parts = [p for p in re.split(r"[\s,]+", (name or "").strip()) if p]
    return "".join(p[0].upper() for p in parts[:2]) or "??"


def prefilter(messages, verbose=False):
    """Drop what cannot be heartfelt. Keep everything that might be."""
    kept, dropped = [], {"agent": 0, "private": 0, "short": 0,
                         "one_sentence": 0, "transactional": 0, "empty": 0}
    seen = set()
    for m in messages:
        if m.get("from_agent"):
            dropped["agent"] += 1; continue
        if m.get("public") is False:
            dropped["private"] += 1; continue
        text = (m.get("body_text") or "").strip()
        # Strip quoted reply history — it inflates length without being theirs.
        text = re.split(r"\n\s*(On .{0,80}wrote:|-{3,}\s*Original Message)", text)[0].strip()
        if not text:
            dropped["empty"] += 1; continue
        if len(text) < MIN_CHARS:
            dropped["short"] += 1; continue
        if len(re.findall(r"[.!?]\s|\n", text)) + 1 < MIN_SENTENCES:
            dropped["one_sentence"] += 1; continue
        if TRANSACTIONAL.search(text):
            dropped["transactional"] += 1; continue
        fp = re.sub(r"\W+", "", text.lower())[:160]
        if fp in seen:
            continue
        seen.add(fp)
        sender = m.get("sender") or {}
        kept.append({
            "ticket_id": m.get("ticket_id"),
            "message_id": m.get("id"),
            "when": (m.get("created_datetime") or "")[:10],
            "channel": m.get("channel"),
            "initials": initials(sender.get("name") or sender.get("email", "")),
            "hints": len(DEPTH_HINTS.findall(text)),
            "chars": len(text),
            "text": text,
        })
    kept.sort(key=lambda c: (-c["hints"], -c["chars"]))
    if verbose:
        print("  dropped: " + ", ".join(f"{k}={v}" for k, v in dropped.items() if v))
    return kept, dropped


def send(fn, **params):
    params["fn"] = fn
    params["pass"] = os.environ.get("TBB_WRITE_PASS", "")
    if not params["pass"]:
        print("TBB_WRITE_PASS not set — cannot write to the dashboard.")
        sys.exit(2)
    url = APPS_URL + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read().decode()


def do_write():
    """Stage 3. Reads accepted.json (written by the judging step) and pushes the
    count plus one Items row per accepted message. Text never leaves the machine
    — the Sheet gets initials and a ticket reference only."""
    path = OUT_DIR / "accepted.json"
    if not path.exists():
        print(f"No {path}. Run the judging step first (see COMMUNITY_AGENT.md).")
        sys.exit(2)
    accepted = json.loads(path.read_text())
    if not isinstance(accepted, list):
        print("accepted.json must be a list of candidate objects."); sys.exit(2)

    prior_path = OUT_DIR / "counted.json"
    prior = set(json.loads(prior_path.read_text())) if prior_path.exists() else set()
    fresh = [a for a in accepted if str(a.get("message_id")) not in prior]
    if not fresh:
        print("Nothing new to write — every accepted message has been counted already.")
        return

    total = len(prior) + len(fresh)
    print(f"{len(fresh)} new heartfelt message(s); running total {total}.")
    for a in fresh:
        label = f"{a.get('initials','??')} · {a.get('when','')} · Gorgias ticket {a.get('ticket_id')}"
        send("additem", code="dp_key", item=label, by="community-agent")
    send("save", code="dp_key", value=total,
         label="Heartfelt messages received", who="community-agent")
    prior_path.parent.mkdir(parents=True, exist_ok=True)
    prior_path.write_text(json.dumps(sorted(prior | {str(a["message_id"]) for a in fresh}), indent=0))
    print(f"Wrote dp_key={total} and {len(fresh)} item row(s).")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--write", action="store_true",
                    help="stage 3: push judged results to the dashboard")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.write:
        return do_write()

    domain, email, key = load_creds()
    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    print(f"Fetching Gorgias messages since {since:%Y-%m-%d}…")
    msgs = fetch_messages(domain, email, key, since, args.verbose)
    print(f"  {len(msgs)} message(s) in window")
    cands, dropped = prefilter(msgs, args.verbose)

    out = OUT_DIR / "candidates.json"
    out.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_days": args.days,
        "fetched": len(msgs),
        "dropped": dropped,
        "candidates": cands,
    }, indent=1))
    print(f"\n{len(cands)} candidate(s) survived the pre-filter -> {out}")
    print("These are NOT counted yet. A human or a Claude session judges which are")
    print("genuinely heartfelt, writes accepted.json, then: --write")


if __name__ == "__main__":
    main()
