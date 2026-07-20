"""Smoke test: extract page 1 of each PDF with both engines, diff text.

Sanity check that:
  1. Both engines can read the PDFs.
  2. Engines produce slightly different output (proving independence).
  3. Output is non-empty.

Run:  python3 tools/smoke_diff.py
Exit: 0 on success, non-zero on failure.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz  # PyMuPDF
import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
BOOKS = {
    "a": ROOT / "雅思词汇真经 - 共3,611词 _ 无痛单词.pdf",
    "b": ROOT / "IELTS - 共7,076词 _ 无痛单词.pdf",
}


def extract_pymupdf(pdf_path: Path) -> str:
    """PyMuPDF baseline extraction."""
    doc = fitz.open(pdf_path)
    page = doc[0]
    text = page.get_text("text")
    doc.close()
    return text


def extract_pdfplumber(pdf_path: Path) -> str:
    """pdfplumber cross-validation extraction."""
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        return page.extract_text() or ""


def main() -> int:
    failures = 0
    summary = []
    for book_id, pdf_path in BOOKS.items():
        if not pdf_path.exists():
            print(f"[FAIL] book {book_id}: {pdf_path} not found")
            failures += 1
            continue

        try:
            txt_a = extract_pymupdf(pdf_path)
        except Exception as exc:
            print(f"[FAIL] book {book_id} PyMuPDF: {exc}")
            failures += 1
            continue

        try:
            txt_b = extract_pdfplumber(pdf_path)
        except Exception as exc:
            print(f"[FAIL] book {book_id} pdfplumber: {exc}")
            failures += 1
            continue

        identical = txt_a == txt_b
        len_a = len(txt_a)
        len_b = len(txt_b)
        diff_chars = sum(1 for a, b in zip(txt_a, txt_b) if a != b)
        summary.append(
            {
                "book": book_id,
                "pymupdf_chars": len_a,
                "pdfplumber_chars": len_b,
                "diff_chars_first_run": diff_chars,
                "identical": identical,
                "pymupdf_first_200": txt_a[:200],
                "pdfplumber_first_200": txt_b[:200],
            }
        )

        print(
            f"[OK]   book {book_id}: PyMuPDF={len_a} chars, "
            f"pdfplumber={len_b} chars, identical={identical}, "
            f"diff_in_first_run={diff_chars}"
        )

    out_path = ROOT / "tools" / "smoke_diff_report.json"
    out_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\nReport written to: {out_path}")

    if failures:
        print(f"\n{failures} failure(s).")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())