"""Parse 大学英语六级词汇表 .docx → seed/cet6.json.

docx structure (verified by inspecting word/document.xml):
- single big table, one row per word
- 4 cells per row: 序号 (number) / 单词 (spelling) / 音标 (phonetic) / 释义 (definition)
- phonetic has extra spaces between IPA chars: `/ ə ˈ bænd ə n/`
  → cleaned to `/əˈbændən/`
- 释义 may have multiple POS (v./n./adj.) separated by spaces
- some rows include proper-name glosses: `n. (Able) 人名；...`
  → kept as-is (defensive split on first POS marker per gloss)

Output schema (matches existing seed/yasi_concise.json):
[
  { "spelling": "abandon", "pos": "v.", "glosses": [{"pos":"v.","meaning":"..."}] },
  ...
]

Run:  python3 tools/parse_cet6.py
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "大学英语六级词汇表(全)含音标.docx"
SEED = ROOT / "seed" / "cet6.json"

NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# POS marker patterns (each line starts with one of these)
POS_MARKER = re.compile(r"^(v\.|n\.|adj\.|adv\.|vt\.|vi\.|prep\.|conj\.|pron\.|int\.|art\.|num\.|aux\.|pl\.|sing\.|abbr\.|pref\.|suf\.|cap\.|[a-z]\.\s)")


def extract_text_per_row(docx_path: Path) -> list[list[str]]:
    """Return rows of cell-text from the first table in the document."""
    with zipfile.ZipFile(docx_path) as z:
        xml = z.read("word/document.xml").decode("utf-8")

    # Walk every <w:tr> in document order; each <w:tc> in a row becomes one cell.
    # We use simple tag matching rather than XML parsing to avoid namespace boilerplate.
    rows: list[list[str]] = []
    tr_iter = re.finditer(r"<w:tr\b[^>]*>(.*?)</w:tr>", xml, re.DOTALL)
    for tr_match in tr_iter:
        body = tr_match.group(1)
        cells: list[str] = []
        for tc_match in re.finditer(r"<w:tc\b[^>]*>(.*?)</w:tc>", body, re.DOTALL):
            cell_body = tc_match.group(1)
            # Collect text from all <w:t> runs, preserve newlines from <w:br/>
            # by converting <w:br/> to a single space (the table cells use
            # line breaks to separate multi-POS gloss lines, which we want).
            cell_body = re.sub(r"<w:br\s*/>", " ", cell_body)
            texts = re.findall(r"<w:t[^>]*>([^<]*)</w:t>", cell_body)
            cells.append("".join(texts).strip())
        if cells:
            rows.append(cells)
    return rows


def clean_phonetic(raw: str) -> str | None:
    """Strip extra spaces between IPA chars. '/ ə ˈ bænd ə n/' → '/əˈbændən/'.
    Returns None if input looks malformed."""
    if not raw:
        return None
    # Remove ALL whitespace inside the slashes
    m = re.match(r"^\s*/\s*(.*?)\s*/\s*$", raw, re.DOTALL)
    if not m:
        return None
    inner = re.sub(r"\s+", "", m.group(1))
    return f"/{inner}/"


def parse_glosses(raw: str) -> tuple[str | None, list[dict]]:
    """Split 释义 into [{pos, meaning}] entries; first POS is also returned as
    the word-level 'pos' field.

    The docx sometimes stuffs multi-POS into one cell:
      "v.  遗弃；离开；放弃；终止；陷入 n.  放任，狂热"
    We split on POS markers (v./n./adj./etc.) — including a leading one at
    start-of-cell which the split-with-lookbehind regex misses.

    Returns (primary_pos, glosses). Either may be None/[] if parsing fails.
    """
    if not raw or not raw.strip():
        return None, []

    text = raw.replace("；", "; ").replace("，", ", ").strip()
    text = re.sub(r"\s+", " ", text)

    pos_pattern = re.compile(
        r"(?:(?<=^)|(?<=[\s;,，；、])|(?<=[一-鿿]))\s*(v\.|n\.|adj\.|adv\.|vt\.|vi\.|prep\.|conj\.|pron\.|int\.|art\.|num\.|aux\.)",
        re.IGNORECASE,
    )

    parts = pos_pattern.split(text)
    parts = [p for p in parts if p.strip()]

    glosses: list[dict] = []
    primary_pos: str | None = None
    i = 0
    while i < len(parts):
        pos = parts[i].strip()
        meaning = parts[i + 1].strip().rstrip(",;") if i + 1 < len(parts) else ""
        i += 2
        if not pos or not meaning:
            continue
        glosses.append({"pos": pos, "meaning": meaning})
        if primary_pos is None:
            primary_pos = pos

    if not glosses:
        glosses = [{"pos": "", "meaning": text}]
        primary_pos = None

    return primary_pos, glosses


def main() -> int:
    if not SOURCE.exists():
        print(f"missing source: {SOURCE}", file=sys.stderr)
        return 1

    rows = extract_text_per_row(SOURCE)
    print(f"raw rows: {len(rows)}")

    # Filter out the header row(s) — they're the ones whose first cell is "序号"
    # or any non-numeric content. Valid word rows have an integer first cell.
    out: list[dict] = []
    skipped = 0
    seen: set[str] = set()
    for cells in rows:
        if len(cells) < 4:
            skipped += 1
            continue
        seq, spelling, phonetic_raw, gloss_raw = cells[0], cells[1], cells[2], cells[3]
        if not seq.isdigit():
            skipped += 1
            continue
        spelling = spelling.strip()
        if not spelling or not re.match(r"^[A-Za-z][A-Za-z\s'/-]*$", spelling):
            skipped += 1
            continue
        # Dedup by lowercased spelling
        key = spelling.lower()
        if key in seen:
            continue
        seen.add(key)

        phonetic = clean_phonetic(phonetic_raw)
        primary_pos, glosses = parse_glosses(gloss_raw)
        out.append({
            "spelling": spelling,
            "pos": primary_pos,
            "glosses": glosses,
            # NOTE: seed schema doesn't include phonetic, but we keep it for
            # future use. fetch_pronunciations.py only needs 'spelling'.
            **({"phonetic": phonetic} if phonetic else {}),
        })

    SEED.parent.mkdir(parents=True, exist_ok=True)
    SEED.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {SEED} — {len(out)} unique words, {skipped} rows skipped")
    # Spot-check first 3
    for w in out[:3]:
        print(json.dumps(w, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())