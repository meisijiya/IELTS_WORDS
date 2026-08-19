"""Phrase fallback: use Google TTS URL for multi-word phrases that Youdao can't fetch.

Strategy:
- For each word in the 6 new wordbooks (exam_points, speaking_collocations, writing_collocations,
  oral_vocabulary, listening_highfreq, academic_core), check if both US and UK audio exist.
- For missing ones:
  - If single-word (no space) → try Youdao first (already done by fetch_pronunciations.py)
  - If multi-word phrase → use Google TTS URL (Google supports phrases)
  - Single-word failures are likely OCR errors (truncated spellings) — log and skip

Google TTS URL pattern:
  https://translate.google.com/translate_tts?ie=UTF-8&q=<phrase>&tl=en&client=tw-ob

Returns MP3 directly. Rate-limited but works for reasonable volume.
"""
from __future__ import annotations

import json
import re
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

NAME_RE = re.compile(r"[^a-z0-9]+")

GOOGLE_TTS = "https://translate.google.com/translate_tts"

NEW_WORDBOOKS = [
    "exam_points",
    "speaking_collocations",
    "writing_collocations",
    "oral_vocabulary",
    "listening_highfreq",
    "academic_core",
]


def normalize(spelling: str) -> str:
    s = spelling.strip().lower()
    s = NAME_RE.sub("-", s).strip("-")
    return s or "unnamed"


def is_phrase(spelling: str) -> bool:
    return " " in spelling.strip()


def collect_phrases(wordbook: str) -> list[str]:
    """Return list of spellings for a wordbook."""
    path = SEED / f"{wordbook}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return [w["spelling"] for w in data if w.get("spelling")]


def fetch_google_tts(spelling: str, variant: str, retries: int = 2) -> bytes | None:
    """Fetch MP3 from Google TTS. variant is 'us' or 'uk' (Google only does en-US; for UK we use same pronunciation)."""
    # Google TTS lang codes: en-US = American, en-GB = British
    lang = "en-GB" if variant == "uk" else "en-US"
    url = f"{GOOGLE_TTS}?ie=UTF-8&q={quote(spelling)}&tl={lang}&client=tw-ob"
    last_err = None
    for attempt in range(retries):
        try:
            req = Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "audio/mpeg, audio/*, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Referer": "https://translate.google.com/",
                },
            )
            with urlopen(req, timeout=15) as resp:
                data = resp.read()
            if len(data) > 500 and (data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3") or data[:1] == b"\xff"):
                return data
            last_err = f"non-audio ({len(data)} bytes)"
        except Exception as exc:
            last_err = f"{type(exc).__name__}: {exc}"
        if attempt < retries - 1:
            time.sleep(0.5)
    return None


def main() -> int:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    FAILED_LOG.unlink(missing_ok=True)

    # Build task list: all phrases without audio
    tasks: list[tuple[str, str, str]] = []  # (spelling, variant, fpath)
    for wb in NEW_WORDBOOKS:
        for spelling in collect_phrases(wb):
            if not is_phrase(spelling):
                continue  # only phrases go through Google TTS
            for variant in ("us", "uk"):
                fpath = AUDIO_DIR / f"{normalize(spelling)}.{variant}.mp3"
                if not fpath.exists():
                    tasks.append((spelling, variant, str(fpath)))

    # Dedupe by (spelling, variant) — same phrase in multiple wordbooks
    seen = set()
    unique_tasks = []
    for sp, v, fp in tasks:
        key = (sp.lower(), v)
        if key in seen:
            continue
        seen.add(key)
        unique_tasks.append((sp, v, fp))
    tasks = unique_tasks

    if not tasks:
        print("[ok] all phrases already have audio")
        return 0

    print(f"[plan] {len(tasks)} phrase files to fetch from Google TTS")
    succeeded = 0
    failed: list[tuple[str, str, str]] = []
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch_google_tts, sp, v): (sp, v, fp) for sp, v, fp in tasks}
        for fut in as_completed(futures):
            sp, v, fp = futures[fut]
            data = fut.result()
            if data:
                Path(fp).write_bytes(data)
                succeeded += 1
            else:
                failed.append((sp, v, fp))
            done = succeeded + len(failed)
            if done % 20 == 0 or done == len(tasks):
                elapsed = time.time() - t0
                rate = done / elapsed if elapsed > 0 else 0
                print(f"[{done}/{len(tasks)}] {done/len(tasks)*100:.1f}% · {rate:.1f}/s · ETA {(len(tasks)-done)/rate:.0f}s")

    elapsed = time.time() - t0
    print(f"\n[done] {succeeded}/{len(tasks)} succeeded in {elapsed:.0f}s")
    if failed:
        with FAILED_LOG.open("w", encoding="utf-8") as f:
            for sp, v, fp in failed:
                f.write(f"{sp}\t{v}\t{fp}\n")
        print(f"[warn] {len(failed)} failed; see {FAILED_LOG}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
