// One-shot data migration: single-user → multi-user schema.
//
// Pre-conditions:
//   - The new schema (User / Invitation / UserWord / userId columns on
//     Session / Attempt / Checkin / UserSettings) has been pushed via
//     `npm run db:push` AND the legacy Word.level/attempts/etc columns
//     are still present (this script reads them).
//
// What it does:
//   1. Bootstrap one admin user from env (ADMIN_USERNAME / ADMIN_PASSWORD).
//      Re-running the script is safe: the existing admin is reused.
//   2. Copy Word.level/attempts/correct/masteredAt/easeFactor/interval/dueAt
//      into UserWord rows for that admin user. Words with attempts==0 are
//      skipped — the UserWord default zeroness is the correct starting state.
//   3. Backfill userId on Session / Attempt / Checkin to the admin user id.
//   4. Move the existing UserSettings singleton (id=1) onto the admin user:
//      re-key the row to userId+1 and create a UserSettings row if absent.
//
// After this script reports success, the next schema cleanup removes the
// legacy Word columns via `prisma db push --accept-data-loss`.

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function ensureAdmin(): Promise<{ id: number; username: string }> {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD env var required to bootstrap admin user");
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`[migrate] admin '${username}' already exists (id=${existing.id})`);
    return existing;
  }

  const passwordHash = await hashPassword(password);
  const created = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: "admin",
    },
  });
  console.log(`[migrate] created admin '${username}' (id=${created.id})`);
  return created;
}

async function migrateWordsToUserWords(userId: number): Promise<number> {
  // Per the schema, the legacy Word columns remain until the next db push
  // drops them. We read them via $queryRaw so the prisma client type aware
  // of the new (Word has no fields) shape doesn't get in the way.
  // ponytail: $queryRaw over a typed select — the schema hasn't dropped the
  // columns yet so they are physically present; revisit if you remove the
  // legacy columns before running this script.
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: number;
    level: number;
    easeFactor: number;
    interval: number;
    dueAt: Date | null;
    attempts: number;
    correct: number;
    masteredAt: Date | null;
  }>>(
    `SELECT id, level, easeFactor, interval, dueAt, attempts, correct, masteredAt
     FROM Word WHERE attempts > 0 OR masteredAt IS NOT NULL`,
  );

  let written = 0;
  for (const r of rows) {
    await prisma.userWord.upsert({
      where: { userId_wordId: { userId, wordId: r.id } },
      update: {},
      create: {
        userId,
        wordId: r.id,
        level: r.level,
        easeFactor: r.easeFactor,
        interval: r.interval,
        dueAt: r.dueAt,
        attempts: r.attempts,
        correct: r.correct,
        masteredAt: r.masteredAt,
      },
    });
    written += 1;
  }
  console.log(`[migrate] copied ${written} userWord row(s)`);
  return written;
}

async function backfillUserId(userId: number): Promise<void> {
  // Tables already have userId columns populated as NOT NULL with default 0
  // from the additive schema push. We rewrite the 0 rows to point at admin.
  // Sessions / Attempts / Checkins created BEFORE the migration would have
  // userId=0; any new rows after the migration are already correct.
  const [s, a, c] = await Promise.all([
    prisma.session.updateMany({ where: { userId: 0 }, data: { userId } }),
    prisma.attempt.updateMany({ where: { userId: 0 }, data: { userId } }),
    prisma.checkin.updateMany({ where: { userId: 0 }, data: { userId } }),
  ]);
  console.log(`[migrate] backfilled sessions=${s.count} attempts=${a.count} checkins=${c.count}`);
}

async function migrateUserSettings(userId: number): Promise<void> {
  // Old single-row schema had id=1. Read by raw query because the prisma
  // client still uses the new (userId-unique) shape.
  const legacy = await prisma.$queryRawUnsafe<Array<{
    id: number;
    flashMs: number;
    fadeMs: number;
    pronunciationMode: string;
    pullPriority: string;
    enablePronunciation: boolean;
    accent: string;
    checkinRetentionDays: number | null;
    masteryThreshold: number;
    flashSkipMinLevel: number | null;
  }>>(`SELECT * FROM UserSettings WHERE id = 1 LIMIT 1`);

  if (legacy.length === 0) {
    // No legacy row — create a fresh one with defaults for the admin user.
    const existing = await prisma.userSettings.findUnique({ where: { userId } });
    if (!existing) {
      await prisma.userSettings.create({ data: { userId } });
      console.log(`[migrate] created fresh UserSettings for userId=${userId}`);
    } else {
      console.log(`[migrate] UserSettings already exists for userId=${userId}`);
    }
    return;
  }

  const r = legacy[0];
  await prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      flashMs: r.flashMs,
      fadeMs: r.fadeMs,
      pronunciationMode: r.pronunciationMode,
      pullPriority: r.pullPriority,
      enablePronunciation: r.enablePronunciation,
      accent: r.accent,
      checkinRetentionDays: r.checkinRetentionDays,
      masteryThreshold: r.masteryThreshold,
      flashSkipMinLevel: r.flashSkipMinLevel,
    },
    update: {
      flashMs: r.flashMs,
      fadeMs: r.fadeMs,
      pronunciationMode: r.pronunciationMode,
      pullPriority: r.pullPriority,
      enablePronunciation: r.enablePronunciation,
      accent: r.accent,
      checkinRetentionDays: r.checkinRetentionDays,
      masteryThreshold: r.masteryThreshold,
      flashSkipMinLevel: r.flashSkipMinLevel,
    },
  });
  // Drop the legacy row. userId column is unique so the new row already
  // lives at a different id.
  await prisma.$executeRawUnsafe(`DELETE FROM UserSettings WHERE id = 1`);
  console.log(`[migrate] migrated legacy UserSettings id=1 → userId=${userId}`);
}

async function main() {
  console.log("[migrate] starting single-user → multi-user migration");
  const admin = await ensureAdmin();
  await migrateWordsToUserWords(admin.id);
  await backfillUserId(admin.id);
  await migrateUserSettings(admin.id);
  console.log("[migrate] done. next step: drop legacy Word columns via db push --accept-data-loss");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
