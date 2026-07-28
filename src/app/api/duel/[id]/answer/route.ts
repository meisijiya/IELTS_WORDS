import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";
import {
  checkSpelling,
  computeWinner,
  isMode1TimeUp,
  isMode2Complete,
  isMode2RoundTimedOut,
  parseWordIds,
  DUEL_MODE_SPEED,
  DUEL_MODE_ROUND,
  type DuelRow,
  type DuelAnswerRow,
} from "@/lib/duel";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  const { id } = await params;

  const duel = await prisma.duel.findUnique({ where: { id } });
  if (!duel) {
    return NextResponse.json({ error: "duel not found" }, { status: 404 });
  }

  if (duel.challengerId !== user.id && duel.opponentId !== user.id) {
    return NextResponse.json(
      { error: "Not a participant", code: "NOT_PARTICIPANT" },
      { status: 403 },
    );
  }

  if (duel.status !== "active") {
    return NextResponse.json(
      { error: "Duel is already finished", code: "DUEL_FINISHED" },
      { status: 409 },
    );
  }

  let body: { wordId?: unknown; typed?: unknown; roundIndex?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { wordId, typed, roundIndex } = body;

  if (typeof wordId !== "number" || !Number.isInteger(wordId)) {
    return NextResponse.json({ error: "wordId must be an integer" }, { status: 400 });
  }

  if (typeof typed !== "string") {
    return NextResponse.json({ error: "typed must be a string" }, { status: 400 });
  }

  if (duel.mode === DUEL_MODE_SPEED) {
    if (roundIndex != null) {
      return NextResponse.json(
        { error: "roundIndex must be null for mode 1", code: "INVALID_ROUND_INDEX" },
        { status: 400 },
      );
    }
  } else {
    if (typeof roundIndex !== "number" || !Number.isInteger(roundIndex) || (roundIndex as number) < 0) {
      return NextResponse.json(
        { error: "roundIndex must be a non-negative integer for mode 2", code: "INVALID_ROUND_INDEX" },
        { status: 400 },
      );
    }
  }

  const wordPool = parseWordIds(duel.wordIds);
  if (!wordPool.includes(wordId as number)) {
    return NextResponse.json(
      { error: "Word not in duel pool", code: "INVALID_WORD" },
      { status: 400 },
    );
  }

  const word = await prisma.word.findUnique({ where: { id: wordId as number } });
  if (!word || word.wordbookId !== duel.wordbookId) {
    return NextResponse.json(
      { error: "Word not found", code: "INVALID_WORD" },
      { status: 400 },
    );
  }

  const serverNow = Date.now();

  const roundIdx = duel.mode === DUEL_MODE_ROUND ? (roundIndex as number) : null;

  if (duel.mode === DUEL_MODE_ROUND) {
    const existing = await prisma.duelAnswer.findUnique({
      where: { duelId_userId_roundIndex: { duelId: id, userId: user.id, roundIndex: roundIdx as number } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Round already submitted", code: "ROUND_ALREADY_SUBMITTED" },
        { status: 409 },
      );
    }
  }

  const elapsedMs = Math.max(0, serverNow - (
    duel.mode === DUEL_MODE_ROUND && duel.currentRoundStartedAt
      ? duel.currentRoundStartedAt.getTime()
      : duel.startedAt?.getTime() ?? serverNow
  ));

  const correct = checkSpelling(typed as string, word.spelling);

  const duelRow: DuelRow = {
    id: duel.id,
    mode: duel.mode,
    status: duel.status,
    wordbookId: duel.wordbookId,
    durationSec: duel.durationSec,
    roundCount: duel.roundCount,
    wordIds: duel.wordIds,
    challengerId: duel.challengerId,
    opponentId: duel.opponentId,
    createdAt: duel.createdAt,
    startedAt: duel.startedAt,
    finishedAt: duel.finishedAt,
    winnerId: duel.winnerId,
    forfeitById: duel.forfeitById,
    challengerLastSeenAt: duel.challengerLastSeenAt,
    opponentLastSeenAt: duel.opponentLastSeenAt,
    currentRoundIndex: duel.currentRoundIndex,
    currentRoundStartedAt: duel.currentRoundStartedAt,
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.duelAnswer.create({
        data: {
          duelId: id,
          userId: user.id,
          wordId: wordId as number,
          roundIndex: roundIdx,
          correct,
          elapsedMs,
          submittedAt: new Date(),
        },
      });

      let duelFinished = false;

      if (duel.mode === DUEL_MODE_SPEED) {
        if (isMode1TimeUp(duelRow, serverNow)) {
          const allAnswers = await tx.duelAnswer.findMany({ where: { duelId: id } });
          const answerRows: DuelAnswerRow[] = allAnswers.map((a) => ({
            id: a.id,
            duelId: a.duelId,
            userId: a.userId,
            wordId: a.wordId,
            roundIndex: a.roundIndex,
            correct: a.correct,
            elapsedMs: a.elapsedMs,
            submittedAt: a.submittedAt,
          }));
          const winnerId = computeWinner(duelRow, answerRows);
          await tx.duel.update({
            where: { id },
            data: { status: "finished", winnerId, finishedAt: new Date() },
          });
          duelFinished = true;
        }
      } else {
        const roundAnswers = await tx.duelAnswer.findMany({
          where: { duelId: id, roundIndex: roundIdx },
        });

        const cAns = roundAnswers.find((a) => a.userId === duel.challengerId) ?? null;
        const oAns = roundAnswers.find((a) => a.userId === duel.opponentId) ?? null;
        const bothSubmitted = cAns && oAns;
        const roundTimedOut = isMode2RoundTimedOut(duelRow, serverNow);

        if (bothSubmitted || roundTimedOut) {
          const newRoundIndex = (duelRow.currentRoundIndex ?? 0) + 1;

          if (isMode2Complete({ ...duelRow, currentRoundIndex: newRoundIndex })) {
            const allAnswers = await tx.duelAnswer.findMany({ where: { duelId: id } });
            const answerRows: DuelAnswerRow[] = allAnswers.map((a) => ({
              id: a.id,
              duelId: a.duelId,
              userId: a.userId,
              wordId: a.wordId,
              roundIndex: a.roundIndex,
              correct: a.correct,
              elapsedMs: a.elapsedMs,
              submittedAt: a.submittedAt,
            }));
            const winnerId = computeWinner(
              { ...duelRow, currentRoundIndex: newRoundIndex },
              answerRows,
            );
            await tx.duel.update({
              where: { id },
              data: {
                status: "finished",
                winnerId,
                finishedAt: new Date(),
                currentRoundIndex: newRoundIndex,
              },
            });
            duelFinished = true;
          } else {
            await tx.duel.update({
              where: { id },
              data: {
                currentRoundIndex: newRoundIndex,
                currentRoundStartedAt: new Date(),
              },
            });
          }
        }
      }

      const totalCorrect = await tx.duelAnswer.count({
        where: { duelId: id, userId: user.id, correct: true },
      });

      return { correct, elapsedMs, totalCorrect, finished: duelFinished };
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Round already submitted", code: "ROUND_ALREADY_SUBMITTED" },
        { status: 409 },
      );
    }
    throw e;
  }
}
