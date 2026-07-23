import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

const MASTERY_THRESHOLD_FALLBACK = 5;

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  let body: { wordId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const wordId = Number(body.wordId);
  if (!Number.isInteger(wordId) || wordId < 1) {
    return NextResponse.json({ error: "wordId required" }, { status: 400 });
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { masteryThreshold: true },
  });
  const threshold = settings?.masteryThreshold ?? MASTERY_THRESHOLD_FALLBACK;

  await prisma.userWord.upsert({
    where: { userId_wordId: { userId: user.id, wordId } },
    create: { userId: user.id, wordId, level: threshold, masteredAt: new Date() },
    update: { level: threshold, masteredAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
