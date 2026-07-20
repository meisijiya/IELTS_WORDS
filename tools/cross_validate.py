"""Wave 4.X: cross-validate PyMuPDF-parsed spellings against pdfplumber raw_text.

For each parsed record, verify its `spelling` appears in the corresponding page's
pdfplumber raw_text. Disagreements logged for human review.

Reads:
  parsed/{book}/words.pymupdf.jsonl
  raw/{book}/pages.plumber.jsonl

Writes:
  diff/{book}/missing_in_plumber.jsonl   — spellings PyMuPDF saw but pdfplumber missed
  diff/{book}/stats.json                 — agreement rate per book

Usage: python3 tools/cross_validate.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARSED = ROOT / "parsed"
RAW = ROOT / "raw"
DIFF = ROOT / "diff"


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    summary = []
    for book_id in ("book_a", "book_b"):
        parsed = load_jsonl(PARSED / book_id / "words.pymupdf.jsonl")
        plumber_pages = load_jsonl(RAW / book_id / "pages.plumber.jsonl")
        plumber_text_by_page = {p["page"]: p["raw_text"] for p in plumber_pages}

        out_dir = DIFF / book_id
        out_dir.mkdir(parents=True, exist_ok=True)

        missing = []
        for rec in parsed:
            page = rec.get("_page")
            spelling = rec.get("spelling", "")
            text = plumber_text_by_page.get(page, "")
            if spelling not in text:
                missing.append({
                    "page": page,
                    "spelling": spelling,
                    "glosses_first": rec.get("glosses", [{}])[0].get("meaning", "")[:80] if rec.get("glosses") else "",
                })

        agreement_rate = (len(parsed) - len(missing)) / len(parsed) if parsed else 0.0
        with open(out_dir / "missing_in_plumber.jsonl", "w", encoding="utf-8") as f:
            for m in missing:
                f.write(json.dumps(m, ensure_ascii=False) + "\n")

        stats = {
            "book": book_id,
            "pymupdf_records": len(parsed),
            "missing_in_plumber": len(missing),
            "agreement_rate": round(agreement_rate, 4),
        }
        (out_dir / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2))
        print(f"[OK] {book_id}: {len(parsed) - len(missing)}/{len(parsed)} spellings found in pdfplumber "
              f"(agreement: {agreement_rate:.2%}); {len(missing)} missing → {out_dir / 'missing_in_plumber.jsonl'}")
        summary.append(stats)

    (DIFF / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())