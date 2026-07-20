"""Wave 4: run parser on every page of every book, both engines.

Reads raw/{book}/pages.{engine}.jsonl → writes parsed/{book}/words.{engine}.jsonl
Also runs jsonschema validation on the PyMuPDF parses (primary path).

Usage: python3 tools/parse_full.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
PARSED = ROOT / "parsed"
SCHEMA = ROOT / "schema" / "yasi_word.schema.json"

sys.path.insert(0, str(ROOT / "src"))
from parser import parse_page_lines


def pymupdf_lines_to_bbox_lines(pymu_pages: list[dict]) -> list[tuple[int, list[dict]]]:
    """Yield (page_num, line_list_with_bbox)."""
    for p in pymu_pages:
        yield p["page"], p["lines"]


def plumber_lines_to_bbox_lines(plumb_pages: list[dict]) -> list[tuple[int, list[dict]]]:
    """Convert pdfplumber [{text, top, x0, x1, bottom}] → [{text, bbox: [x0, top, x1, bottom]}]."""
    for p in plumb_pages:
        converted = []
        for line in p["lines"]:
            converted.append({
                "text": line["text"],
                "bbox": [line["x0"], line["top"], line["x1"], line["bottom"]],
            })
        yield p["page"], converted


def load_pages(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    validator = jsonschema.Draft7Validator(schema)

    summary = []
    for book_id in ("book_a", "book_b"):
        out_dir = PARSED / book_id
        out_dir.mkdir(parents=True, exist_ok=True)

        for engine, loader, lines_adapter in (
            ("pymupdf", load_pages, pymupdf_lines_to_bbox_lines),
            ("pdfplumber", load_pages, plumber_lines_to_bbox_lines),
        ):
            suffix = "plumber" if engine == "pdfplumber" else "jsonl"
            if engine == "pymupdf":
                pages_path = RAW / book_id / "pages.jsonl"
            else:
                pages_path = RAW / book_id / "pages.plumber.jsonl"
            pages = load_pages(pages_path)
            t0 = time.time()
            all_words = []
            for page_num, lines in lines_adapter(pages):
                for word in parse_page_lines(lines):
                    word["_page"] = page_num
                    word["_engine"] = engine
                    all_words.append(word)
            elapsed = time.time() - t0

            out_path = out_dir / f"words.{engine}.jsonl"
            with open(out_path, "w", encoding="utf-8") as f:
                for w in all_words:
                    f.write(json.dumps(w, ensure_ascii=False) + "\n")

            print(f"[OK] {book_id}/{engine}: {len(all_words)} records ({elapsed:.1f}s) → {out_path}")
            summary.append({
                "book": book_id,
                "engine": engine,
                "records": len(all_words),
                "secs": round(elapsed, 1),
            })

        # jsonschema validation on PyMuPDF (primary) only — pdfplumber cross-checked in Wave 4.X
        primary_path = out_dir / "words.pymupdf.jsonl"
        validation_errors = 0
        with open(primary_path, encoding="utf-8") as f:
            for i, line in enumerate(f, start=1):
                rec = json.loads(line)
                # Strip the internal metadata fields before validation
                clean = {k: v for k, v in rec.items() if not k.startswith("_")}
                errors = list(validator.iter_errors(clean))
                if errors:
                    validation_errors += 1
                    if validation_errors <= 3:
                        print(f"  [SCHEMA] line {i} ({rec.get('spelling')}): {errors[0].message}")
        print(f"[SCHEMA] {book_id}: {validation_errors} validation errors on {sum(1 for _ in open(primary_path))} records")

    (PARSED / "parse_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())