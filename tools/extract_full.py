"""Full extraction: every page of every book, both engines.

Wave 3 deliverable. Writes:
  raw/book_a/pages.jsonl      — PyMuPDF per-page line dump (Book A, 167 pages)
  raw/book_a/pages.plumber.jsonl  — pdfplumber per-page line dump (Book A)
  raw/book_b/pages.jsonl      — Book B, 323 pages
  raw/book_b/pages.plumber.jsonl

Each line of the JSONL is one page dict:
  {"page": int, "engine": str, "lines": [{text, bbox}], "raw_text": str}

Run:  python3 tools/extract_full.py
Takes ~30-60 seconds per book (both engines, all pages).
"""
from __future__ import annotations

import json
import sys
import time
import warnings
from pathlib import Path

import fitz  # PyMuPDF
import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"

BOOKS = {
    "book_a": ROOT / "雅思词汇真经 - 共3,611词 _ 无痛单词.pdf",
    "book_b": ROOT / "IELTS - 共7,076词 _ 无痛单词.pdf",
}


def extract_pymupdf_all(pdf_path: Path) -> list[dict]:
    pages = []
    doc = fitz.open(pdf_path)
    try:
        for i in range(doc.page_count):
            page = doc[i]
            page_dict = page.get_text("dict")
            lines = []
            for block in page_dict.get("blocks", []):
                for line in block.get("lines", []):
                    text = "".join(span.get("text", "") for span in line.get("spans", []))
                    bbox = line.get("bbox", [0, 0, 0, 0])
                    if text.strip():
                        lines.append({"text": text, "bbox": list(bbox)})
            pages.append({
                "page": i + 1,
                "engine": "pymupdf",
                "lines": lines,
                "raw_text": page.get_text("text"),
            })
    finally:
        doc.close()
    return pages


def extract_pdfplumber_all(pdf_path: Path) -> list[dict]:
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            lines = []
            for line in page.extract_text_lines():
                text = (line.get("text") or "").strip()
                if not text:
                    continue
                lines.append({
                    "text": text,
                    "top": float(line.get("top", 0)),
                    "x0": float(line.get("x0", 0)),
                    "x1": float(line.get("x1", 0)),
                    "bottom": float(line.get("bottom", 0)),
                })
            pages.append({
                "page": i + 1,
                "engine": "pdfplumber",
                "lines": lines,
                "raw_text": page.extract_text() or "",
            })
    return pages


def main() -> int:
    warnings.filterwarnings("ignore")

    summary = []
    for book_id, pdf_path in BOOKS.items():
        if not pdf_path.exists():
            print(f"[FAIL] {book_id}: {pdf_path} not found")
            return 1

        out_dir = RAW / book_id
        out_dir.mkdir(parents=True, exist_ok=True)

        t0 = time.time()
        pymu_pages = extract_pymupdf_all(pdf_path)
        t_pymu = time.time() - t0

        t0 = time.time()
        plumb_pages = extract_pdfplumber_all(pdf_path)
        t_plumb = time.time() - t0

        with open(out_dir / "pages.jsonl", "w", encoding="utf-8") as f:
            for p in pymu_pages:
                f.write(json.dumps(p, ensure_ascii=False) + "\n")

        with open(out_dir / "pages.plumber.jsonl", "w", encoding="utf-8") as f:
            for p in plumb_pages:
                f.write(json.dumps(p, ensure_ascii=False) + "\n")

        total_lines_pymu = sum(len(p["lines"]) for p in pymu_pages)
        total_lines_plumb = sum(len(p["lines"]) for p in plumb_pages)
        print(
            f"[OK] {book_id}: {len(pymu_pages)} pages, "
            f"PyMuPDF {total_lines_pymu} lines ({t_pymu:.1f}s), "
            f"pdfplumber {total_lines_plumb} lines ({t_plumb:.1f}s)"
        )
        summary.append({
            "book": book_id,
            "pages": len(pymu_pages),
            "pymupdf_lines": total_lines_pymu,
            "pymupdf_secs": round(t_pymu, 1),
            "pdfplumber_lines": total_lines_plumb,
            "pdfplumber_secs": round(t_plumb, 1),
        })

    (RAW / "extract_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2)
    )
    print(f"\nSummary: {RAW / 'extract_summary.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())