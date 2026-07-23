-- Run as: docker exec -i yasi-postgres psql -U yasi -d yasi_db -v ON_ERROR_STOP=1 < /tmp/fix.sql
-- One-shot recovery for production DB missing User/Invitation/UserWord tables.
-- Idempotent: skips creation if objects already exist.

BEGIN;

-- 1. Create User table if missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'User' AND table_schema = 'public') THEN
    CREATE TABLE "User" (
      "id"            SERIAL PRIMARY KEY,
      "username"      TEXT NOT NULL UNIQUE,
      "passwordHash"  TEXT NOT NULL,
      "role"          TEXT NOT NULL DEFAULT 'user',
      "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    RAISE NOTICE 'created User table';
  ELSE
    RAISE NOTICE 'User table already exists — skipping';
  END IF;
END $$;

-- 2. Create Invitation table if missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Invitation' AND table_schema = 'public') THEN
    CREATE TABLE "Invitation" (
      "id"         SERIAL PRIMARY KEY,
      "code"       TEXT NOT NULL UNIQUE,
      "inviterId"  INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "expiresAt"  TIMESTAMP(3) NOT NULL,
      "usedAt"     TIMESTAMP(3),
      "usedById"   INTEGER REFERENCES "User"("id"),
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "Invitation_inviterId_idx" ON "Invitation"("inviterId");
    CREATE INDEX "Invitation_usedById_idx" ON "Invitation"("usedById");
    RAISE NOTICE 'created Invitation table';
  ELSE
    RAISE NOTICE 'Invitation table already exists — skipping';
  END IF;
END $$;

-- 3. Create UserWord table if missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'UserWord' AND table_schema = 'public') THEN
    CREATE TABLE "UserWord" (
      "userId"            INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "wordId"            INTEGER NOT NULL REFERENCES "Word"("id") ON DELETE CASCADE,
      "level"             INTEGER NOT NULL DEFAULT 0,
      "easeFactor"        DOUBLE PRECISION NOT NULL DEFAULT 2.5,
      "interval"          INTEGER NOT NULL DEFAULT 0,
      "dueAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "attempts"          INTEGER NOT NULL DEFAULT 0,
      "correct"           INTEGER NOT NULL DEFAULT 0,
      "masteredAt"        TIMESTAMP(3),
      "firstAttemptedAt"  TIMESTAMP(3),
      PRIMARY KEY ("userId", "wordId")
    );
    CREATE INDEX "UserWord_userId_dueAt_idx"      ON "UserWord"("userId", "dueAt");
    CREATE INDEX "UserWord_userId_level_idx"      ON "UserWord"("userId", "level");
    CREATE INDEX "UserWord_userId_masteredAt_idx" ON "UserWord"("userId", "masteredAt");
    CREATE INDEX "UserWord_userId_firstAttemptedAt_idx" ON "UserWord"("userId", "firstAttemptedAt");
    RAISE NOTICE 'created UserWord table';
  ELSE
    RAISE NOTICE 'UserWord table already exists — skipping';
  END IF;
END $$;

-- 4. Add userId column to legacy tables if missing (default 0 placeholder;
--    the schema push will overwrite the value once a real default user is
--    created and migrated). These ALTERs are idempotent via IF NOT EXISTS.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UserSettings' AND column_name = 'userId' AND table_schema = 'public'
  ) THEN
    EXECUTE 'ALTER TABLE "UserSettings" ADD COLUMN "userId" INTEGER NOT NULL DEFAULT 0';
    EXECUTE 'CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId")';
    RAISE NOTICE 'added userId to UserSettings';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Session' AND column_name = 'userId' AND table_schema = 'public'
  ) THEN
    EXECUTE 'ALTER TABLE "Session" ADD COLUMN "userId" INTEGER NOT NULL DEFAULT 0';
    EXECUTE 'CREATE INDEX "Session_userId_wordbookId_endedAt_idx" ON "Session"("userId", "wordbookId", "endedAt")';
    RAISE NOTICE 'added userId to Session';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Attempt' AND column_name = 'userId' AND table_schema = 'public'
  ) THEN
    EXECUTE 'ALTER TABLE "Attempt" ADD COLUMN "userId" INTEGER NOT NULL DEFAULT 0';
    EXECUTE 'CREATE INDEX "Attempt_userId_wordId_idx" ON "Attempt"("userId", "wordId")';
    EXECUTE 'CREATE INDEX "Attempt_userId_createdAt_idx" ON "Attempt"("userId", "createdAt")';
    RAISE NOTICE 'added userId to Attempt';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Checkin' AND column_name = 'userId' AND table_schema = 'public'
  ) THEN
    EXECUTE 'ALTER TABLE "Checkin" ADD COLUMN "userId" INTEGER NOT NULL DEFAULT 0';
    EXECUTE 'CREATE UNIQUE INDEX "Checkin_userId_date_key" ON "Checkin"("userId", "date")';
    EXECUTE 'CREATE INDEX "Checkin_userId_date_idx" ON "Checkin"("userId", "date")';
    RAISE NOTICE 'added userId to Checkin';
  END IF;
END $$;

COMMIT;

-- Verification (run after the script):
-- SELECT id, username, role FROM "User";