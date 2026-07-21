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
};
const SINGLETON_ID = 1;

const PRON_MODES = new Set(["both", "flash", "feedback", "off"]);
const PULL_MODES = new Set(["review", "balanced", "new"]);

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

  await ensureSingleton();
  const updated = await prisma.userSettings.update({
    where: { id: SINGLETON_ID },
    data: { flashMs, fadeMs, pronunciationMode, enablePronunciation, pullPriority, accent },
  });

  return NextResponse.json({
    flashMs: updated.flashMs,
    fadeMs: updated.fadeMs,
    pronunciationMode: pronunciationMode,
    pullPriority,
    enablePronunciation: updated.enablePronunciation,
    accent: updated.accent,
  });
}