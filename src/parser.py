"""Parser: PDF line sequences → Yasi word records.

Strategy (see docs/grammar.md):
- Use PyMuPDF line-level output (text + bbox per line).
- Word line: bbox x0 < 100 + Latin letters only.
- Gloss line: bbox x0 >= 130 + `<pos>. ` pattern.
- Multi-word spelling: consecutive word lines without intervening gloss.
- Cross-line gloss: gloss continuation lines within ~50pt of previous gloss bottom.
"""
from __future__ import annotations

import re
from typing import Any, Optional

# --- Constants --------------------------------------------------------------

WORD_X0_MAX = 100.0      # below this is word column
GLOSS_X0_MIN = 130.0     # at or above this is gloss column
CROSS_LINE_GAP_PT = 50.0 # max gap between gloss line bottoms

# --- Regexes ----------------------------------------------------------------

WORD_RE = re.compile(r"^[A-Za-z][A-Za-z '\-,.]*$")
POS_RE = re.compile(r"^([a-z]+\.)\s*(.+)$")
POS_SPLIT_RE = re.compile(r";\s*")

HEADER_PATTERNS = [
    re.compile(r"https?://"),
    re.compile(r"^雅思词汇真经$"),
    re.compile(r"^IELTS$"),
    re.compile(r"^雅思考试词汇.*$"),
    re.compile(r"^雅思$"),
    re.compile(r"^共计\s*[\d,]+\s*词$"),
    re.compile(r"^\d+/\d+$"),
    re.compile(r"^\d{4}/\d{1,2}/\d{1,2}"),  # date stamp
    re.compile(r"^painlesswords", re.IGNORECASE),
]


# --- Line classifiers -------------------------------------------------------

def is_header_or_footer(text: str) -> bool:
    for p in HEADER_PATTERNS:
        if p.search(text):
            return True
    return False


def has_chinese(text: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in text)


def is_word_line(text: str, bbox: list[float]) -> bool:
    if bbox[0] >= WORD_X0_MAX:
        return False
    if is_header_or_footer(text):
        return False
    if has_chinese(text):
        return False
    return bool(WORD_RE.match(text.strip()))


def is_gloss_line(text: str, bbox: list[float]) -> bool:
    if bbox[0] < GLOSS_X0_MIN:
        return False
    if is_header_or_footer(text):
        return False
    return bool(POS_RE.match(text.strip()))


def is_gloss_continuation(text: str, bbox: list[float], prev_bbox: list[float]) -> bool:
    if bbox[0] < GLOSS_X0_MIN:
        return False
    if POS_RE.match(text.strip()):  # starts a new POS group, not continuation
        return False
    # Must be near previous gloss (close vertical)
    if abs(bbox[1] - prev_bbox[3]) > CROSS_LINE_GAP_PT:
        return False
    return True


# --- Gloss parsing ----------------------------------------------------------

def parse_gloss_text(text: str) -> list[dict[str, str]]:
    """Split 'n. 释义; v. 释义' → [{pos, meaning}, ...]."""
    parts = POS_SPLIT_RE.split(text)
    glosses: list[dict[str, str]] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        m = POS_RE.match(part)
        if m:
            glosses.append({"pos": m.group(1), "meaning": m.group(2).strip()})
    return glosses


_PUNCT_END_RE = re.compile(r"[,.;:!?。，；：！？]$")


def join_gloss_parts(parts: list[str]) -> str:
    """Concatenate gloss parts; insert space when previous part ends with punctuation."""
    if not parts:
        return ""
    out = parts[0]
    for p in parts[1:]:
        if _PUNCT_END_RE.search(out):
            out += " " + p
        else:
            out += p
    return out


def compute_pos_string(glosses: list[dict[str, str]]) -> Optional[str]:
    if not glosses:
        return None
    return "/".join(g["pos"] for g in glosses)


# --- Main entry point -------------------------------------------------------

def parse_page_lines(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Parse PyMuPDF line dicts into word records.

    Input lines shape: [{text: str, bbox: [x0, y0, x1, y1]}, ...]
    Output records: [{spelling, pos?, glosses: [{pos, meaning}], flags?}, ...]
    """
    # Filter header/footer
    content = []
    for line in lines:
        text = (line.get("text") or "").strip()
        bbox = line.get("bbox") or [0, 0, 0, 0]
        if not text:
            continue
        if is_header_or_footer(text):
            continue
        content.append({"text": text, "bbox": bbox})

    words: list[dict[str, Any]] = []
    i = 0
    while i < len(content):
        line = content[i]
        text = line["text"]
        bbox = line["bbox"]

        if not is_word_line(text, bbox):
            i += 1
            continue

        # === Start a new word ===
        spelling = text
        flags: list[str] = []

        # Multi-word spelling: peek consecutive word lines without gloss between
        j = i + 1
        while j < len(content):
            nl = content[j]
            if is_gloss_line(nl["text"], nl["bbox"]):
                break
            if is_word_line(nl["text"], nl["bbox"]):
                spelling += " " + nl["text"]
                if "multi_word_spelling" not in flags:
                    flags.append("multi_word_spelling")
                j += 1
                continue
            break

        # === Collect gloss lines (initial + continuations) ===
        gloss_parts: list[str] = []
        prev_bbox: Optional[list[float]] = None
        k = j
        while k < len(content):
            kl = content[k]
            kt = kl["text"]
            kb = kl["bbox"]

            if is_word_line(kt, kb):
                break

            if is_gloss_line(kt, kb):
                gloss_parts.append(kt)
                prev_bbox = kb
                k += 1
                continue

            if prev_bbox is not None and is_gloss_continuation(kt, kb, prev_bbox):
                gloss_parts.append(kt)
                prev_bbox = kb
                k += 1
                if "cross_line_gloss" not in flags:
                    flags.append("cross_line_gloss")
                continue

            break

        if gloss_parts:
            combined = join_gloss_parts(gloss_parts)
            glosses = parse_gloss_text(combined)
            if glosses:
                record: dict[str, Any] = {
                    "spelling": spelling,
                    "pos": compute_pos_string(glosses),
                    "glosses": glosses,
                }
                if flags:
                    record["flags"] = flags
                words.append(record)
            else:
                # Gloss line but couldn't parse POS — still record spelling, flag it
                record = {
                    "spelling": spelling,
                    "pos": None,
                    "glosses": [],
                    "flags": flags + ["unmatched_pos"],
                }
                words.append(record)

        i = k

    return words


# --- Convenience: load from PyMuPDF page dict -----------------------------

def parse_page_dict(page_dict: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse a PyMuPDF page.get_text('dict') result into word records."""
    lines = []
    for block in page_dict.get("blocks", []):
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", []))
            bbox = line.get("bbox", [0, 0, 0, 0])
            if text.strip():
                lines.append({"text": text, "bbox": list(bbox)})
    return parse_page_lines(lines)


def lines_from_fixture(json_path) -> list[dict[str, Any]]:
    """Load PyMuPDF fixture JSON (from extract_sample.py) into line list."""
    import json
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("lines", [])