"""Batch-fetch bilingual example sentences (EN + ZH) for IELTS/CET-6 words from Youdao.

Each word from seed/{slug}.json is fetched once:
    POST https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4
    body: q=<word>&le=en&t=<time>&client=web&keyfrom=webdict&sign=<md5>

Sign: MD5-based, uses the public Youdao frontend key (no API key required).

Output: seed/examples_<slug>.json — JSON object mapping spelling -> [{en, zh, source?}]
    {
      "atmosphere": [
        {"en": "The atmosphere was tense.", "zh": "气氛很紧张。"},
        {"en": "Earth's atmosphere protects us.", "zh": "地球大气层保护我们。"}
      ],
      ...
    }

Concurrency: 8 parallel requests, 0.15s per-worker delay (mirrors fetch_pronunciations.py).
Skip rules (no raise):
  - HTTP errors / non-JSON / network -> retry 3x with 1/2/3s backoff
  - Persistent failure -> log to seed/examples_<slug>_FAILED.txt
  - Word already in seed/examples_<slug>.json -> skip (resume-friendly)
  - `blng_sents_part` missing for word -> write empty list (Word.examples will be [])
Sanity gate:
  - Each persisted example must have new RegExp("\\b" + re.escape(spelling) + "\\b", "i") match
    in example["en"]. Drop mismatches.
  - Truncate to 3 examples per word.

Usage:
    python3 tools/fetch_examples.py                          # all slugs
    python3 tools/fetch_examples.py --slug concise           # one slug
    python3 tools/fetch_examples.py --slug concise --dry-run # parse JSON response, no DB write
    python3 tools/fetch_examples.py --concurrency 4 --delay 0.3
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "seed"

YOUDAO_URL = "https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4"
YOUDAO_PUBLIC_KEY = "Mk6hqtUp33DGGtoS63tTJbMUYjRrG1Lu"
YOUDAO_VERSION = "webdict"
YOUDAO_CLIENT = "web"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

PER_WORD_DELAY_DEFAULT = 0.15
PER_WORD_CONCURRENCY_DEFAULT = 8
MAX_EXAMPLES_PER_WORD = 3
FETCH_RETRIES = 3
FETCH_TIMEOUT_SEC = 15


def youdao_sign(text: str) -> tuple[str, int]:
    """Compute Youdao's MD5 sign for a search text. Returns (sign, t)."""
    t = len(text + YOUDAO_VERSION) % 10
    o = hashlib.md5((text + YOUDAO_VERSION).encode("utf-8")).hexdigest()
    f = hashlib.md5(f"{YOUDAO_CLIENT}{text}{t}{YOUDAO_PUBLIC_KEY}{o}".encode("utf-8")).hexdigest()
    return f, t


def parse_examples_from_json(payload: dict, max_per_word: int = MAX_EXAMPLES_PER_WORD) -> list[dict]:
    """Extract [{en, zh, source?}] from a Youdao jsonapi_s response. Pure function (testable)."""
    out: list[dict] = []

    def add(en: object | None, zh: object | None, source: object | None = None) -> None:
        if not isinstance(en, str) or not isinstance(zh, str):
            return
        if not en.strip() or not zh.strip():
            return
        out.append({"en": en, "zh": zh, **({"source": source} if source else {})})

    blng = payload.get("blng_sents_part", {}) or {}
    for pair in blng.get("sentence-pair", []) or []:
        if len(out) >= max_per_word:
            break
        add(pair.get("sentence-eng"), pair.get("sentence-translation"), pair.get("source"))

    if len(out) < max_per_word:
        for w in (payload.get("expand_ec", {}) or {}).get("word", []) or []:
            for t in (w.get("transList", []) or []):
                content = t.get("content", {}) or {}
                for s in content.get("sents", []) or []:
                    if len(out) >= max_per_word:
                        break
                    add(s.get("sentOrig"), s.get("sentTrans"))

    if len(out) < max_per_word:
        for entry in (payload.get("collins", {}) or {}).get("tran_entry", []) or []:
            for s in (entry.get("exam_sents", []) or []):
                for sent in s.get("sent", []) or []:
                    if len(out) >= max_per_word:
                        break
                    add(sent.get("eng_sent"), sent.get("chn_sent"))

    return out


def fetch_one(spelling: str, retries: int = FETCH_RETRIES) -> list[dict] | None:
    """Fetch one word's examples; None on persistent failure. Mirrors fetch_pronunciations.py backoff."""
    sign, t = youdao_sign(spelling)
    body = urllib.parse.urlencode(
        {
            "q": spelling,
            "le": "en",
            "t": t,
            "client": YOUDAO_CLIENT,
            "keyfrom": YOUDAO_VERSION,
            "sign": sign,
        }
    ).encode("utf-8")
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                YOUDAO_URL,
                data=body,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Referer": "https://www.youdao.com/",
                },
            )
            with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_SEC) as resp:
                ct = resp.headers.get("Content-Type", "")
                if "json" not in ct.lower():
                    last_err = f"non-JSON content-type: {ct!r}"
                else:
                    payload = json.loads(resp.read())
                    return parse_examples_from_json(payload)
        except Exception as exc:
            last_err = f"{type(exc).__name__}: {exc}"
        if attempt < retries - 1:
            time.sleep(1 * (attempt + 1))
    print(f"  [warn] {spelling!r} failed after {retries} attempts: {last_err}", file=sys.stderr)
    return None


