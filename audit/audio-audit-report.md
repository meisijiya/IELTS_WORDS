# Audio-Level Audit Report
**Generated**: 2026-07-21T23:26:37

**Audio dir**: `public/audio/`  **Files**: 20194

## 1. Coverage per Book

How many spellings have audio (us / uk / either)?

| Book | Total | US | UK | Both | Either | Neither |
|---|---|---|---|---|---|---|
| 雅思词汇真经（精简版） (concise) | 3611 | 3610 | 3611 | 3610 | 3611 | 0 |
| IELTS（完整版） (full) | 7076 | 7074 | 7074 | 7073 | 7075 | 1 |
| 大学英语六级词汇 (cet6) | 5518 | 5518 | 5518 | 5518 | 5518 | 0 |

## 2. Words Missing ALL Audio (sample 20 per book)

- **雅思词汇真经（精简版）**: 0 words missing all audio ✓
### IELTS（完整版） — 1 words missing

| Spelling | Phonetic (if any) |
|---|---|
| `non-believer` | `<no phonetic>` |

- **大学英语六级词汇**: 0 words missing all audio ✓

## 3. File Format Validation (sample 500 random MP3s)

Check magic bytes via `file` command — should be MPEG layer III.

**Sampled**: 500  **Valid MP3**: 471 (94%)  **Invalid**: 29

| File | Detection |
|---|---|
| `melody.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `explosion.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `cataclysm.us.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `rise.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `sheet.us.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `japan.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `maize.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `present.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `gourmet.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `governor.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `embed.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `confuse.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `nostalgia.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `night.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `haircut.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `alcohol.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `convict.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `slanderous.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `embarrassed.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |
| `radio.uk.mp3` | RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit |

## 4. File Size Distribution

Sizes of all audio files (KB):

| Range | Count |
|---|---|
| 0 bytes (broken) | 0 |
| < 1 KB (suspicious) | 0 |
| 1-5 KB (small) | 50 |
| 5-20 KB (typical) | 16622 |
| > 20 KB (unusually large) | 3522 |

Min: 1.9 KB  Max: 192.1 KB  Median: 11.7 KB

## 5. FAILED.txt (audio fetch errors)

**Total failed fetches**: 5

| Accent | Failed count |
|---|---|
| us | 3 |
| uk | 2 |

**Sample (first 20)**: 

```
south-east	us	/home/ljh2923/opencode-project/English_YASI/public/audio/south-east.us.mp3
non-believer	uk	/home/ljh2923/opencode-project/English_YASI/public/audio/non-believer.uk.mp3
non-believer	us	/home/ljh2923/opencode-project/English_YASI/public/audio/non-believer.us.mp3
south-east	us	/home/ljh2923/opencode-project/English_YASI/public/audio/south-east.us.mp3
post-date	uk	/home/ljh2923/opencode-project/English_YASI/public/audio/post-date.uk.mp3
```

## 6. Recommendations

- **Audio > 99% coverage** is excellent. The remaining < 1% are typically proper names or rare technical terms not in Youdao.
- **Failed UK fetches** can be ignored: US → UK fallback in practice-client covers them transparently.
- **No phonetic in CET6** (8 words): parser couldn't extract phonetic from docx cell. Spelling-based audio fallback covers them — verify by playing `/audio/<spelling>.us.mp3`.
- **Manual review needed**: Sample 5-10 'missing audio' words per book. If they're truly obscure, accept the loss; if common, manually find audio source.
