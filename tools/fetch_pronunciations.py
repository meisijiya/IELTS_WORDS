"""Batch-download IELTS word pronunciations from Youdao.

Each word from seed/{book}.json is fetched once:
    https://dict.youdao.com/dictvoice?audio=<WORD>&type=2  (US English)
    https://dict.youdao.com/dictvoice?audio=<WORD>&type=1  (UK English)

Output: public/audio/<normalized>.mp3
- normalized = lowercase + alnum + dashes (e.g. 'Carbon Dioxide' → 'carbon-dioxide.mp3')

Concurrency: 10 parallel requests. Each request ~50–100ms typically.

Skip rules (do not raise):
  - HTTP 5xx / network errors → retry up to 3 times with 0.5/1/2s backoff
  - Persistent failure → log to public/audio/FAILED.txt and continue
  - File already exists → skip (resume-friendly)

Usage:
    python tools/fetch_pronunciations.py           # download all (both books)
    python tools/fetch_pronunciations.py --us      # US only (skip UK)
    python tools/fetch_pronunciations.py --concurrency 20
    python tools/fetch_pronunciations.py --book concise      # one book only
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "seed"
AUDIO_DIR = ROOT / "public" / "audio"
FAILED_LOG = AUDIO_DIR / "FAILED.txt"

YOUDAO_BASE = "https://dict.youdao.com/dictvoice"

NAME_RE = re.compile(r"[^a-z0-9]+")


def normalize(spelling: str) -> str:
    """Lowercase + alnum + dashes. 'Carbon Dioxide' → 'carbon-dioxide'."""
    s = spelling.strip().lower()
    s = NAME_RE.sub("-", s).strip("-")
    return s or "unnamed"


def collect_words(book: str) -> list[tuple[str, str]]:
    """Return list of (spelling, book_slug)."""
    file_map = {"concise": "yasi_concise.json", "full": "ielts_full.json", "cet6": "cet6.json"}
    path = SEED / file_map[book]
    data = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for w in data:
        sp = w.get("spelling")
        if sp:
            out.append((sp, book))
    return out


_GLOBAL_DELAY = 0.4  # seconds between requests (per worker)


def fetch(spelling: str, type_id: int = 2, retries: int = 3) -> bytes | None:
    """Fetch mp3 bytes; None on persistent failure. Sleeps _GLOBAL_DELAY after each call."""
    url = f"{YOUDAO_BASE}?audio={quote(spelling)}&type={type_id}"
    last_err = None
    try:
        time.sleep(_GLOBAL_DELAY)
    except Exception:
        pass
    for attempt in range(retries):
        try:
            req = Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "audio/mpeg, audio/*, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Referer": "https://www.youdao.com/",
                },
            )
            with urlopen(req, timeout=15) as resp:
                data = resp.read()
            # Youdao returns WAV (RIFF/WAVE) for some words — accept it;
            # the .mp3 extension is just a label, browsers play either via
            # MIME sniffing.
            if len(data) > 1000 and (
                data[:3] == b"ID3"
                or data[:2] in (b"\xff\xfb", b"\xff\xf3")
                or data[:1] == b"\xff"
                or data[:4] == b"RIFF"
            ):
                return data
            last_err = f"non-audio ({len(data)} bytes, prefix={data[:30]!r})"
        except Exception as exc:
            last_err = f"{type(exc).__name__}: {exc}"
        if attempt < retries - 1:
            time.sleep(1 * (attempt + 1))
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--book", choices=["concise", "full", "cet6"], action="append", help="limit to specific book(s)")
    ap.add_argument("--us", action="store_true", help="US English only (skip UK)")
    ap.add_argument("--uk", action="store_true", help="UK English only (skip US)")
    ap.add_argument("--concurrency", type=int, default=8, help="concurrent requests (default 8; lower if rate-limited)")
    ap.add_argument("--delay", type=float, default=0.15, help="seconds between requests (per worker, default 0.15)")
    ap.add_argument("--limit", type=int, default=None, help="limit words (for testing)")
    args = ap.parse_args()

    if args.us and args.uk:
        print("[err] --us and --uk are mutually exclusive")
        return 1
    types = []
    if not args.uk:
        types.append(("us", 2))
    if not args.us:
        types.append(("uk", 1))

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    FAILED_LOG.unlink(missing_ok=True)
    global _GLOBAL_DELAY
    _GLOBAL_DELAY = args.delay

    books = args.book or ["concise", "full"]
    tasks: list[tuple[str, str, str, int]] = []
    for book in books:
        for spelling, _ in collect_words(book):
            for variant, type_id in types:
                fname = AUDIO_DIR / f"{normalize(spelling)}.{variant}.mp3"
                if not fname.exists():
                    tasks.append((spelling, variant, str(fname), type_id))

    if args.limit:
        tasks = tasks[: args.limit]

    if not tasks:
        print(f"[ok] all audio files already present at {AUDIO_DIR}")
        return 0

    print(f"[plan] {len(tasks)} files to download ({args.concurrency} concurrency)")
    print(f"[out]  {AUDIO_DIR}")

    succeeded = 0
    failed: list[tuple[str, str, str]] = []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = {pool.submit(fetch, sp, type_id): (sp, variant, fpath) for sp, variant, fpath, type_id in tasks}
        completed = 0
        for fut in as_completed(futures):
            sp, variant, fpath = futures[fut]
            data = fut.result()
            completed += 1
            if data:
                Path(fpath).write_bytes(data)
                succeeded += 1
            else:
                failed.append((sp, variant, fpath))
            if completed % 100 == 0 or completed == len(tasks):
                elapsed = time.time() - t0
                rate = completed / elapsed if elapsed > 0 else 0
                pct = completed / len(tasks) * 100
                print(f"[{completed}/{len(tasks)}] {pct:.1f}% · {rate:.1f}/s · ETA {(len(tasks)-completed)/rate:.0f}s")

    elapsed = time.time() - t0
    print(f"\n[done] {succeeded}/{len(tasks)} succeeded in {elapsed:.0f}s")

    if failed:
        with FAILED_LOG.open("w", encoding="utf-8") as f:
            for sp, variant, fpath in failed:
                f.write(f"{sp}\t{variant}\t{fpath}\n")
        print(f"[warn] {len(failed)} failed; see {FAILED_LOG}")

    return 0


if __name__ == "__main__":
    sys.exit(main())