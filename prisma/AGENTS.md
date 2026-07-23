# prisma/ — Data model boundary

Single source of truth for schema, seed, and provider switching. Two source files plus a gitignored local SQLite database.

## Files

- `/home/ljh2923/opencode-project/English_YASI/prisma/schema.prisma` — six models, one datasource.
- `/home/ljh2923/opencode-project/English_YASI/prisma/seed.ts` — idempotent wordbook import.
- `/home/ljh2923/opencode-project/English_YASI/prisma/dev.db` — local SQLite file, **gitignored**.

## Models (`schema.prisma`)

| Model | Role |
|---|---|
| `User` | username + passwordHash + role (`user` \| `admin`). Bootstrap admin in `seed.ts`. |
| `Invitation` | one-time registration code (`code` `@unique`), 7-day expiry, `usedById` set on consumption |
| `Wordbook` | `slug` (`concise` / `full` / `cet6`), name, description |
| `Word` | spelling, POS, `glosses` / `flags` as JSON strings, SM-2 state (`level`, `easeFactor`, `interval`, `dueAt`, `attempts`, `correct`, `masteredAt`) |
| `UserWord` | per-user word state, `@unique([userId, wordId])`. Includes `firstAttemptedAt` (backfilled from earliest Attempt on schema bump) for "new word" analytics |
| `Session` | UUID id, `userId`, `mode` (`drill` \| `review`), `wordIds` list, totals |
| `Attempt` | per-answer row (typed, correct, retries, `errorType`: `spelling` \| `skip` \| null); `userId` + `userWord` removed — derived through `userId` + `wordId` index |
| `Checkin` | daily snapshot, preserved across reset |
| `UserSettings` | `userId` `@unique`, flashMs, fadeMs, pronunciationMode, pullPriority, accent, checkinRetentionDays, masteryThreshold, flashSkipMinLevel, soundEnabled |

All per-user data carries `userId`. `Session` / `Attempt` / `UserWord` / `Checkin` / `UserSettings` are queried via `where: { userId }` to enforce isolation.

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

Also bootstraps the admin user (`role="admin"`, username = `LiangJieHao`, password from `ADMIN_PASSWORD` env var via `lib/password`). Run once on first deploy; idempotent on re-run (upsert by username).

## Migration helpers (`prisma/pre-migrate.ts`, `prisma/migrate-data.ts`)

One-shot scripts for the multi-user migration:

- `pre-migrate.ts` — runs BEFORE schema bump: snapshots the old `ADMIN_PASSWORD` env value, dumps a `migrate-backup.json` with every `Word` row's current `attempts` / `correct` / `masteredAt` for the single pre-existing user.
- `migrate-data.ts` — runs AFTER `db push`: creates the admin user (using the snapshot password), creates one default user for all legacy `Attempt` / `Session` / `Checkin` / `UserSettings` rows, hydrates `UserWord` rows from `migrate-backup.json`, backfills `firstAttemptedAt` from the earliest `Attempt.createdAt` per `(userId, wordId)`.

These scripts are committed for reproducibility — re-run only on a fresh dev DB.

## Deprecated fields

`UserSettings.enablePronunciation` is superseded by `pronunciationMode` (`both` / `flash` / `feedback` / `off`). Kept for back-compat reads only; do not write to it.

## checkinRetentionDays

`UserSettings.checkinRetentionDays Int?` (null = 无限). Pairs with `/api/admin/checkin/cleanup` (POST `{days, confirm: "CLEAN N DAYS"}`). Cap of 3650 days in the API layer (`normalizeRetention` in `/home/ljh2923/opencode-project/English_YASI/src/app/api/settings/route.ts`).

The reset invariant ("打卡跨重置保留") still holds: `/api/admin/reset` eagerly snapshots today before wiping attempts; retention only caps how far back snapshots may accumulate. Cleanup is a user-triggered, idempotent `deleteMany` gated by an exact-match confirm phrase — typos fail with `400 CONFIRM_REQUIRED`.

## masteryThreshold + flashSkipMinLevel

Two new `UserSettings` knobs for the SM-2 ladder. `masteryThreshold` (default 5, range 2-20) replaces the hardcoded `MAX_LEVEL = 5`; `flashSkipMinLevel` (default null, range 1-100) is an opt-in "skip the visual flash for high-rung words" toggle (audio still plays).

**Invariant — `Word.masteredAt != null ↔ isMastered`**:

`masteredAt` is the canonical "is this word mastered" signal. SM-2 sets it when `level` reaches `masteryThreshold`; PUT to `/api/settings` that **lowers** the threshold runs an eager promotion (`UPDATE word SET masteredAt = now() WHERE level >= new AND masteredAt IS NULL`) in the same `$transaction` as the settings write. Re-PUTing the same value is idempotent (the `masteredAt IS NULL` filter excludes already-promoted rows). Raising the threshold is a no-op (mastery is sticky). The flash-skip setting has no eager semantics — it only affects practice UI, not Word state.

## dev.db boundary

`/home/ljh2923/opencode-project/English_YASI/prisma/dev.db` and `prisma/dev.db-journal` are gitignored (root `.gitignore` lines 39-40). Schema is the contract; seed is the reset path. Never commit the local DB file.

`npm run db:push` / `npm run db:seed` 命令清单见根 `AGENTS.md`。