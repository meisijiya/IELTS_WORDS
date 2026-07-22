# tools/

Python ETL scripts for the PDF/DOCX wordbook pipeline plus the audio
chain. Read-only against the runtime app: consume tracked seed JSON,
emit gitignored intermediates.
## Naming

`book_a` and `book_b` are parser-internal names used inside `tools/`
and the `raw/` / `parsed/` / `diff/` trees. They map to user slugs only
at seed-export time: `book_a` → `seed/yasi_concise.json` (slug
`concise`), `book_b` → `seed/ielts_full.json` (slug `full`). Never
expose them in URLs, copy, or UI strings.
## Canonical pipeline (PDF books)

Run in order; each step depends on the prior.

1. `/home/ljh2923/opencode-project/English_YASI/tools/extract_full.py`
   PDF → `raw/{book_id}/pages.{jsonl,plumber.jsonl}` (PyMuPDF +
   pdfplumber, both engines, all pages).
2. `/home/ljh2923/opencode-project/English_YASI/tools/parse_full.py`
   `raw/` → `parsed/{book_id}/words.{engine}.jsonl`, validates PyMuPDF
   pass against `schema/yasi_word.schema.json`.
3. `/home/ljh2923/opencode-project/English_YASI/tools/cross_validate.py`
   `parsed/*/words.pymupdf.jsonl` vs pdfplumber raw_text →
   `diff/{book_id}/missing_in_plumber.jsonl` plus per-book stats.
4. `/home/ljh2923/opencode-project/English_YASI/tools/seed_export.py`
   Emits tracked seed: `seed/yasi_concise.json` and
   `seed/ielts_full.json` after schema validation.
## CET-6 fork (DOCX, separate path)

`/home/ljh2923/opencode-project/English_YASI/tools/parse_cet6.py` reads
`/home/ljh2923/opencode-project/English_YASI/大学英语六级词汇表(全)含音标.docx`
and writes `/home/ljh2923/opencode-project/English_YASI/seed/cet6.json`
directly. Bypasses the PDF pipeline (the DOCX table is already clean
rows). Runs standalone.
## Accuracy gate

`/home/ljh2923/opencode-project/English_YASI/tools/gate.py` samples
random records (default 30 from concise + 50 from full, or `--sample N`
for both) and verifies spelling + gloss appear in the source PDF via
PyMuPDF. Prints PASS/FAIL plus per-book rates. Use `--strict` for CI
non-zero exit on any miss.
## Audio chain

1. `/home/ljh2923/opencode-project/English_YASI/tools/fetch_pronunciations.py`
   Youdao → `public/audio/<norm>.<us|uk>.mp3`. 8-way concurrency by
   default, resume-friendly, writes `public/audio/FAILED.txt` on
   persistent failure.
2. `/home/ljh2923/opencode-project/English_YASI/tools/check_audio.py`
   DB vs filesystem cross-check. One `<spelling>\t<accent>` row per
   missing pair, summary on stderr.
3. `/home/ljh2923/opencode-project/English_YASI/tools/retry_missing_audio.py`
   Reads a missing-list (or rebuilds via `check_audio.py --wordbook
   <slug>`), throttled re-attempt through the fetcher. Defaults:
   `--concurrency 2`, `--delay 0.6`.
4. `/home/ljh2923/opencode-project/English_YASI/tools/release-audio.sh`
   Tarballs `public/audio/` into `release/audio.tgz` and prints the
   `gh release create` command. Default tag `audio-YYYYMMDD-HHMM`
   unless `AUDIO_BUNDLE_TAG` / `--tag` is set.
### Known dead code

`/home/ljh2923/opencode-project/English_YASI/tools/check_audio.py` lines 24-30 define `norm()` that is never called (its `.replace("[^a-z0-9]+", …)` passes a regex as a literal). `main()` uses `import_norm()` at lines 33-39 instead. Audit external callers before deleting the stub.
## I/O mapping

All paths under `/home/ljh2923/opencode-project/English_YASI/`.

| Producer | Writes | Tracked? |
|----------|--------|----------|
| `extract_full.py` | `raw/{book_a,book_b}/pages.{jsonl,plumber.jsonl}` + summary | no (`/raw/` gitignored) |
| `parse_full.py` | `parsed/{book_a,book_b}/words.{pymupdf,pdfplumber}.jsonl` + summary | no (`/parsed/` gitignored) |
| `cross_validate.py` | `diff/{book_a,book_b}/missing_in_plumber.jsonl` + stats | no (`/diff/` gitignored) |
| `seed_export.py` | `seed/yasi_concise.json`, `seed/ielts_full.json`, summary | yes |
| `parse_cet6.py` | `seed/cet6.json` | yes |
| `fetch_pronunciations.py` | `public/audio/*.mp3`, `public/audio/FAILED.txt` | no (`/public/audio/` gitignored) |
| `release-audio.sh` | `release/audio.tgz` | no (`/release/*.tgz` gitignored) |
## Network and destructive operations

`fetch_pronunciations.py` and `release-audio.sh` hit the public internet (Youdao, GitHub Releases). `spot-check` does the same against a third-party dictionary. Run them only when you actually want network traffic. `release-audio.sh` writes a tarball and pushes a GitHub Release: the audio files themselves are untouched, but the Release is hard to retract.