#!/usr/bin/env bash
# tools/release-audio.sh — Pack and upload audio bundle to a GitHub Release.
#
# Usage:
#   tools/release-audio.sh                    # packs + uploads to v$DATE
#   tools/release-audio.sh --tag v0.1.0       # uploads to v0.1.0
#   AUDIO_BUNDLE_TAG=v0.1.0 tools/release-audio.sh
#
# Requires: gh CLI authenticated against the target repo, tar, sha256sum.
set -euo pipefail

REPO="${REPO:-meisijiya/IELTS_WORDS}"
TAG="${AUDIO_BUNDLE_TAG:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$TAG" ]; then
  TAG="audio-$(date +%Y%m%d-%H%M)"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AUDIO_DIR="public/audio"
TARBALL="release/audio.tgz"

if [ ! -d "$AUDIO_DIR" ]; then
  echo "ERR: $AUDIO_DIR not found — run tools/fetch_pronunciations.py first" >&2
  exit 1
fi

count=$(find "$AUDIO_DIR" -type f -name '*.mp3' | wc -l)
if [ "$count" -lt 1000 ]; then
  echo "ERR: only $count mp3 files found in $AUDIO_DIR — need ~1000+ for a usable bundle" >&2
  exit 1
fi

echo "[pack] $count mp3 files → $TARBALL"
mkdir -p release
tar czf "$TARBALL" "$AUDIO_DIR"

size=$(du -h "$TARBALL" | cut -f1)
echo "[pack] done: $size"
echo "[tag]  $TAG"
echo "[repo] $REPO"
echo ""
echo "Next: gh release create $TAG $TARBALL --repo $REPO --title 'audio bundle' --notes 'auto-bundled' --clobber"
