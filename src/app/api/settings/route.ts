import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

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
};
const SINGLETON_ID = 1;

const PRON_MODES = new Set(["both", "flash", "feedback", "off"]);
const PULL_MODES = new Set(["review", "balanced", "new"]);
// Hard upper bound — accidental 1_000_000-day inputs would silently do nothing
// (cutoff lands in the past), but a sane ceiling documents intent.
const RETENTION_MAX_DAYS = 3650;
// masteryThreshold: 2 is the floor (need room for a wrong to de-master from one rung above);
// 20 is a sane ceiling beyond which the SM-2 ladder stops being useful.
const MASTERY_THRESHOLD_MIN = 2;
const MASTERY_THRESHOLD_MAX = 20;
// flashSkipMinLevel: 1 is the floor; 100 is the ceiling (way past any reasonable ladder).
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

async function ensureSingleton() {
  const existing = await prisma.userSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.userSettings.create({
    data: { id: SINGLETON_ID, ...DEFAULTS },
  });
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  const settings = await ensureSingleton();
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
  });
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  let body: Partial<typeof DEFAULTS>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const flashMs = Math.max(100, Math.min(3000, Number(body.flashMs) || DEFAULTS.flashMs));
  const fadeMs = Math.max(100, Math.min(1000, Number(body.fadeMs) || DEFAULTS.fadeMs));
  // pronunciationMode is canonical; back-compat: if not provided, derive from enablePronunciation.
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

  const current = await ensureSingleton();
  // Lowering the threshold retroactively marks already-qualified words as
  // mastered. Raising or holding the value is a no-op (mastery is sticky).
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
  };

  let promotedCount = 0;
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.userSettings.update({
      where: { id: SINGLETON_ID },
      data: updateData,
    });
    if (lowered) {
      const res = await tx.word.updateMany({
        where: { level: { gte: masteryThreshold }, masteredAt: null },
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
    ...(lowered ? { promotedCount } : {}),
  });
}