"""Wave 7: generate seed JSON from PyMuPDF-parsed records.

Reads parsed/{book}/words.pymupdf.jsonl → writes seed/{name}.json.

Output format: array of word records per schema/yasi_word.schema.json
  [{spelling, pos?, glosses: [{pos, meaning}], flags?}, ...]

Usage: python3 tools/seed_export.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parent.parent
PARSED = ROOT / "parsed"
SEED = ROOT / "seed"
SCHEMA = ROOT / "schema" / "yasi_word.schema.json"

BOOK_TO_SEED = {
    "book_a": ("yasi_concise.json", "雅思词汇真经 (3611词) — 精简版"),
    "book_b": ("ielts_full.json", "IELTS (7076词) — 完整版"),
}


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    SEED.mkdir(parents=True, exist_ok=True)
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    validator = jsonschema.Draft7Validator(schema)

    summary = []
    for book_id, (filename, description) in BOOK_TO_SEED.items():
        records = load_jsonl(PARSED / book_id / "words.pymupdf.jsonl")
        clean_records = []
        for rec in records:
            clean = {k: v for k, v in rec.items() if not k.startswith("_")}
            errors = list(validator.iter_errors(clean))
            if errors:
                print(f"  [SCHEMA] skip {rec.get('spelling')}: {errors[0].message}")
                continue
            clean_records.append(clean)

        out_path = SEED / filename
        out_path.write_text(
            json.dumps(clean_records, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        sizes = out_path.stat().st_size
        print(f"[OK] {book_id} → {out_path}: {len(clean_records)} records, {sizes / 1024:.1f} KB ({description})")
        summary.append({
            "book": book_id,
            "filename": filename,
            "description": description,
            "records": len(clean_records),
            "size_kb": round(sizes / 1024, 1),
        })

    (SEED / "seed_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())