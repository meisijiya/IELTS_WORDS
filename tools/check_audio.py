#!/usr/bin/env python3
"""tools/check_audio.py — Cross-reference DB spellings vs audio files on disk.

Reports which (word, accent) pairs are missing. Reads from the DB via
SQLAlchemy-free direct SQL (matches Prisma's sqlite layout).

Usage:
    python3 tools/check_audio.py
    python3 tools/check_audio.py --wordbook full > missing-full.txt

Output:
    [missing-<wordbook>.txt]  one row per missing (spelling, accent) pair
"""
import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "prisma" / "dev.db"
AUDIO = ROOT / "public" / "audio"


def norm(spelling: str) -> str:
    return (
        spelling.lower()
        .replace("[^a-z0-9]+", "-")  # type: ignore[arg-type]
        .replace("-+", "-")
        .strip("-")
    )


def import_norm():
    import re

    def _n(s: str) -> str:
        return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-"))

    return _n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wordbook", help="filter to wordbook slug (e.g. concise / full)")
    ap.add_argument("--out", help="output file (default stdout)")
    args = ap.parse_args()

    if not DB.exists():
        print(f"ERR: db not found at {DB}", file=sys.stderr)
        return 1
    if not AUDIO.is_dir():
        print(f"ERR: audio dir not found at {AUDIO}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(str(DB))
    cur = conn.cursor()

    if args.wordbook:
        cur.execute(
            "SELECT w.spelling FROM Word w JOIN Wordbook b ON b.id = w.wordbookId "
            "WHERE b.slug = ? ORDER BY w.id",
            (args.wordbook,),
        )
    else:
        cur.execute("SELECT spelling FROM Word ORDER BY id")
    spellings = [row[0] for row in cur.fetchall()]
    conn.close()

    norm = import_norm()
    on_disk_us = set()
    on_disk_uk = set()
    for path in AUDIO.iterdir():
        if path.suffix != ".mp3":
            continue
        name = path.name.removesuffix(".mp3")
        if name.endswith(".us"):
            on_disk_us.add(name.removesuffix(".us"))
        elif name.endswith(".uk"):
            on_disk_uk.add(name.removesuffix(".uk"))

    missing: list[tuple[str, str]] = []
    seen_spelling = set()
    for sp in spellings:
        n = norm(sp)
        if not n or n in seen_spelling:
            continue
        seen_spelling.add(n)
        if n not in on_disk_us:
            missing.append((sp, "us"))
        if n not in on_disk_uk:
            missing.append((sp, "uk"))

    out_lines = [f"{sp}\t{accent}" for sp, accent in missing]

    target = Path(args.out) if args.out else None
    if target:
        target.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
        print(f"wrote {len(out_lines)} missing entries to {target}", file=sys.stderr)
    else:
        print("\n".join(out_lines))
    print(
        f"summary: {len(spellings)} spellings · {len(on_disk_us)} us files · "
        f"{len(on_disk_uk)} uk files · {len(missing)} missing",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
