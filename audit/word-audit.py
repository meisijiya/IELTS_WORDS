"""Word-level audit for all wordbooks.

Five checks:
1. Schema integrity (every word has spelling, pos, glosses)
2. Empty / suspicious gloss content
3. Cross-book consistency (same spelling in 2+ books → do definitions agree?)
4. Anomalies (extreme lengths, special chars, missing phonetic when claimed)
5. POS distribution stats

Output: audit/word-audit-report.md
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "seed"
OUT = ROOT / "audit" / "word-audit-report.md"

WORDBOOKS = [
    ("concise", "雅思词汇真经（精简版）", "yasi_concise.json"),
    ("full",    "IELTS（完整版）",       "ielts_full.json"),
    ("cet6",    "大学英语六级词汇",      "cet6.json"),
]

# A POS marker is one of these — used for sanity checks on parsed pos values
POS_PATTERN = re.compile(r"^(v\.|n\.|adj\.|adv\.|vt\.|vi\.|prep\.|conj\.|pron\.|int\.|art\.|num\.|aux\.|cap\.|pref\.|suf\.|abbr\.|pl\.|sing\.)$")


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    book_data: dict[str, list[dict]] = {}
    for slug, _name, filename in WORDBOOKS:
        path = SEED / filename
        if not path.exists():
            print(f"skip {slug}: file missing", file=sys.stderr)
            continue
        book_data[slug] = json.loads(path.read_text(encoding="utf-8"))

    md: list[str] = []
    md.append("# Word-Level Audit Report\n")
    md.append(f"**Generated**: {__import__('datetime').datetime.now().isoformat(timespec='seconds')}\n")
    md.append(f"**Books**: {', '.join(s for s, _, _ in WORDBOOKS)}\n\n")

    md.append("## 1. Schema Integrity\n\n")
    md.append("| Book | Total | Missing spelling | Missing pos | Empty glosses | No pos on word | No pos on gloss |\n")
    md.append("|---|---|---|---|---|---|---|\n")
    for slug, name, _fn in WORDBOOKS:
        words = book_data.get(slug, [])
        miss_spelling = sum(1 for w in words if not w.get("spelling"))
        miss_pos = sum(1 for w in words if "pos" not in w)
        empty_glosses = sum(1 for w in words if not w.get("glosses") or len(w.get("glosses", [])) == 0)
        word_pos_blank = sum(1 for w in words if w.get("pos") in (None, ""))
        gloss_pos_blank = sum(
            1 for w in words
            for g in w.get("glosses", [])
            if not g.get("pos")
        )
        md.append(f"| {name} ({slug}) | {len(words)} | {miss_spelling} | {miss_pos} | {empty_glosses} | {word_pos_blank} | {gloss_pos_blank} |\n")

    md.append("\n## 2. Empty / Suspicious Glosses\n\n")
    md.append("Words with empty glosses are listed below (should be 0 in clean data).\n\n")
    for slug, name, _fn in WORDBOOKS:
        words = book_data.get(slug, [])
        empties = [w for w in words if not w.get("glosses") or len(w.get("glosses", [])) == 0]
        if empties:
            md.append(f"### {name} — {len(empties)} entries with empty glosses\n\n")
            for w in empties[:20]:
                md.append(f"- `{w.get('spelling', '<MISSING>')}` pos=`{w.get('pos')}` glosses={w.get('glosses')}\n")
            if len(empties) > 20:
                md.append(f"- ... ({len(empties) - 20} more)\n")
            md.append("\n")
        else:
            md.append(f"- **{name}**: 0 entries with empty glosses ✓\n")

    md.append("\n## 3. Cross-Book Consistency\n\n")
    md.append("Same spelling in multiple books — definitions should match.\n\n")
    spelling_to_books: dict[str, dict[str, dict]] = defaultdict(dict)
    for slug, _name, _fn in WORDBOOKS:
        for w in book_data.get(slug, []):
            sp = w.get("spelling", "").lower().strip()
            if sp:
                spelling_to_books[sp][slug] = w

    overlaps = {sp: books for sp, books in spelling_to_books.items() if len(books) >= 2}
    md.append(f"**Spelling overlap across books**: {len(overlaps)} words appear in ≥2 books\n\n")

    # Sample 30 disagreements (where pos or first gloss meaning differs)
    disagree = []
    for sp, books in overlaps.items():
        ref = next(iter(books.values()))
        ref_pos = ref.get("pos")
        ref_meaning = ref.get("glosses", [{}])[0].get("meaning", "").strip().rstrip(",;")
        for slug, w in books.items():
            if slug == list(books.keys())[0]:
                continue
            if w.get("pos") != ref_pos:
                disagree.append((sp, "pos", ref_pos, w.get("pos"), list(books.keys())))
            else:
                m = w.get("glosses", [{}])[0].get("meaning", "").strip().rstrip(",;")
                if m != ref_meaning:
                    disagree.append((sp, "first-meaning", ref_meaning[:30], m[:30], list(books.keys())))

    md.append(f"**Pos / first-meaning disagreements**: {len(disagree)} (sample 30 below)\n\n")
    md.append("| Spelling | Field | Ref | Other | In books |\n")
    md.append("|---|---|---|---|---|\n")
    for sp, field, ref_val, other_val, books in disagree[:30]:
        md.append(f"| `{sp}` | {field} | `{ref_val}` | `{other_val}` | {', '.join(books)} |\n")

    md.append(f"\n> Full disagreement count: {len(disagree)}. Of {len(overlaps)} overlapped words.\n")
    if len(overlaps) > 0:
        rate = len(disagree) * 100 / len(overlaps)
        md.append(f"> Disagreement rate: **{rate:.1f}%** of overlap\n")

    md.append("\n## 4. Anomaly Checks\n\n")
    md.append("Spelling-level anomalies (regex / length / encoding):\n\n")
    md.append("| Book | Spelling length > 25 | Non-ASCII in spelling | Digit in spelling | No phonetic (cet6 only) |\n")
    md.append("|---|---|---|---|---|\n")
    for slug, name, _fn in WORDBOOKS:
        words = book_data.get(slug, [])
        long_sp = sum(1 for w in words if len(w.get("spelling", "")) > 25)
        non_ascii = sum(1 for w in words if w.get("spelling") and not all(ord(c) < 128 for c in w["spelling"]))
        digit = sum(1 for w in words if w.get("spelling") and re.search(r"\d", w["spelling"]))
        no_phon = sum(1 for w in words if slug == "cet6" and not w.get("phonetic"))
        md.append(f"| {name} | {long_sp} | {non_ascii} | {digit} | {no_phon} |\n")

    md.append("\n### Sample of long / non-ASCII / digit spellings\n\n")
    for slug, name, _fn in WORDBOOKS:
        words = book_data.get(slug, [])
        sus = [w for w in words
               if len(w.get("spelling", "")) > 25
               or (w.get("spelling") and not all(ord(c) < 128 for c in w["spelling"]))
               or (w.get("spelling") and re.search(r"\d", w["spelling"]))]
        if sus:
            md.append(f"- **{name}**: {len(sus)} suspicious\n")
            for w in sus[:5]:
                md.append(f"  - `{w.get('spelling')}` pos=`{w.get('pos')}`\n")

    md.append("\n## 5. POS Distribution\n\n")
    md.append("Top 10 word-level POS markers per book:\n\n")
    for slug, name, _fn in WORDBOOKS:
        words = book_data.get(slug, [])
        c = Counter(w.get("pos") for w in words)
        md.append(f"### {name}\n\n")
        md.append("| POS | Count |\n|---|---|\n")
        for pos, n in c.most_common(10):
            md.append(f"| `{pos}` | {n} |\n")
        md.append(f"| (None) | {c.get(None, 0)} |\n\n")

    md.append("\n## 6. Gloss Counts per Word\n\n")
    md.append("How many gloss entries does each word have?\n\n")
    md.append("| Book | 1 gloss | 2 | 3 | 4 | 5+ |\n|---|---|---|---|---|---|\n")
    for slug, name, _fn in WORDBOOKS:
        words = book_data.get(slug, [])
        c = Counter(len(w.get("glosses", [])) for w in words)
        md.append(f"| {name} | {c.get(1, 0)} | {c.get(2, 0)} | {c.get(3, 0)} | {c.get(4, 0)} | {sum(v for k, v in c.items() if k >= 5)} |\n")

    OUT.write_text("".join(md), encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())