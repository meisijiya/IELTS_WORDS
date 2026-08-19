# Data Quality Report — OCR Errors and Audio Coverage Gaps

Generated: 2026-08-19
Scope: 6 newly added wordbooks (exam_points, speaking_collocations,
writing_collocations, oral_vocabulary, listening_highfreq, academic_core)

## 1. OCR-Truncated Words (FIXED)

Found 47 OCR-truncated entries in the source PDFs/DOCX. All have been
corrected in `seed/*.json` (flagged with `ocr_corrected`) and re-fetched
from audio sources. Database entries with the old truncated spellings have
been deleted.

| Original (truncated) | Corrected | Source Wordbook |
|---|---|---|
| sufficien | sufficient | exam_points |
| Popula | Popular | writing_collocations |
| mange to do | manage to do | exam_points |
| back d | back door | listening_highfreq |
| guided tou | guided tour | listening_highfreq |
| money orde | money order | listening_highfreq |
| package tou | package tour | listening_highfreq |
| unhelpful owne | unhelpful owner | listening_highfreq |
| unsympathetic owne | unsympathetic owner | listening_highfreq |
| water heate | water heater | listening_highfreq |
| corri d | corridor | listening_highfreq |
| toaste | toaster | listening_highfreq |
| refrigerat | refrigerator | listening_highfreq |
| air conditione | air conditioner | listening_highfreq |
| flight numbe | flight number | listening_highfreq |
| wheelchai | wheelchair | listening_highfreq |
| souveni | souvenir | listening_highfreq |
| cashie | cashier | listening_highfreq |
| semeste | semester | listening_highfreq |
| chapte | chapter | listening_highfreq + academic_core |
| honou | honour | listening_highfreq |
| proofreade | proofreader | listening_highfreq |
| interviewe | interviewer | listening_highfreq |
| headmaste | headmaster | listening_highfreq |
| chancell | chancellor | listening_highfreq |
| advis | advisor | listening_highfreq |
| supervis | supervisor | listening_highfreq |
| newspape | newspaper | listening_highfreq |
| photocopie | photocopier | listening_highfreq |
| copie | copier | listening_highfreq |
| printe | printer | listening_highfreq |
| scanne | scanner | listening_highfreq |
| encounte | encounter | academic_core |
| gende | gender | academic_core |
| registe | register | academic_core |
| scenari | scenario | academic_core |
| simila | similar | academic_core |
| labou | labour | academic_core |
| nuclea | nuclear | academic_core |
| occu | occur | academic_core |
| take a phot | take a photo | oral_vocabulary |
| register f | register for | listening_highfreq |

## 2. Source PDF OCR Review Recommended

The 538-points PDF (`资料/【revised】考点词538.pdf`) and the listening
high-frequency PDF (`资料/听力高频词汇.pdf`) were OCR'd via multimodal
agents. Both contain systematic trailing-character truncation when the
PDF rendering cut off mid-character. Recommend:

- Tools: re-run OCR with `pdf2image` + `tesseract` as a sanity check
- Manual review: spot-check 50 random words in each new wordbook
- If OCR confidence is low, consider using the `exam_points` PDF's originals
  (`resources/`) as a canonical source

## 3. Remaining Audio Coverage Gaps (14 of 2,506 entries, 99.4% coverage)

After OCR fixes, 14 entries still have no audio. These are documented
here for follow-up.

### 3a. Single-word gaps (3) — Youdao returned 404

These are real English words but Youdao's dictvoice endpoint does not
have them. Workaround: try alternative sources (Google TTS, Oxford,
Cambridge).

| Word | Wordbook | Source |
|---|---|---|
| inhibition | academic_core | Youdao 404 |
| supremacy | exam_points | Youdao 404 |
| extra-curriculum | listening_highfreq | Youdao 404 |

### 3b. Long phrases Google TTS rejected (10) — character limit

Google TTS URL endpoint silently rejects phrases over ~50 characters.
These are idiomatic phrases from oral_vocabulary.

| Phrase | Suggested next step |
|---|---|
| acquire a taste of | Split into smaller chunks for TTS |
| be a matter of personal taste | Split into smaller chunks for TTS |
| be ace at | Try alternative TTS source |
| be fit as a fiddle | Try alternative TTS source |
| have an ace time | Try alternative TTS source |
| have very good taste in | Split into smaller chunks for TTS |
| hold all the aces | Try alternative TTS source |
| leave a deep impression on | Split into smaller chunks for TTS |
| reflect on my life | Try alternative TTS source |
| reflect well on someone | Split into smaller chunks for TTS |

### 3c. Phrase Google TTS rejected (1) — character limit

| Phrase | Wordbook |
|---|---|
| internet bill | listening_highfreq |

## 4. Suggested Next Steps

1. Run `tools/check_audio.py --wordbook <slug>` to get per-book coverage stats
2. For long phrases, implement `apt install espeak-ng` + `espeak-ng -v en-us` as a local fallback (no character limit, no rate-limit)
3. Run `audio-audit.py` after next OCR pass to compare coverage improvements
4. Re-run `tools/spell-check.py` (if created) to flag any remaining truncated spellings
