# prisma/ — Data model boundary

Single source of truth for schema, seed, and provider switching. Two source files plus a gitignored local SQLite database.

## Files

- `/home/ljh2923/opencode-project/English_YASI/prisma/schema.prisma` — six models, one datasource.
- `/home/ljh2923/opencode-project/English_YASI/prisma/seed.ts` — idempotent wordbook import.
- `/home/ljh2923/opencode-project/English_YASI/prisma/dev.db` — local SQLite file, **gitignored**.

## Models (`schema.prisma`)

| Model | Role |
|---|---|
| `Wordbook` | `slug` (`concise` / `full` / `cet6`), name, description |
| `Word` | spelling, POS, `glosses` / `flags` as JSON strings, SM-2 state (`level`, `easeFactor`, `interval`, `dueAt`, `attempts`, `correct`, `masteredAt`) |
| `Session` | UUID id, `mode` (`drill` \| `review`), `wordIds` list, totals |
| `Attempt` | per-answer row (typed, correct, retries, `errorType`: `spelling` \| `skip` \| null) |
| `Checkin` | daily snapshot, preserved across reset |
| `UserSettings` | flashMs, fadeMs, pronunciationMode, pullPriority, accent |

All enums are `String` since SQLite has no native enum. `Word.glosses`, `Word.flags`, `Session.wordIds`, `Checkin.topMissedJson`, and `Checkin.wordbookBreakdownJson` are stored as JSON **strings**, not `Json` columns. This keeps the Prisma client identical between the two providers: SQLite reads/writes text, PostgreSQL reads/writes the same text and the app parses on read.

## Provider dual-mode

`schema.prisma` ships with `provider = "sqlite"`. `/home/ljh2923/opencode-project/English_YASI/docker/entrypoint.sh` swaps it to `postgresql` at container start when `DATABASE_URL` starts with `postgres`. The script copies the file to `schema.sqlite.prisma.bak`, runs `sed`, regenerates the Prisma client, applies schema, seeds, then moves the backup back before exit.

**Swap risk**: any crash between the `sed` and the final `mv` (lines 12 and 56) leaves `schema.prisma` in postgresql state on the host mount. A half-applied run is suspect; `git checkout prisma/schema.prisma` recovers.

## No migrations directory

The repo intentionally has no `prisma/migrations/`. Schema changes go through `npx prisma db push` (idempotent against the current DB). Each provider would need its own migration history anyway, and the project skips that bookkeeping by relying on `db push` plus the seed.

## Seed (`seed.ts`)

`WORDBOOKS` array maps three slugs to JSON files in `/seed/`:

| slug | name | count |
|---|---|---|
| `concise` | 雅思词汇真经（精简版） | 3611 |
| `full` | IELTS（完整版） | 7076 |
| `cet6` | 大学英语六级词汇 | 5518 |

Both `Wordbook` (by `slug`) and `Word` (by compound `wordbookId_spelling` unique) use `prisma.upsert`, so re-running the seed is safe. Words are inserted in batches of 500 inside `$transaction`.

## Deprecated fields

`UserSettings.enablePronunciation` is superseded by `pronunciationMode` (`both` / `flash` / `feedback` / `off`). Kept for back-compat reads only; do not write to it.

## dev.db boundary

`/home/ljh2923/opencode-project/English_YASI/prisma/dev.db` and `prisma/dev.db-journal` are gitignored (root `.gitignore` lines 39-40). Schema is the contract; seed is the reset path. Never commit the local DB file.

`npm run db:push` / `npm run db:seed` 命令清单见根 `AGENTS.md`。