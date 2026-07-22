# ─── Build stage ─────────────────────────────────────────────
# Domestic mirrors: registry.cn-hangzhou.aliyuncs.com (Aliyun, most reliable)
# Fallback options documented in docs/deploy-docker.md
FROM node:22-alpine AS builder

# Replace Alpine apk mirrors with Aliyun
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories

# Use npmmirror for npm (Taobao)
ENV npm_config_registry=https://registry.npmmirror.com

WORKDIR /app

# Install OS deps: python3 for tools/, curl for optional audio bundle below.
RUN apk add --no-cache python3 py3-pip curl

# Install Node deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy source (public/audio/ gitignored — empty here; baked below if AUDIO_BUNDLE_URL set)
COPY . .

# Bake pronunciation audio into the image at build time.
# ghproxy.com prefix works for GitHub releases inside mainland China.
# Default empty → image ships without pre-baked audio (still functions, just silent).
ARG AUDIO_BUNDLE_URL=""
RUN if [ -n "$AUDIO_BUNDLE_URL" ]; then \
      echo "Baking audio from $AUDIO_BUNDLE_URL"; \
      mkdir -p public/audio; \
      curl -fsSL --max-time 300 "$AUDIO_BUNDLE_URL" | tar xz -C public/audio/ \
        || echo "WARN: audio bundle fetch failed; continuing without audio"; \
    else \
      echo "AUDIO_BUNDLE_URL not set — image ships without pre-baked audio"; \
    fi

# Generate Prisma client (sqlite for local dev consistency)
RUN npx prisma generate

# Build Next.js
RUN npm run build

# ─── Runtime stage ──────────────────────────────────────────
FROM node:22-alpine AS runner

# Replace Alpine apk mirrors with Aliyun
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories

# Use npmmirror for any runtime npm operations
ENV npm_config_registry=https://registry.npmmirror.com

WORKDIR /app
ENV NODE_ENV=production

# Minimal OS tools + python (only needed if you ever re-seed from PDFs)
RUN apk add --no-cache python3 py3-pip curl

COPY package.json package-lock.json ./

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/seed ./seed
COPY --from=builder /app/src ./src
COPY --from=builder /app/tools ./tools
COPY --from=builder /app/public ./public 2>/dev/null || true

# Entrypoint + healthcheck
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/login >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]