"""Extract sample pages from both PDFs with both engines.

Used in Wave 1 to build grammar.md + golden.json fixtures.

Usage:
  python3 tools/extract_sample.py

Writes:
  fixtures/book_a/pages/{nn}.pymupdf.json
  fixtures/book_a/pages/{nn}.pdfplumber.json
  fixtures/book_b/pages/{nn}.pymupdf.json
  fixtures/book_b/pages/{nn}.pdfplumber.json

Each JSON contains:
  {
    "page": int,
    "engine": "pymupdf" | "pdfplumber",
    "lines": [{"text": str, "bbox": [x0, y0, x1, y1]}],  // pymupdf
              OR
             [{"text": str, "top": float, "x0": float, ...}], // pdfplumber
    "raw_text": str
  }
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz  # PyMuPDF
import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "fixtures"

BOOKS = {
    "book_a": ROOT / "雅思词汇真经 - 共3,611词 _ 无痛单词.pdf",
    "book_b": ROOT / "IELTS - 共7,076词 _ 无痛单词.pdf",
}


def pick_pages(total: int, n: int = 8) -> list[int]:
    """Pick n 1-indexed page numbers spread across the book.

    Spacing: front, early, mid1, mid2, late, last-3, last-2, last.
    """
    if total < n:
        return list(range(1, total + 1))
    picks = [1, 2, total // 4, total // 2, total * 3 // 4, total - 2, total - 1, total]
    # dedupe + sort
    return sorted(set(picks))[:n]


def extract_pymupdf(pdf_path: Path, pages: list[int]) -> dict[int, dict]:
    out: dict[int, dict] = {}
    doc = fitz.open(pdf_path)
    try:
        for p in pages:
            if p < 1 or p > doc.page_count:
                continue
            page = doc[p - 1]  # 0-indexed
            page_dict = page.get_text("dict")
            lines = []
            for block in page_dict.get("blocks", []):
                for line in block.get("lines", []):
                    text = "".join(span.get("text", "") for span in line.get("spans", []))
                    bbox = line.get("bbox", [0, 0, 0, 0])
                    if text.strip():
                        lines.append({"text": text, "bbox": list(bbox)})
            out[p] = {
                "page": p,
                "engine": "pymupdf",
                "lines": lines,
                "raw_text": page.get_text("text"),
            }
    finally:
        doc.close()
    return out


def extract_pdfplumber(pdf_path: Path, pages: list[int]) -> dict[int, dict]:
    out: dict[int, dict] = {}
    with pdfplumber.open(pdf_path) as pdf:
        for p in pages:
            if p < 1 or p > len(pdf.pages):
                continue
            page = pdf.pages[p - 1]
            lines = []
            # page.extract_text_lines returns ordered lines with metadata
            for line in page.extract_text_lines():
                text = (line.get("text") or "").strip()
                if not text:
                    continue
                lines.append(
                    {
                        "text": text,
                        "top": float(line.get("top", 0)),
                        "x0": float(line.get("x0", 0)),
                        "x1": float(line.get("x1", 0)),
                        "bottom": float(line.get("bottom", 0)),
                    }
                )
            out[p] = {
                "page": p,
                "engine": "pdfplumber",
                "lines": lines,
                "raw_text": page.extract_text() or "",
            }
    return out


def main() -> int:
    import warnings

    warnings.filterwarnings("ignore")  # pdfplumber FontBBox warnings

    summary = []
    for book_id, pdf_path in BOOKS.items():
        if not pdf_path.exists():
            print(f"[FAIL] {book_id}: {pdf_path} not found")
            return 1

        # Get total page count
        with pdfplumber.open(pdf_path) as pdf:
            total = len(pdf.pages)
        picks = pick_pages(total, n=8)
        print(f"[INFO] {book_id}: {total} pages, sampling {picks}")

        pymu = extract_pymupdf(pdf_path, picks)
        plumb = extract_pdfplumber(pdf_path, picks)

        out_dir = FIX / book_id / "pages"
        out_dir.mkdir(parents=True, exist_ok=True)
        for p, data in pymu.items():
            (out_dir / f"page_{p:03d}.pymupdf.json").write_text(
                json.dumps(data, ensure_ascii=False, indent=2)
            )
        for p, data in plumb.items():
            (out_dir / f"page_{p:03d}.pdfplumber.json").write_text(
                json.dumps(data, ensure_ascii=False, indent=2)
            )

        summary.append({"book": book_id, "total_pages": total, "sampled": picks})

    (FIX / "extract_sample_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2)
    )
    print(f"\nSummary: {FIX / 'extract_sample_summary.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())