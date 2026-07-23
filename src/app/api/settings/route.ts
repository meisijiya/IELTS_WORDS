import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

const DEFAULTS = {
  flashMs: 800,
  fadeMs: 300,
  pronunciationMode: "both" as "both" | "flash" | "feedback" | "off",
  pullPriority: "review" as "review" | "balanced" | "new",
  enablePronunciation: true,
  accent: "us",
  checkinRetentionDays: null as number | null,
  masteryThreshold: 5,
  flashSkipMinLevel: null as number | null,
  soundEnabled: true,
};

const PRON_MODES = new Set(["both", "flash", "feedback", "off"]);
const PULL_MODES = new Set(["review", "balanced", "new"]);
const RETENTION_MAX_DAYS = 3650;
const MASTERY_THRESHOLD_MIN = 2;
const MASTERY_THRESHOLD_MAX = 20;
const FLASH_SKIP_MIN_LEVEL_MIN = 1;
const FLASH_SKIP_MIN_LEVEL_MAX = 100;

function normalizePronMode(value: unknown): typeof DEFAULTS.pronunciationMode {
  return typeof value === "string" && PRON_MODES.has(value)
    ? (value as typeof DEFAULTS.pronunciationMode)
    : DEFAULTS.pronunciationMode;
}

function normalizePullPriority(value: unknown): typeof DEFAULTS.pullPriority {
  return typeof value === "string" && PULL_MODES.has(value)
    ? (value as typeof DEFAULTS.pullPriority)
    : DEFAULTS.pullPriority;
}

function normalizeRetention(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(RETENTION_MAX_DAYS, Math.floor(n));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const floored = Math.floor(n);
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
}

async function ensureSettings(userId: number) {
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...DEFAULTS },
    update: {},
  });
}

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }
  const settings = await ensureSettings(user.id);
  const mode = normalizePronMode(
    (settings as { pronunciationMode?: string }).pronunciationMode ??
      (settings.enablePronunciation ? "both" : "off"),
  );
  const pullPriority = normalizePullPriority(
    (settings as { pullPriority?: string }).pullPriority,
  );
  return NextResponse.json({
    flashMs: settings.flashMs,
    fadeMs: settings.fadeMs,
    pronunciationMode: mode,
    pullPriority,
    enablePronunciation: settings.enablePronunciation,
    accent: settings.accent,
    checkinRetentionDays: settings.checkinRetentionDays ?? null,
    masteryThreshold: settings.masteryThreshold,
    flashSkipMinLevel: settings.flashSkipMinLevel ?? null,
    soundEnabled: settings.soundEnabled,
  });
}

export async function PUT(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  let body: Partial<typeof DEFAULTS>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const flashMs = Math.max(100, Math.min(3000, Number(body.flashMs) || DEFAULTS.flashMs));
  const fadeMs = Math.max(100, Math.min(1000, Number(body.fadeMs) || DEFAULTS.fadeMs));
  const legacyEnable = typeof body.enablePronunciation === "boolean"
    ? body.enablePronunciation
    : DEFAULTS.enablePronunciation;
  const pronunciationMode = body.pronunciationMode !== undefined
    ? normalizePronMode(body.pronunciationMode)
    : (legacyEnable ? "both" : "off");
  const enablePronunciation = pronunciationMode !== "off";
  const pullPriority = normalizePullPriority(body.pullPriority);
  const accent = body.accent === "uk" ? "uk" : "us";
  const checkinRetentionDays = normalizeRetention(body.checkinRetentionDays);
  const masteryThreshold = clampInt(
    body.masteryThreshold,
    MASTERY_THRESHOLD_MIN,
    MASTERY_THRESHOLD_MAX,
    DEFAULTS.masteryThreshold,
  );
  const flashSkipMinLevel = body.flashSkipMinLevel === null || body.flashSkipMinLevel === undefined
    ? null
    : clampInt(
      body.flashSkipMinLevel,
      FLASH_SKIP_MIN_LEVEL_MIN,
      FLASH_SKIP_MIN_LEVEL_MAX,
      FLASH_SKIP_MIN_LEVEL_MIN,
    );
  const soundEnabled = typeof body.soundEnabled === "boolean"
    ? body.soundEnabled
    : DEFAULTS.soundEnabled;

  const current = await ensureSettings(user.id);
  const lowered = masteryThreshold < current.masteryThreshold;
  const updateData = {
    flashMs,
    fadeMs,
    pronunciationMode,
    enablePronunciation,
    pullPriority,
    accent,
    checkinRetentionDays,
    masteryThreshold,
    flashSkipMinLevel,
    soundEnabled,
  };

  let promotedCount = 0;
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.userSettings.update({
      where: { userId: user.id },
      data: updateData,
    });
    if (lowered) {
      const res = await tx.userWord.updateMany({
        where: { userId: user.id, level: { gte: masteryThreshold }, masteredAt: null },
        data: { masteredAt: new Date() },
      });
      promotedCount = res.count;
    }
    return u;
  });

  return NextResponse.json({
    flashMs: updated.flashMs,
    fadeMs: updated.fadeMs,
    pronunciationMode: pronunciationMode,
    pullPriority,
    enablePronunciation: updated.enablePronunciation,
    accent: updated.accent,
    checkinRetentionDays: updated.checkinRetentionDays ?? null,
    masteryThreshold: updated.masteryThreshold,
    flashSkipMinLevel: updated.flashSkipMinLevel ?? null,
    soundEnabled: updated.soundEnabled,
    ...(lowered ? { promotedCount } : {}),
  });
}
