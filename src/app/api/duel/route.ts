import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";
import {
  DUEL_MODE_SPEED,
  DUEL_MODE_ROUND,
  ROUND_COUNT_OPTIONS,
  MODE1_WORD_POOL_SIZE,
} from "@/lib/duel";
import { shuffleWithSeed } from "@/lib/duel-shuffle";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  let body: { mode?: unknown; wordbookId?: unknown; roundCount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (body.mode !== 1 && body.mode !== 2) {
    return NextResponse.json({ error: "mode must be 1 or 2" }, { status: 400 });
  }
  const mode = body.mode === 1 ? DUEL_MODE_SPEED : DUEL_MODE_ROUND;

  const wordbookId = Number(body.wordbookId);
  if (!Number.isInteger(wordbookId)) {
    return NextResponse.json({ error: "wordbookId must be an integer" }, { status: 400 });
  }

  let roundCount = 20;
  if (mode === DUEL_MODE_ROUND) {
    if (body.roundCount !== undefined) {
      roundCount = Number(body.roundCount);
    }
    if (!(ROUND_COUNT_OPTIONS as readonly number[]).includes(roundCount)) {
      return NextResponse.json(
        { error: `roundCount must be one of [${ROUND_COUNT_OPTIONS.join(", ")}]` },
        { status: 400 },
      );
    }
  }

  const wordbook = await prisma.wordbook.findUnique({ where: { id: wordbookId } });
  if (!wordbook) {
    return NextResponse.json({ error: "WORDBOOK_NOT_FOUND" }, { status: 404 });
  }

  const words = await prisma.word.findMany({
    where: { wordbookId },
    select: { id: true },
  });
  if (words.length === 0) {
    return NextResponse.json({ error: "WORDBOOK_EMPTY" }, { status: 400 });
  }

  const id = randomUUID();
  const wordIds = words.map((w) => w.id);

  let selectedWordIds: number[];
  if (mode === DUEL_MODE_SPEED) {
    const pool = wordIds.slice(0, MODE1_WORD_POOL_SIZE);
    selectedWordIds = shuffleWithSeed(pool, id);
  } else {
    const pool = wordIds.slice(0, Math.max(roundCount, 30));
    selectedWordIds = shuffleWithSeed(pool, id);
  }

  await prisma.duel.create({
    data: {
      id,
      mode,
      status: "pending",
      wordbookId,
      durationSec: mode === DUEL_MODE_SPEED ? 60 : 0,
      roundCount: mode === DUEL_MODE_ROUND ? roundCount : 0,
      wordIds: JSON.stringify(selectedWordIds),
      challengerId: user.id,
    },
  });

  return NextResponse.json({
    id,
    mode,
    wordbookId,
    roundCount: mode === DUEL_MODE_ROUND ? roundCount : 0,
    durationSec: mode === DUEL_MODE_SPEED ? 60 : 0,
    wordIds: selectedWordIds,
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

  const duels = await prisma.duel.findMany({
    where: {
      OR: [{ challengerId: user.id }, { opponentId: user.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      wordbook: { select: { name: true, slug: true } },
    },
  });

  return NextResponse.json(
    duels.map((d) => ({
      id: d.id,
      mode: d.mode,
      status: d.status,
      wordbookId: d.wordbookId,
      wordbook: d.wordbook,
      roundCount: d.roundCount,
      durationSec: d.durationSec,
      challengerId: d.challengerId,
      opponentId: d.opponentId,
      createdAt: d.createdAt.toISOString(),
      startedAt: d.startedAt?.toISOString() ?? null,
      finishedAt: d.finishedAt?.toISOString() ?? null,
    })),
  );
}
