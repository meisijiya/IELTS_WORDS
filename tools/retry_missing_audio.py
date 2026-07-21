#!/usr/bin/env python3
"""tools/retry_missing_audio.py — Re-attempt failed audio downloads.

Reads missing-list file (one row per <spelling>\\t<accent>) or rebuilds
it via check_audio.py. Spawns the same fetcher with throttled settings.

Usage:
    python3 tools/retry_missing_audio.py --input /tmp/missing-concise.txt
    python3 tools/retry_missing_audio.py --wordbook concise
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import check_audio  # type: ignore[import-not-found]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="path to missing-list TSV (spelling<TAB>accent)")
    ap.add_argument("--wordbook", help="build missing-list via check_audio and retry")
    ap.add_argument("--concurrency", type=int, default=2)
    ap.add_argument("--delay", type=float, default=0.6)
    args = ap.parse_args()

    if not args.input and not args.wordbook:
        ap.error("either --input or --wordbook required")

    if not args.input:
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as fh:
            tmp_path = fh.name
        subprocess.run(
            ["python3", str(ROOT / "tools" / "check_audio.py"), "--out", tmp_path],
            check=True,
        )
        args.input = tmp_path

    # Filter the input: skip pairs where the file actually exists
    rows = []
    with open(args.input, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue
            sp, accent = line.split("\t", 1)
            target = ROOT / "public" / "audio" / f"{check_audio.import_norm()(sp)}.{accent}.mp3"
            if not target.exists():
                rows.append((sp, accent))

    print(f"retrying {len(rows)} missing files (after skipping already-present)", file=sys.stderr)

    if not rows:
        print("nothing to retry", file=sys.stderr)
        return 0

    # Build args for the existing fetcher
    sys.path.insert(0, str(ROOT / "tools"))
    import fetch_pronunciations as fp  # type: ignore[import-not-found]

    # Synthesize a custom plan: only retry the missing pairs.
    AUDIO_DIR = fp.AUDIO_DIR
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    failed_log = AUDIO_DIR / "FAILED.txt"
    # Read existing FAILED.txt to keep history; we'll append.
    if failed_log.exists():
        existing_failures = set(failed_log.read_text(encoding="utf-8").splitlines())
    else:
        existing_failures = set()

    succeeded = 0
    failed: list[tuple[str, str, str]] = []
    type_id = {"us": 2, "uk": 1}

    from concurrent.futures import ThreadPoolExecutor, as_completed

    def one(item):
        sp, accent = item
        typeid_ = type_id[accent]
        data = fp.fetch(sp, typeid_)
        normed = check_audio.import_norm()(sp)
        target = AUDIO_DIR / f"{normed}.{accent}.mp3"
        return sp, accent, str(target), data

    items = list(rows)
    t0 = fp.time.time()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futs = {pool.submit(one, it): it for it in items}
        completed = 0
        for fut in as_completed(futs):
            sp, accent, target, data = fut.result()
            completed += 1
            if data:
                Path(target).write_bytes(data)
                succeeded += 1
            else:
                failed.append((sp, accent, target))
            if completed % 25 == 0 or completed == len(items):
                rate = completed / (fp.time.time() - t0)
                print(
                    f"[{completed}/{len(items)}] {rate:.1f}/s",
                    file=sys.stderr,
                )

    # Append only truly new failures (avoid dupes on rerun)
    new_failures: list[str] = []
    for sp, accent, fp_path in failed:
        line = f"{sp}\t{accent}\t{fp_path}"
        if line not in existing_failures:
            new_failures.append(line)
    failed_log.write_text(
        "\n".join([*existing_failures, *new_failures]) + "\n",
        encoding="utf-8",
    )

    print(
        f"[done] {succeeded}/{len(items)} succeeded in {fp.time.time() - t0:.0f}s",
        file=sys.stderr,
    )
    print(f"[warn] {len(failed)} failed; appended to {failed_log}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
