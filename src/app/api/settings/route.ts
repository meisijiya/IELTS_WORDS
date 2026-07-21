import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

const DEFAULTS = {
  dailyWordCount: 20,
  flashMs: 800,
  fadeMs: 300,
  pronunciationMode: "both" as "both" | "flash" | "feedback" | "off",
  enablePronunciation: true,
  accent: "us",
};
const SINGLETON_ID = 1;

const PRON_MODES = new Set(["both", "flash", "feedback", "off"]);

function normalizePronMode(value: unknown): typeof DEFAULTS.pronunciationMode {
  return typeof value === "string" && PRON_MODES.has(value)
    ? (value as typeof DEFAULTS.pronunciationMode)
    : DEFAULTS.pronunciationMode;
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
  return NextResponse.json({
    dailyWordCount: settings.dailyWordCount,
    flashMs: settings.flashMs,
    fadeMs: settings.fadeMs,
    pronunciationMode: mode,
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

  const dailyWordCount = Math.max(1, Math.min(200, Number(body.dailyWordCount) || DEFAULTS.dailyWordCount));
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
  const accent = body.accent === "uk" ? "uk" : "us";

  await ensureSingleton();
  const updated = await prisma.userSettings.update({
    where: { id: SINGLETON_ID },
    data: { dailyWordCount, flashMs, fadeMs, pronunciationMode, enablePronunciation, accent },
  });

  return NextResponse.json({
    dailyWordCount: updated.dailyWordCount,
    flashMs: updated.flashMs,
    fadeMs: updated.fadeMs,
    pronunciationMode: pronunciationMode,
    enablePronunciation: updated.enablePronunciation,
    accent: updated.accent,
  });
}