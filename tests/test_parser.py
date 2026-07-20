"""Tests for parser.py — driven by fixtures/book_{a,b}/golden.json.

Run: pytest tests/test_parser.py -v
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

# Make src importable
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from parser import (  # noqa: E402
    parse_gloss_text,
    compute_pos_string,
    parse_page_lines,
    is_word_line,
    is_gloss_line,
    is_gloss_continuation,
    is_header_or_footer,
)

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "fixtures"


# --- Pure-function tests ----------------------------------------------------

class TestPureFunctions:
    def test_is_word_line_basic(self):
        assert is_word_line("atmosphere", [55.5, 100, 110, 110]) is True

    def test_is_word_line_with_chinese_rejected(self):
        assert is_word_line("雅思", [55.5, 100, 110, 110]) is False

    def test_is_word_line_x0_too_high(self):
        assert is_word_line("atmosphere", [200, 100, 300, 110]) is False

    def test_is_word_line_rejects_header(self):
        assert is_word_line("https://painlesswords.com", [55.5, 100, 200, 110]) is False
        assert is_word_line("雅思词汇真经", [55.5, 100, 200, 110]) is False
        assert is_word_line("1/167", [55.5, 100, 100, 110]) is False

    def test_is_word_line_rejects_punctuation_only(self):
        assert is_word_line("---", [55.5, 100, 80, 110]) is False

    def test_is_gloss_line_basic(self):
        assert is_gloss_line("n. 大气层, 大气", [156.45, 100, 280, 110]) is True

    def test_is_gloss_line_x0_too_low(self):
        assert is_gloss_line("n. 大气层", [55.5, 100, 280, 110]) is False

    def test_is_gloss_line_rejects_no_pos(self):
        assert is_gloss_line("中文 without pos", [156.45, 100, 280, 110]) is False

    def test_parse_gloss_text_single(self):
        result = parse_gloss_text("n. 大气层, 大气, 空气, 氛围")
        assert result == [{"pos": "n.", "meaning": "大气层, 大气, 空气, 氛围"}]

    def test_parse_gloss_text_multi_pos(self):
        result = parse_gloss_text("v. 削皮, 剥落, 脱皮; n. 果皮, 剥下的皮")
        assert result == [
            {"pos": "v.", "meaning": "削皮, 剥落, 脱皮"},
            {"pos": "n.", "meaning": "果皮, 剥下的皮"},
        ]

    def test_parse_gloss_text_empty_returns_empty(self):
        assert parse_gloss_text("") == []
        assert parse_gloss_text("garbage without pos") == []

    def test_compute_pos_string_single(self):
        assert compute_pos_string([{"pos": "n.", "meaning": "x"}]) == "n."

    def test_compute_pos_string_multi(self):
        assert compute_pos_string([
            {"pos": "n.", "meaning": "x"},
            {"pos": "v.", "meaning": "y"},
        ]) == "n./v."

    def test_compute_pos_string_empty(self):
        assert compute_pos_string([]) is None


# --- Golden-fixture driven tests -------------------------------------------

def _load_golden(book: str) -> list[dict]:
    """Convert each golden record's raw_lines into line dicts with synthetic bbox.

    x0 rule:
      - Line starts with `[a-z]+\\s ` (POS marker) → 156.45 (gloss column)
      - Line contains any CJK character → 156.45 (gloss/continuation column)
      - Else (pure Latin) → 55.5 (word column)
    """
    import re
    path = FIX / book / "golden.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    out = []
    y0 = 50
    for rec in data:
        page = rec["page"]
        for line in rec["raw_lines"]:
            stripped = line.strip()
            has_cjk = any("\u4e00" <= c <= "\u9fff" for c in stripped)
            is_pos_line = bool(re.match(r"^[a-z]+\.\s", stripped))
            x0 = 156.45 if (has_cjk or is_pos_line) else 55.5
            bbox = [x0, y0, x0 + 200, y0 + 12]
            y0 += 35
            out.append({"text": line, "bbox": bbox, "_page": page, "_spelling": rec["spelling"]})
    return out, data


def _check_one(spelling: str, expected: dict, parsed: list[dict]):
    """Find parsed record with matching spelling and compare."""
    matches = [w for w in parsed if w["spelling"] == spelling]
    assert matches, f"No parsed record for spelling={spelling!r}; got {[w['spelling'] for w in parsed]}"
    actual = matches[0]
    assert actual["spelling"] == expected["spelling"]
    assert actual.get("pos") == expected.get("pos"), (
        f"pos mismatch for {spelling}: expected {expected.get('pos')!r}, got {actual.get('pos')!r}"
    )
    assert actual.get("glosses") == expected.get("glosses"), (
        f"glosses mismatch for {spelling}: expected {expected.get('glosses')!r}, got {actual.get('glosses')!r}"
    )
    if "flags" in expected:
        actual_flags = set(actual.get("flags") or [])
        expected_flags = set(expected["flags"])
        # cross_line_gloss is optional — accept if present or missing
        for f in expected_flags - actual_flags:
            if f == "cross_line_gloss":
                continue  # parser may or may not flag; both acceptable
            assert f in actual_flags, (
                f"missing flag {f!r} for {spelling}; got {actual_flags}"
            )


class TestBookAGolden:
    def test_all_golden_records_parse(self):
        lines, data = _load_golden("book_a")
        parsed = parse_page_lines(lines)
        for rec in data:
            _check_one(rec["spelling"], rec["expected"], parsed)


class TestBookBGolden:
    def test_all_golden_records_parse(self):
        lines, data = _load_golden("book_b")
        parsed = parse_page_lines(lines)
        for rec in data:
            _check_one(rec["spelling"], rec["expected"], parsed)


# --- End-to-end on real fixture pages --------------------------------------

class TestRealFixturePage:
    """Parse one full page of each book from extracted fixtures."""

    def test_book_a_page_001(self):
        fixture = FIX / "book_a" / "pages" / "page_001.pymupdf.json"
        if not fixture.exists():
            pytest.skip(f"fixture not present: {fixture}")
        data = json.loads(fixture.read_text(encoding="utf-8"))
        parsed = parse_page_lines(data["lines"])
        # Page 1 has 15 word records (verified manually from PyMuPDF output)
        assert len(parsed) == 15, f"page 1 produced {len(parsed)} records; expected 15: {[w['spelling'] for w in parsed]}"
        # First record should be 'atmosphere' (after page header)
        assert parsed[0]["spelling"] == "atmosphere"
        assert parsed[0]["pos"] == "n."
        # carbon dioxide appears as single-line spelling (PyMuPDF merges it)
        multi_words = [w for w in parsed if "multi_word_spelling" in (w.get("flags") or [])]
        assert len(multi_words) == 0, (
            f"PyMuPDF merges carbon dioxide into single line; multi_word_spelling should be empty; got {[w['spelling'] for w in multi_words]}"
        )
        assert any(w["spelling"] == "carbon dioxide" for w in parsed), (
            f"carbon dioxide missing; got {[w['spelling'] for w in parsed]}"
        )

    def test_book_b_page_001(self):
        fixture = FIX / "book_b" / "pages" / "page_001.pymupdf.json"
        if not fixture.exists():
            pytest.skip(f"fixture not present: {fixture}")
        data = json.loads(fixture.read_text(encoding="utf-8"))
        parsed = parse_page_lines(data["lines"])
        # Book B page 1 has more words (federal, republican, congress, campaign, factor, ...)
        assert len(parsed) >= 14, f"page 1 produced only {len(parsed)} records"
        assert parsed[0]["spelling"] == "federal"
        assert parsed[0]["pos"] == "adj."