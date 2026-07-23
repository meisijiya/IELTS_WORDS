-- Migrate legacy userId=0 rows to the bootstrapped admin user (id=1).
-- Used after the prisma db push rollback recovery (see CICD.md 坑 13).
-- Idempotent: safe to re-run; UPDATE ... WHERE "userId" = 0 is a no-op the
-- second time because the rows have already moved.

BEGIN;

DO $$
DECLARE
  admin_id INT;
  attempts_moved INT;
  sessions_moved INT;
  checkins_moved INT;
  settings_moved INT;
BEGIN
  SELECT id INTO admin_id FROM "User" WHERE role = 'admin' ORDER BY id LIMIT 1;
  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'no admin user found — run Fix-Prod-Schema first';
  END IF;

  UPDATE "Attempt"      SET "userId" = admin_id WHERE "userId" = 0;
  GET DIAGNOSTICS attempts_moved = ROW_COUNT;

  UPDATE "Session"      SET "userId" = admin_id WHERE "userId" = 0;
  GET DIAGNOSTICS sessions_moved = ROW_COUNT;

  UPDATE "Checkin"      SET "userId" = admin_id WHERE "userId" = 0;
  GET DIAGNOSTICS checkins_moved = ROW_COUNT;

  -- UserSettings.userId has @unique. If a placeholder row at userId=0
  -- exists, drop it before claiming userId=1 for the new admin row.
  DELETE FROM "UserSettings" WHERE "userId" = 0;
  GET DIAGNOSTICS settings_moved = ROW_COUNT;

  RAISE NOTICE 'migrated to admin (id=%): attempts=%, sessions=%, checkins=%, settings_dropped=%',
    admin_id, attempts_moved, sessions_moved, checkins_moved, settings_moved;
END $$;

COMMIT;

-- Verification:
-- SELECT "userId", COUNT(*) FROM "Attempt" GROUP BY "userId";
-- SELECT MIN("createdAt"), MAX("createdAt"), COUNT(*) FROM "Attempt";