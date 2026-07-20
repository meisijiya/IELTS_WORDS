"""Wave 8: Accuracy gate — sample random records, verify against PDF.

Reads seed/{book}.json + corresponding PDF → reports spelling + gloss accuracy.

Usage:
  python3 tools/gate.py                # both books, sample 30 + 50
  python3 tools/gate.py --sample 100   # both books, sample 100 each
  python3 tools/gate.py --strict       # exit non-zero on any miss
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "seed"

BOOKS = {
    "yasi_concise.json": "雅思词汇真经 - 共3,611词 _ 无痛单词.pdf",
    "ielts_full.json": "IELTS - 共7,076词 _ 无痛单词.pdf",
}


def norm(s: str) -> str:
    return re.sub(r"[\s,.，;。!?:、\-—()]+", "", s)


def load_pdf_normalized(pdf_path: Path) -> str:
    out = []
    with fitz.open(pdf_path) as doc:
        for p in doc:
            out.append(p.get_text("text"))
    return norm("".join(out))


def check_sample(records: list[dict], pdf_norm: str) -> tuple[int, int, list[str]]:
    ok_spell = 0
    ok_gloss = 0
    issues = []
    for w in records:
        if norm(w["spelling"]) in pdf_norm:
            ok_spell += 1
        else:
            issues.append(f"SPELL MISS: {w['spelling']}")
        if any(norm(g["meaning"]) in pdf_norm for g in w.get("glosses", [])):
            ok_gloss += 1
        else:
            issues.append(f"GLOSS MISS: {w['spelling']} → {w['glosses'][0]['meaning'][:40]}")
    return ok_spell, ok_gloss, issues


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=None, help="per-book sample size (default: 30 for A, 50 for B)")
    ap.add_argument("--seed", type=int, default=42, help="random seed")
    ap.add_argument("--strict", action="store_true", help="exit non-zero on any miss")
    args = ap.parse_args()

    random.seed(args.seed)
    default_samples = {"yasi_concise.json": 30, "ielts_full.json": 50}
    total_ok_spell = 0
    total_ok_gloss = 0
    total_records = 0
    all_issues: list[str] = []

    for filename, pdf_name in BOOKS.items():
        seed_path = SEED / filename
        pdf_path = ROOT / pdf_name
        records = json.loads(seed_path.read_text(encoding="utf-8"))
        n = args.sample or default_samples[filename]
        sample = random.sample(records, n)

        pdf_norm = load_pdf_normalized(pdf_path)
        ok_s, ok_g, issues = check_sample(sample, pdf_norm)
        total_ok_spell += ok_s
        total_ok_gloss += ok_g
        total_records += n
        all_issues.extend(issues)

        print(f"[{filename}] {ok_s}/{n} spelling, {ok_g}/{n} gloss "
              f"({ok_s / n:.1%} / {ok_g / n:.1%}) — sample size {n}")

    print()
    print(f"=== TOTAL ===")
    print(f"Spelling: {total_ok_spell}/{total_records} = {total_ok_spell / total_records:.2%}")
    print(f"Gloss:    {total_ok_gloss}/{total_records} = {total_ok_gloss / total_records:.2%}")
    print(f"GATE:     {'PASS ✅' if total_ok_spell == total_records and total_ok_gloss == total_records else 'FAIL ❌'}")

    if all_issues:
        print(f"\n{len(all_issues)} issues found:")
        for i in all_issues[:20]:
            print(f"  - {i}")

    if args.strict and all_issues:
        return 1
    return 0 if total_ok_spell == total_records and total_ok_gloss == total_records else 1


if __name__ == "__main__":
    sys.exit(main())