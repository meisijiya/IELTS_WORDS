# PDF Layout Grammar — Yasi Words (雅思词汇真经 / IELTS)

> Catalog of observed layout patterns from 16 sample pages (8 per book) extracted
> via PyMuPDF and pdfplumber cross-validation. This is the contract the parser
> must satisfy.

## Coordinate system

- **Units**: PDF points (1/72 inch)
- **Page size**: standard letter/A4 (no exotic sizes observed)
- **Y axis**: top-down (y0 = top of line bbox)

## Layout constants (observed)

| Constant | Book A value | Book B value | Notes |
|---|---|---|---|
| Word x0 | ≈ 55.5 | ≈ 55.5 | Left margin |
| Gloss x0 | ≈ 156.45 | ≈ 173.375 | Right of word column |
| Line spacing | ≈ 34.5 pts | ≈ 34.5 pts | Between rows |
| Word column width | ≈ 100 pts | ≈ 100 pts | Word x1 < 200 |
| Gloss column width | ≈ 380 pts | ≈ 380 pts | Gloss can extend to x1 ≈ 530 |

> **Parser rule**: `x0 < 100` ⇒ word line; `x0 >= 130` ⇒ gloss line. The 30-pt
> dead zone in the middle is unused. This rule holds for both books.

## Page anatomy

Each page consists of:

```
[PAGE HEADER — skip]
  - "雅思词汇真经 / IELTS" (book title)
  - "雅思 共计 N,NNN 词" (count subtitle)
  - On page 1+ only: date stamp + URL "https://painlesswords.com/cn/wordlist/..."

[CONTENT — parse]
  - Repeating: (word line) → (gloss line, may span multiple lines)

[PAGE FOOTER — skip]
  - "https://painlesswords.com/..."
  - "N/167" or "N/323" page number
```

## Word lines

A **word line** must satisfy ALL of:

1. `bbox[0] < 100` (left column)
2. Stripped text matches `^[A-Za-z][A-Za-z '`,.!?-]*$` (Latin letters + space/hyphen/apostrophe/punctuation allowed)
3. Stripped text is **non-empty** after trim
4. Does NOT match page-header patterns (URL, "雅思", "共计", date stamp)
5. Does NOT start with a digit (excludes "1/167" footer)

**Multi-word spelling** (e.g. `carbon dioxide`, `polar bear`):
- Two consecutive word lines, where line 1 lacks a gloss between them
- Joined with single space: `"carbon" + " " + "dioxide" = "carbon dioxide"`
- Must be followed by exactly one gloss line (the combined word's definition)

**Examples observed:**
- `carbon dioxide` → `n. 二氧化碳`
- `prime minister` (Book A page 165 area) → multi-word
- (Verify in Wave 2 tests)

## Gloss lines

A **gloss line** must satisfy ALL of:

1. `bbox[0] >= 130` (right column)
2. Stripped text matches `^[a-z]+\.\s` (POS followed by `.` and space)
3. May span multiple lines (continuation lines look identical to first gloss line in x/y)

**Gloss continuation** (multi-line gloss):
- A line with `bbox[0] >= 130` that does NOT start with a new POS marker
- Must appear within ~50 pts of the previous gloss line's `bbox[3]` (bottom)
- Concatenated with no separator (raw text from PDF has no separator)

**POS marker patterns observed:**

- `n. ...` — noun
- `v. ...` — verb
- `adj. ...` — adjective
- `adv. ...` — adverb
- `num. ...` — numeral
- `prep. ...` — preposition
- `pron. ...` — pronoun
- `conj. ...` — conjunction
- `int. ...` — interjection

## Gloss parsing (within a single concatenated gloss)

When multiple POSes share one logical word entry:

```
n. 释义1, 释义2; v. 释义3, 释义4
```

Rules:

1. Split on `;` (semicolon-space pattern) → list of POS groups
2. For each group:
   - Regex `^([a-z]+\.)\s*(.+)$` extracts `pos` and `meaning`
   - `meaning` is kept as a single comma-separated string (NOT split into multiple glosses)
3. Multiple glosses within one POS group (e.g. `n. 释义1, 释义2`) are stored as one gloss
   with `meaning = "释义1, 释义2"`

> **Why keep comma-separated instead of splitting**: the original PDF treats them
> as a single comma-separated list under one POS; splitting into separate gloss
> entries would inflate the glosses array and misrepresent the source structure.

## Cross-page word handling

A word's spelling line may appear at the bottom of one page and the gloss on
the next page. **Observed example**: Book A page 166/167 boundary — `core` word
spans pages (gloss starts on p166, continues to p167).

**Parser strategy (Wave 3+)**: process pages sequentially, when a page ends
with a word line and no gloss line, carry the word forward to the next page.

## Header / footer patterns to skip

| Pattern | Reason |
|---|---|
| `https://painlesswords.com/...` | Footer URL |
| `雅思词汇真经` | Page header (Book A only) |
| `雅思考试词汇，词表已排除基础词。` | Subtitle (Book B only) |
| `雅思` followed by `共计 N,NNN 词` | Count subtitle |
| `\d+/\d+` matching `<digit>/<3digit>` | Page number footer |
| `2026/7/19 17:48 ...` | PDF metadata timestamp (appears in raw_text only, not in bbox lines) |

## Schema (final, simplified after observation)

```ts
{
  spelling: string,           // e.g. "atmosphere", "carbon dioxide"
  pos?: string | null,        // e.g. "n.", "n./v." — raw POS string from PDF
  glosses: Array<{             // one entry per POS group
    pos: string,               // e.g. "n."
    meaning: string            // comma-joined Chinese meanings
  }>,
  flags?: string[]             // parser confidence markers
}
```

> **Schema simplification rationale**: original Phase 0 plan included
> `phonetic` (IPA) and `examples` (en/zh pairs). After observing real PDFs
> (2026-07-20 smoke test), neither field exists. Schema simplified to the
> three core fields above. This reduced parser surface by ~50%.

## Confidence flags

| Flag | When emitted |
|---|---|
| `page_boundary_gloss` | Word's gloss started on previous page and continues |
| `multi_word_spelling` | Word entry is two or more Latin words joined |
| `unmatched_pos` | Gloss line has no recognizable POS pattern |
| `duplicate_word` | Same spelling appears more than once on one page |

## Edge cases observed in fixtures

| Edge case | Book / Page | Handling |
|---|---|---|
| `carbon dioxide` (2-line word) | Book A p1 | Detect as multi-word, join with space |
| `core` cross-page word | Book A p166/p167 boundary | Carry-forward: page N ends with word, page N+1 starts with its gloss |
| `n. 条, 狭长地带, ...剥离,\n清空, 拆卸, 剥夺` (cross-line gloss) | Book A p83 | Concatenate continuation lines into single gloss string |
| `billion` last word on page | Book A p165 | Verify if gloss is on same page or next |

## Cross-engine consistency

Both PyMuPDF and pdfplumber extract essentially the same text, but with
different line segmentation. PyMuPDF gives precise bbox per line; pdfplumber
often merges adjacent lines into a single text blob. **Parser relies on
PyMuPDF only** — pdfplumber is reserved for cross-validation (disagreement
flagging) in Wave 4.