def collect_words(slug: str) -> list[str]:
    """Read seed/<file>.json and return list of spellings for the given slug."""
    file_map = {
        "concise": "yasi_concise.json",
        "full": "ielts_full.json",
        "cet6": "cet6.json",
    }
    if slug == "all":
        out: list[str] = []
        for s in file_map:
            out.extend(collect_words(s))
        return out
    path = SEED / file_map[slug]
    data = json.loads(path.read_text(encoding="utf-8"))
    return [w["spelling"] for w in data if w.get("spelling")]


_WORD_RE_CACHE: dict[str, re.Pattern[str]] = {}


def example_matches_spelling(example_en: str, spelling: str) -> bool:
    """Return True iff `spelling` appears as a whole word in example_en (case-insensitive)."""
    if not spelling or not example_en:
        return False
    rx = _WORD_RE_CACHE.get(spelling)
    if rx is None:
        rx = re.compile(r"\b" + re.escape(spelling) + r"\b", re.IGNORECASE)
        _WORD_RE_CACHE[spelling] = rx
    return bool(rx.search(example_en))


def write_examples(slug: str, word_examples: dict[str, list[dict]]) -> Path:
    """Write seed/examples_<slug>.json atomically (write to .tmp then rename)."""
    out_path = SEED / f"examples_{slug}.json"
    tmp_path = out_path.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(word_examples, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(out_path)
    return out_path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--slug", choices=["concise", "full", "cet6", "all"], action="append",
                    help="limit to specific slug(s); default all")
    ap.add_argument("--concurrency", type=int, default=PER_WORD_CONCURRENCY_DEFAULT,
                    help="parallel requests (default 8)")
    ap.add_argument("--delay", type=float, default=PER_WORD_DELAY_DEFAULT,
                    help="seconds per worker between requests (default 0.15)")
    ap.add_argument("--dry-run", action="store_true",
                    help="read input + parse plan, do not hit network")
    ap.add_argument("--limit", type=int, default=None, help="limit words (for testing)")
    args = ap.parse_args()

    slugs = args.slug or ["concise", "full", "cet6"]
    SEED.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    total_with_examples = 0
    total_words = 0
    for slug in slugs:
        words = collect_words(slug)
        if args.limit:
            words = words[: args.limit]
        out_path = SEED / f"examples_{slug}.json"
        existing: dict[str, list[dict]] = {}
        if out_path.exists():
            try:
                existing = json.loads(out_path.read_text(encoding="utf-8"))
            except Exception:
                existing = {}
        todo = [w for w in words if w not in existing]
        total_words += len(words)
        print(f"[{slug}] {len(todo)} to fetch ({len(words) - len(todo)} already cached) -> {out_path}")
        if args.dry_run:
            print(f"[{slug}] dry-run: skipping fetch (would fetch {len(todo)} words)")
            continue
        if not todo:
            print(f"[{slug}] all examples present, skipping")
            continue

        succeeded = 0
        failed: list[str] = []
        word_examples: dict[str, list[dict]] = dict(existing)
        INCREMENTAL_FLUSH = 50  # Write JSON every N words so callers can re-seed mid-run
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            futures = {pool.submit(fetch_one, w): w for w in todo}
            completed = 0
            for fut in as_completed(futures):
                spelling = futures[fut]
                examples = fut.result()
                completed += 1
                if examples is None:
                    failed.append(spelling)
                else:
                    examples = [
                        e for e in examples
                        if example_matches_spelling(e["en"], spelling)
                    ][:MAX_EXAMPLES_PER_WORD]
                    word_examples[spelling] = examples
                    if examples:
                        succeeded += 1
                        total_with_examples += 1
                if completed % INCREMENTAL_FLUSH == 0:
                    write_examples(slug, word_examples)
                if completed % 100 == 0 or completed == len(todo):
                    elapsed = time.time() - t0
                    rate = completed / elapsed if elapsed > 0 else 0
                    print(
                        f"  [{slug}] {completed}/{len(todo)} · {rate:.1f}/s · "
                        f"ETA {(len(todo) - completed) / rate:.0f}s",
                        file=sys.stderr,
                    )
                time.sleep(args.delay)
        write_examples(slug, word_examples)
        if failed:
            fail_path = SEED / f"examples_{slug}_FAILED.txt"
            with fail_path.open("w", encoding="utf-8") as f:
                for s in failed:
                    f.write(f"{s}\n")
            print(f"  [{slug}] {len(failed)} failed; see {fail_path}", file=sys.stderr)

    elapsed = time.time() - t0
    rate = total_with_examples / total_words * 100 if total_words else 0
    print(f"\n[done] {total_with_examples}/{total_words} words with examples ({rate:.1f}%) in {elapsed:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
