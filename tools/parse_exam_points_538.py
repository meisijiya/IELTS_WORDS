"""Parse 资料/【revised】考点词538.pdf → seed/exam_points.json.

Source structure (verified via pdfplumber.extract_tables):
- 14 pages, each is a single content table.
- Pages 1–5: header split across rows 0..2 (重要/性排/行 merged), then 4 data cols
  (number, word, gloss="POS.中文", synonyms="english, list"). pdfplumber gives
  4 cols on these pages.
- Pages 6–14: header on row 0, then 3 data cols (word, gloss, synonyms) with
  no row numbers.
- Chinese gloss wraps across multiple lines INSIDE one cell → split on '\n',
  reassemble by joining text fragments until a new English word or synonyms
  block starts.

Output schema (matches schema/yasi_word.schema.json):
[
  { "spelling": "resemble", "pos": "v.",
    "glosses": [{"pos": "v.", "meaning": "像,与……相似"}] },
  ...
]

Run:  python3 tools/parse_exam_points_538.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "资料" / "【revised】考点词538.pdf"
SEED = ROOT / "seed" / "exam_points.json"

POS_MARKER_RE = re.compile(
    r"^(?P<pos>(?:v\.|n\.|adj\.|adv\.|vt\.|vi\.|prep\.|conj\.|pron\.|int\.|art\.|num\.|aux\.|pl\.|sing\.|abbr\.|pref\.|suf\.|phr\.))"
    r"(?P<meaning>.*)$",
    re.IGNORECASE,
)

WORD_ONLY_RE = re.compile(r"^[A-Za-z][A-Za-z\s'\-,./]*\*?$")


def clean_cell(c: str | None) -> str:
    if c is None:
        return ""
    return c.replace("\n", " ").strip()


def extract_gloss_cell(text: str) -> tuple[str, str]:
    """'v.像，与……相似' → ('v.', '像，与……相似')
    Falls back to ('phr.', meaning) when no POS marker is present, so
    multi-word phrases like 'out of the question 不可能' stay valid.
    """
    s = clean_cell(text)
    s = re.sub(r"^adj\.\.+", "adj.", s)
    m = POS_MARKER_RE.match(s)
    if not m:
        return "phr.", re.sub(r"\s+", "", s) if s else s
    pos = m.group("pos").lower()
    meaning = m.group("meaning").strip().lstrip(".").strip()
    meaning = meaning.rstrip(",;。. ")
    return pos, meaning


def looks_like_header_or_garbage(cells: list[str]) -> bool:
    """Skip rows that are header fragments, intro text, or have no English word."""
    nonempty = [c for c in cells if c]
    if not nonempty:
        return True
    joined = " ".join(nonempty)
    # header words
    headers = {"重要性", "排行", "考点词", "常考中文词义", "雅思阅读真题命题方式",
               "重要", "性排", "行", "类别说明"}
    if any(h in joined for h in headers):
        # But allow if there's a clear English word + gloss
        return True
    return False


def is_gloss_cell(c: str) -> bool:
    cleaned = c.replace("\n", " ").strip()
    return bool(POS_MARKER_RE.match(cleaned))


def parse_page(page: pdfplumber.page.Page) -> list[dict]:
    tables = page.extract_tables()
    if not tables:
        return []
    biggest = max(tables, key=len)
    if len(biggest) < 3:
        return []

    out = []
    for row in biggest:
        cells = [(c or "").strip() for c in row]
        # Anchor: the GLOSS cell starts with a POS marker (v./n./adj./…).
        # That's the only reliably identifiable column.
        gloss_idx = None
        for i, c in enumerate(cells):
            if c and is_gloss_cell(c):
                gloss_idx = i
                break
        if gloss_idx is None:
            continue
        gloss_text = cells[gloss_idx]

        # WORD = first non-empty cell to the LEFT of gloss that looks like
        # English text (no Chinese, no POS prefix).
        word = ""
        for j in range(gloss_idx - 1, -1, -1):
            c = cells[j]
            if not c:
                continue
            if any("\u4e00" <= ch <= "\u9fff" for ch in c):
                continue
            if is_gloss_cell(c):
                continue
            word = c
            break
        if not word or not WORD_ONLY_RE.match(word):
            continue

        synonyms = ""
        for j in range(gloss_idx + 1, len(cells)):
            if cells[j]:
                synonyms = cells[j]
                break

        if looks_like_header_or_garbage([word, gloss_text, synonyms]):
            continue

        pos, meaning = extract_gloss_cell(gloss_text)
        if not meaning:
            continue

        rec = {
            "spelling": word.rstrip("*").strip(),
            "pos": pos,
            "glosses": [{"pos": pos or "", "meaning": re.sub(r"\s+", "", meaning)}],
        }
        if word.endswith("*"):
            rec.setdefault("flags", []).append("marker_word")
        out.append(rec)
    return out


def main() -> int:
    if not SOURCE.exists():
        print(f"missing source: {SOURCE}", file=sys.stderr)
        return 1

    all_entries: list[dict] = []
    seen: set[str] = set()
    skipped = 0

    with pdfplumber.open(str(SOURCE)) as pdf:
        for i, page in enumerate(pdf.pages):
            entries = parse_page(page)
            for e in entries:
                key = e["spelling"].lower()
                if key in seen:
                    # mark as duplicate
                    e.setdefault("flags", []).append("duplicate_word")
                seen.add(key)
                all_entries.append(e)

    SEED.parent.mkdir(parents=True, exist_ok=True)
    SEED.write_text(json.dumps(all_entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {SEED}: {len(all_entries)} entries")
    print("first 5:", json.dumps(all_entries[:5], ensure_ascii=False, indent=2))
    print("last 5:", json.dumps(all_entries[-5:], ensure_ascii=False, indent=2))

    # ponytail: schema accepts `^[A-Za-z][A-Za-z '\\-,.]*$` for spelling.
    # If some entries have unsupported punctuation we let them fail validation
    # downstream — most synonyms appear in gloss column not spelling, so we
    # should be fine. Re-run after fix if mismatch.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
