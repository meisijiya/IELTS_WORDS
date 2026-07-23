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

# Always run seed: WORDBOOKS uses upsert so this is idempotent — existing
# wordbooks are no-ops, any newly added wordbooks in code get registered.
WORD_COUNT=$(node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.word.count().then(n => { console.log(n); p.\$disconnect(); })" 2>/dev/null || echo 0)
echo "[entrypoint] current word count: $WORD_COUNT"

if [ -d "seed" ]; then
  echo "[entrypoint] running seed (idempotent upsert)..."
  npx tsx prisma/seed.ts 2>&1 | tail -30
fi

# Audio: prefer baked-in (from Dockerfile), fall back to runtime fetch if missing.
# Build-time curl is unreliable for non-Heroku blobs; persist via audio_data volume.
AUDIO_COUNT=$(find public/audio -type f -name "*.mp3" 2>/dev/null | wc -l)
if [ "$AUDIO_COUNT" -eq 0 ] && [ -n "$AUDIO_BUNDLE_URL" ]; then
  echo "[entrypoint] audio missing, fetching at runtime from $AUDIO_BUNDLE_URL"
  mkdir -p public/audio
  if curl -fsSL --retry 3 --retry-delay 5 --max-time 600 "$AUDIO_BUNDLE_URL" | tar xz -C public/audio/; then
    AUDIO_COUNT=$(find public/audio -type f -name "*.mp3" | wc -l)
    echo "[entrypoint] audio fetched at runtime: $AUDIO_COUNT files"
  else
    echo "[entrypoint] WARN: audio runtime fetch failed; continuing without audio"
  fi
fi
echo "[entrypoint] audio files: $AUDIO_COUNT"

# Restore Prisma schema if we patched it
if [ "${NEED_RESTORE:-0}" = "1" ]; then
  mv prisma/schema.sqlite.prisma.bak prisma/schema.prisma
fi

echo "[entrypoint] launching Next.js..."
exec "$@"