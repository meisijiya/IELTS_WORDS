# `src/lib/` · Shared library domain

Pure utilities and Edge-safe primitives consumed by `src/app/` (pages, route handlers, middleware). No business rules live here. Pure functions stay free of `prisma` so they run in unit tests without mocks.

## Files

- `/home/ljh2923/opencode-project/English_YASI/src/lib/auth.ts`: Edge-safe HMAC session cookie. `SESSION_COOKIE_NAME="yasi_session"`, `SESSION_TTL_MS=30d`. Exports `checkPassword`, `createSessionCookie`, `verifySessionCookie`, `isAuthenticated`. Built on Web Crypto so middleware keeps working on the Edge runtime. Session payload carries `userId` + `role` for per-user authorization.
- `/home/ljh2923/opencode-project/English_YASI/src/lib/password.ts`: Username + password primitives. `hashPassword` / `verifyPassword` (PBKDF2-SHA-256, 100k iters, fixed salt), `validateUsername` (3-32 chars, ASCII letters / digits / `_`), `validatePassword` (≥6 chars).
- `/home/ljh2923/opencode-project/English_YASI/src/lib/api.ts`: API-route auth helper. `requireUser()` (resolves `{ id, role }` from session cookie, throws `ApiAuthError` on failure), `requireAdmin()`, `authErrorResponse()`. Every route handler except `/api/auth/*` calls `requireUser()` first.
- `/home/ljh2923/opencode-project/English_YASI/src/lib/db.ts`: Prisma singleton. Dev HMR guard attaches the instance to `globalThis.prisma` outside production so hot reload does not open new connections. Log level drops to `["error"]` in production.
- `/home/ljh2923/opencode-project/English_YASI/src/lib/checkin-snapshot.ts`: Checkin snapshot writers. `computeCheckinData` (read-only), `snapshotCheckin` (lazy + idempotent on first visit per date), `snapshotAllDatesWithAttempts` (eager sweep before `/api/admin/reset` wipes attempts), `readCheckin` (snapshot read with weekday + isToday). Three-bucket classification: `newCount` = `UserWord.firstAttemptedAt IN [start, end)`; `masteredTodayCount` = `UserWord.masteredAt IN [start, end)` (per Checkin schema doc — counts promote events, not current state); `learningCount` = `masteredAt IS NULL` AND firstAttemptedAt < start. "Reviewed mastered words" are excluded from learning.
- `/home/ljh2923/opencode-project/English_YASI/src/lib/word-collections.ts`: Pure 3-way partition of words into `wrong` / `learning` / `mastered` buckets. `partitionWords(words, masteryThreshold = 5)` is parameterized by the user's mastery threshold (read by RSC pages from `UserSettings`). The mastered bucket accepts `masteredAt != null` OR `level >= masteryThreshold` so settings-driven eager promotions (PUT that lowers the threshold) show up immediately. Also exports `aggregateWordsByWord`, `sortByAttempts`, `sortByMasteredAt` for the three collection pages.
- `/home/ljh2923/opencode-project/English_YASI/src/lib/word-history.ts`: Pure 30-day per-word accuracy roll-up. `aggregateWordHistories` returns contiguous 30-point arrays (zero days preserved) keyed by wordId, oldest first.
- `/home/ljh2923/opencode-project/English_YASI/src/lib/leaderboard.ts`: Per-user scoreboard aggregation. `computeLeaderboard({ range, userId })` returns `{ totals: [...], todayByUser: Record<userId, DailyStat> }`. Buckets by `byRange.{today, week, month, all}` with mastered / learning / new / totalAttempted counts.
- `/home/ljh2923/opencode-project/English_YASI/src/lib/rate-limit.ts`: In-memory per-IP login throttling. 5 failures in a 60 s window flip the bucket to 429; `resetBucket` clears on a successful login. Single-process scope, sized for one Docker instance.

## Colocated unit tests

- `/home/ljh2923/opencode-project/English_YASI/src/lib/rate-limit.test.ts`: vitest. Exercises `checkRate` / `recordFail` / `resetBucket` across window boundaries.
- `/home/ljh2923/opencode-project/English_YASI/src/lib/word-collections.test.ts`: vitest. Covers `aggregateWordsByWord`, `partitionWords`, `sortByAttempts`, `sortByMasteredAt` against the partition rules.
- `/home/ljh2923/opencode-project/English_YASI/src/lib/word-history.test.ts`: vitest. Fixed-`now` cases for `aggregateWordHistories` (empty input, single attempt, attempts outside the 30-day window drop).
- `/home/ljh2923/opencode-project/English_YASI/src/lib/leaderboard.test.ts`: vitest. Covers `computeLeaderboard` with stubbed `prisma` for empty / partial / mastered-in-range cases.

DB-touching helpers (`db.ts`, `checkin-snapshot.ts`, `leaderboard.ts`) skip colocated tests on purpose; they are exercised through the route handlers in `src/app/api/`. Pure-function files keep their logic in this directory so test files can import them directly.

## Notes

- `rate-limit.ts` is single-process: the bucket map lives in module memory. A load-balanced multi-instance deployment needs Redis before throttling becomes reliable.
- `checkin-snapshot.ts` writes twice on purpose: lazy on first read (`snapshotCheckin`) plus an eager pre-reset sweep (`snapshotAllDatesWithAttempts`) so `/checkin` history survives `/api/admin/reset`.
- `word-collections.ts` and `word-history.ts` are pure (no `prisma` import). Their colocated tests run without a database.
- `auth.ts` reads `SESSION_SECRET` and `ADMIN_PASSWORD` from env; both must be set server-side. Web Crypto means the same module is safe under Next.js Edge runtime.