#!/bin/sh
# Docker entrypoint: wait for Postgres, apply schema, seed if empty, start server.
set -eu

echo "[entrypoint] starting Yasi Words container..."

# Switch Prisma provider based on DATABASE_URL scheme (sqlite vs postgres)
if echo "$DATABASE_URL" | grep -qE '^postgres'; then
  if grep -q 'provider = "sqlite"' prisma/schema.prisma; then
    echo "[entrypoint] switching Prisma provider to postgresql for this run"
    cp prisma/schema.prisma prisma/schema.sqlite.prisma.bak
    sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
    echo "[entrypoint] regenerating Prisma client for postgresql..."
    npx prisma generate >/dev/null 2>&1
    NEED_RESTORE=1
  fi
fi

# Wait for Postgres to accept connections (up to ~30s)
echo "[entrypoint] waiting for database..."
i=0
while [ "$i" -lt 30 ]; do
  if node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.\$queryRaw\`SELECT 1\`.then(() => { p.\$disconnect(); process.exit(0); }).catch(() => process.exit(1));" >/dev/null 2>&1; then
    echo "[entrypoint] database ready"
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$i" -ge 30 ]; then
  echo "[entrypoint] ERROR: database not reachable after 30s"
  exit 1
fi

# Apply schema (idempotent)
echo "[entrypoint] applying schema..."
npx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -5 || true

# Seed only if database is empty
WORD_COUNT=$(node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.word.count().then(n => { console.log(n); p.\$disconnect(); })" 2>/dev/null || echo 0)
echo "[entrypoint] current word count: $WORD_COUNT"

if [ "$WORD_COUNT" = "0" ] && [ -d "seed" ]; then
  echo "[entrypoint] seeding database from seed/*.json..."
  npx tsx prisma/seed.ts 2>&1 | tail -20
else
  echo "[entrypoint] skipping seed (DB has $WORD_COUNT words)"
fi

# Auto-fetch pronunciation audio if not baked in.
# public/audio/ is gitignored; threshold 1000 = skip if already cached.
AUDIO_COUNT=$(find public/audio -type f -name "*.mp3" 2>/dev/null | wc -l)
echo "[entrypoint] audio files present: $AUDIO_COUNT"
if [ "$AUDIO_COUNT" -lt 1000 ]; then
  echo "[entrypoint] audio insufficient — running fetch_pronunciations.py (US+UK)..."
  python3 tools/fetch_pronunciations.py --concurrency 6 --delay 0.2 || \
    echo "[entrypoint] WARN: audio fetch incomplete; some words may lack audio"
  AUDIO_COUNT=$(find public/audio -type f -name "*.mp3" 2>/dev/null | wc -l)
  echo "[entrypoint] audio fetch done: $AUDIO_COUNT files"
else
  echo "[entrypoint] audio sufficient, skipping fetch"
fi

# Restore Prisma schema if we patched it
if [ "${NEED_RESTORE:-0}" = "1" ]; then
  mv prisma/schema.sqlite.prisma.bak prisma/schema.prisma
fi

echo "[entrypoint] launching Next.js..."
exec "$@"