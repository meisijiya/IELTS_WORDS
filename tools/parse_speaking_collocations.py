"""Parse 资料/口语 Part1 5-8月collocations.docx → seed/speaking_collocations.json.

DOCX structure (verified via word/document.xml):
- 829 paragraphs of plain text, NO tables
- Per-topic block, divided by '⸻' lines:
    N. Topic Title
    ① English collocation phrase
    Chinese meaning (1 line)
    English example sentence (1 line, may be empty)
    适用：
    * IELTS Speaking Part 1 question
    * IELTS Speaking Part 1 question
    ② Second English collocation phrase
    ...
    ⸻
- Each topic typically has 2 collocations (① and ②) — total ~60-70

Output schema (matches schema/yasi_word.schema.json):
[
  { "spelling": "a sense of belonging",
    "pos": "phr.",
    "glosses": [{"pos": "phr.", "meaning": "归属感"}],
    "flags": ["speaking_part1"] },
  ...
]

Run:  python3 tools/parse_speaking_collocations.py
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "资料" / "口语 Part1 5-8月collocations.docx"
SEED = ROOT / "seed" / "speaking_collocations.json"

NS_RE = re.compile(r"<w:t[^>]*>([^<]*)</w:t>")
BR_RE = re.compile(r"<w:br\s*/>")


def extract_text_lines(docx_path: Path) -> list[str]:
    """Return all text paragraphs as a list of strings."""
    with zipfile.ZipFile(docx_path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    xml = BR_RE.sub("\n", xml)
    # Each <w:p> = one paragraph; we treat runs separated by <w:br/> as separate lines.
    paras: list[str] = []
    for pm in re.finditer(r"<w:p\b[^>]*>(.*?)</w:p>", xml, re.DOTALL):
        body = pm.group(1)
        runs = NS_RE.findall(body)
        # If <w:br/> was inside, the regex above split it into multiple runs/lines.
        # Each <w:t> with surrounding <w:br/> gets its own line. We rebuild by
        # joining the runs in order, but split on <w:br/> tokens manually:
        # Simpler: re-tokenize body to interleave text and br tags.
        line_parts: list[str] = []
        full = re.sub(r"<w:br\s*/>", "\x00BR\x00", body)
        for token in re.split(r"\x00BR\x00", full):
            t_runs = NS_RE.findall(token)
            line_parts.append("".join(t_runs))
        line = "\n".join(p for p in line_parts if p != "").strip()
        if line:
            paras.append(line)
    return paras


TOPIC_HEADER = re.compile(r"^(\d+)\.\s+(.+)$")
COLLOCATION_MARK = re.compile(r"^([①②③④])\s+(.+)$")
ENGLISH_LINE = re.compile(r"^[A-Za-z]")
CHINESE_LINE = re.compile(r"^[\u4e00-\u9fff]")


def main() -> int:
    if not SOURCE.exists():
        print(f"missing source: {SOURCE}", file=sys.stderr)
        return 1

    lines = extract_text_lines(SOURCE)
    print(f"raw lines: {len(lines)}")

    entries: list[dict] = []
    seen: set[str] = set()
    current_topic = ""
    current_collocation_lines: list[str] = []
    current_marker = ""

    def flush():
        nonlocal current_collocation_lines, current_marker
        if not current_marker or not current_collocation_lines:
            current_collocation_lines = []
            current_marker = ""
            return
        phrase = current_collocation_lines[0]
        meaning = ""
        example = ""
        if len(current_collocation_lines) >= 2:
            meaning = current_collocation_lines[1]
        if len(current_collocation_lines) >= 3:
            example = current_collocation_lines[2]
        if not phrase or not meaning:
            current_collocation_lines = []
            current_marker = ""
            return
        key = phrase.lower()
        flags = ["multi_word_spelling"]
        if key in seen:
            flags.append("duplicate_word")
        seen.add(key)
        entries.append({
            "spelling": phrase,
            "pos": "phr.",
            "glosses": [{"pos": "phr.", "meaning": re.sub(r"\s+", "", meaning)}],
            "flags": flags,
        })
        current_collocation_lines = []
        current_marker = ""

    for ln in lines:
        s = ln.strip()
        if not s or s == "⸻":
            flush()
            continue
        m = COLLOCATION_MARK.match(s)
        if m:
            flush()
            current_marker = m.group(1)
            current_collocation_lines = [m.group(2).strip()]
            continue
        m = TOPIC_HEADER.match(s)
        if m:
            flush()
            current_topic = m.group(2).strip()
            continue
        if s.startswith("适用："):
            flush()
            continue
        if s.startswith("*") or s.startswith("①"):
            # question lines, ignore
            continue
        if current_marker and len(current_collocation_lines) < 3:
            current_collocation_lines.append(s)

    flush()  # EOF

    SEED.parent.mkdir(parents=True, exist_ok=True)
    SEED.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"wrote {SEED}: {len(entries)} collocations")
    for e in entries[:3]:
        print(" ", json.dumps(e, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
