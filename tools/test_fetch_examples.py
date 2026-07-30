import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch_examples import (
    example_matches_spelling,
    parse_examples_from_json,
    youdao_sign,
)


def test_youdao_sign_is_deterministic_and_nonempty():
    f1, t1 = youdao_sign("atmosphere")
    f2, t2 = youdao_sign("atmosphere")
    assert f1 == f2
    assert t1 == t2
    assert isinstance(f1, str) and len(f1) == 32
    assert isinstance(t1, int) and 0 <= t1 <= 9


def test_youdao_sign_differs_for_different_inputs():
    f1, _ = youdao_sign("atmosphere")
    f2, _ = youdao_sign("colonel")
    assert f1 != f2


def test_parse_examples_from_json_extracts_blng_sents_part():
    payload = {
        "blng_sents_part": {
            "sentence-count": 2,
            "sentence-pair": [
                {"sentence-eng": "I went to the bank.", "sentence-translation": "我去了银行。", "source": "youdao"},
                {"sentence-eng": "The river bank was steep.", "sentence-translation": "河岸很陡。"},
            ],
        }
    }
    examples = parse_examples_from_json(payload)
    assert len(examples) == 2
    assert examples[0]["en"] == "I went to the bank."
    assert examples[0]["zh"] == "我去了银行。"
    assert examples[0]["source"] == "youdao"
    assert "source" not in examples[1]


def test_parse_examples_from_json_falls_back_to_expand_ec():
    payload = {
        "expand_ec": {
            "word": [
                {
                    "transList": [
                        {"content": {"sents": [{"sentOrig": "Colonel is a rank.", "sentTrans": "上校是个军衔。"}]}}
                    ]
                }
            ]
        }
    }
    examples = parse_examples_from_json(payload)
    assert examples == [{"en": "Colonel is a rank.", "zh": "上校是个军衔。"}]


def test_parse_examples_from_json_caps_at_max_per_word():
    payload = {
        "blng_sents_part": {
            "sentence-pair": [
                {"sentence-eng": f"S{i}.", "sentence-translation": f"译{i}。"} for i in range(10)
            ]
        }
    }
    assert len(parse_examples_from_json(payload, max_per_word=3)) == 3


def test_parse_examples_from_json_drops_malformed_entries():
    payload = {
        "blng_sents_part": {
            "sentence-pair": [
                {"sentence-eng": "", "sentence-translation": "空 en"},
                {"sentence-eng": "valid", "sentence-translation": ""},
                {"sentence-eng": None, "sentence-translation": "x"},
                {"sentence-eng": "Good one.", "sentence-translation": "好句子。"},
            ]
        }
    }
    examples = parse_examples_from_json(payload)
    assert examples == [{"en": "Good one.", "zh": "好句子。"}]


def test_parse_examples_from_json_handles_missing_blng_sents_part():
    payload = {"ec": {"word": [{"trs": []}]}}
    assert parse_examples_from_json(payload) == []


def test_example_matches_spelling_case_insensitive_whole_word():
    assert example_matches_spelling("I went to the bank.", "bank") is True
    assert example_matches_spelling("I went to the BANK.", "bank") is True
    assert example_matches_spelling("banker is here.", "bank") is False
    assert example_matches_spelling("The river bank was steep.", "bank") is True
    assert example_matches_spelling("nothing here", "bank") is False
    assert example_matches_spelling("", "bank") is False
    assert example_matches_spelling("bank", "") is False
