"""Build audit/all_words.tsv for human review of every extracted word.

Each row:
    word_id    wordbook_slug    spelling    pos    glosses    context_in_pdf

`context_in_pdf` is the ±80 char window around the spelling in the PDF's
raw text, so a reviewer can confirm spelling / pos / glosses against the
original source.

Usage:
    python3 tools/audit.py
Writes:
    audit/all_words.tsv
    audit/all_words.book_a.tsv
    audit/all_words.book_b.tsv
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
PARSED = ROOT / "parsed"
AUDIT = ROOT / "audit"

BOOKS = {
    "book_a": "concise",
    "book_b": "full",
}

CONTEXT_CHARS = 80


def find_context(spelling: str, raw_text: str, ctx: int = CONTEXT_CHARS) -> tuple[str, int]:
    """Return (context, page_number_or_-1)."""
    for page_num, text in raw_text.items():
        idx = text.find(spelling)
        if idx == -1:
            idx = text.lower().find(spelling.lower())
        if idx == -1:
            continue
        start = max(0, idx - ctx)
        end = min(len(text), idx + len(spelling) + ctx)
        snippet = text[start:end].replace("\n", " ").replace("\r", " ")
        return snippet, page_num
    return "", -1


def serialize_glosses(glosses: list[dict]) -> str:
    parts = []
    for g in glosses:
        parts.append(f"{g['pos']} {g['meaning']}" if g.get("pos") else g["meaning"])
    return " | ".join(parts)


def build_for_book(book_dir: str, slug: str) -> list[list[str]]:
    words_path = PARSED / book_dir / "words.pymupdf.jsonl"
    pages_path = RAW / book_dir / "pages.jsonl"

    if not words_path.exists() or not pages_path.exists():
        print(f"[skip] {book_dir}: missing files")
        return []

    words: list[dict] = []
    for line in words_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            words.append(json.loads(line))

    pages: list[dict] = []
    for line in pages_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            pages.append(json.loads(line))

    page_texts = {p["page"]: p["raw_text"] for p in pages}

    rows: list[list[str]] = []
    for w in words:
        spelling = w["spelling"]
        pos = w.get("pos") or ""
        glosses_str = serialize_glosses(w.get("glosses", []))
        ctx, page_num = find_context(spelling, page_texts)
        word_id = w.get("_page") or ""
        row = [
            str(word_id),
            slug,
            spelling,
            pos,
            glosses_str,
            str(page_num),
            ctx,
        ]
        rows.append(row)

    return rows


def main() -> None:
    AUDIT.mkdir(exist_ok=True)

    all_rows: list[list[str]] = []
    for book_dir, slug in BOOKS.items():
        rows = build_for_book(book_dir, slug)
        if not rows:
            continue
        header = ["page", "wordbook", "spelling", "pos", "glosses", "found_on_page", "context"]
        out_path = AUDIT / f"all_words.{slug}.tsv"
        lines = ["\t".join(header)] + ["\t".join(r) for r in rows]
        out_path.write_text("\n".join(lines), encoding="utf-8")
        print(f"[ok] {slug}: {len(rows)} rows → {out_path}")
        all_rows.extend(rows)

    if all_rows:
        header = ["page", "wordbook", "spelling", "pos", "glosses", "found_on_page", "context"]
        combined = AUDIT / "all_words.tsv"
        combined.write_text(
            "\n".join(["\t".join(header)] + ["\t".join(r) for r in all_rows]),
            encoding="utf-8",
        )
        print(f"[ok] combined: {len(all_rows)} rows → {combined}")


if __name__ == "__main__":
    main()