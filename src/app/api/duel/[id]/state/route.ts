import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";
import {
  checkForfeit,
  computeWinner,
  isMode1TimeUp,
  isMode2Complete,
  isMode2RoundTimedOut,
  parseWordIds,
  timeLeftSecMode1,
  DUEL_MODE_SPEED,
  DUEL_MODE_ROUND,
  type DuelRow,
  type DuelAnswerRow,
} from "@/lib/duel";

export async function GET(
  _request: Request,
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

  const duel = await prisma.duel.findUnique({
    where: { id },
    include: {
      challenger: { select: { id: true, username: true } },
      opponent: { select: { id: true, username: true } },
    },
  });
  if (!duel) {
    return NextResponse.json({ error: "duel not found" }, { status: 404 });
  }

  if (duel.challengerId !== user.id && duel.opponentId !== user.id) {
    return NextResponse.json(
      { error: "Not a participant", code: "NOT_PARTICIPANT" },
      { status: 403 },
    );
  }

  const serverNow = new Date();

  if (duel.challengerId === user.id) {
    await prisma.duel.update({ where: { id }, data: { challengerLastSeenAt: serverNow } });
  } else {
    await prisma.duel.update({ where: { id }, data: { opponentLastSeenAt: serverNow } });
  }

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

  const serverNowMs = serverNow.getTime();

  if (duelRow.status === "active") {
    const opponentLastSeenAt =
      user.id === duel.challengerId ? duel.opponentLastSeenAt : duel.challengerLastSeenAt;

    const forfeitResult = checkForfeit(duelRow, user.id, opponentLastSeenAt ?? null, serverNowMs);
    if (forfeitResult.forfeit) {
      await prisma.duel.update({
        where: { id },
        data: {
          status: "forfeited",
          winnerId: forfeitResult.winnerId,
          forfeitById: forfeitResult.forfeitById,
          finishedAt: serverNow,
        },
      });
    } else if (duelRow.mode === DUEL_MODE_SPEED && isMode1TimeUp(duelRow, serverNowMs)) {
      const allAnswers = await prisma.duelAnswer.findMany({ where: { duelId: id } });
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
      await prisma.duel.update({
        where: { id },
        data: { status: "finished", winnerId, finishedAt: serverNow },
      });
    } else if (duelRow.mode === DUEL_MODE_ROUND) {
      const roundIdx = duelRow.currentRoundIndex ?? 0;

      const roundAnswers = await prisma.duelAnswer.findMany({
        where: { duelId: id, roundIndex: roundIdx },
      });

      const cAns = roundAnswers.find((a) => a.userId === duel.challengerId) ?? null;
      const oAns = roundAnswers.find((a) => a.userId === duel.opponentId) ?? null;
      const bothSubmitted = cAns && oAns;
      const roundTimedOut = isMode2RoundTimedOut(duelRow, serverNowMs);

      if (bothSubmitted || roundTimedOut) {
        const newRoundIndex = roundIdx + 1;

        if (isMode2Complete({ ...duelRow, currentRoundIndex: newRoundIndex })) {
          const allAnswers = await prisma.duelAnswer.findMany({ where: { duelId: id } });
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
          await prisma.duel.update({
            where: { id },
            data: {
              status: "finished",
              winnerId,
              finishedAt: serverNow,
              currentRoundIndex: newRoundIndex,
            },
          });
        } else {
          await prisma.duel.update({
            where: { id },
            data: {
              currentRoundIndex: newRoundIndex,
              currentRoundStartedAt: serverNow,
            },
          });
        }
      }
    }
  }

  const latestDuel = await prisma.duel.findUnique({
    where: { id },
    include: {
      challenger: { select: { id: true, username: true } },
      opponent: { select: { id: true, username: true } },
    },
  });
  if (!latestDuel) {
    return NextResponse.json({ error: "duel not found" }, { status: 404 });
  }

  const wordIds = parseWordIds(latestDuel.wordIds);

  let currentWordId: number | null = null;
  if (latestDuel.mode === DUEL_MODE_SPEED && latestDuel.status === "active") {
    const answeredCount = await prisma.duelAnswer.count({
      where: { duelId: id, userId: user.id },
    });
    currentWordId = answeredCount < wordIds.length ? wordIds[answeredCount] : null;
  } else if (latestDuel.mode === DUEL_MODE_ROUND) {
    const roundIdx = latestDuel.currentRoundIndex ?? 0;
    const isFinished = latestDuel.status !== "active";
    currentWordId = isFinished || roundIdx >= wordIds.length ? null : wordIds[roundIdx];
  }

  let currentWordSpelling: string | null = null;
  let currentWordGlosses: Array<{ pos: string; meaning: string }> | null = null;
  if (currentWordId != null) {
    const word = await prisma.word.findUnique({ where: { id: currentWordId } });
    if (word) {
      currentWordSpelling = word.spelling;
      try {
        const parsed = JSON.parse(word.glosses);
        currentWordGlosses = Array.isArray(parsed) ? parsed : null;
      } catch {
        currentWordGlosses = null;
      }
    }
  }

  const myScore = await prisma.duelAnswer.count({
    where: { duelId: id, userId: user.id, correct: true },
  });

  const opponentUserId =
    latestDuel.challengerId === user.id ? latestDuel.opponentId : latestDuel.challengerId;

  let opponentScore = 0;
  if (opponentUserId != null) {
    opponentScore = await prisma.duelAnswer.count({
      where: { duelId: id, userId: opponentUserId, correct: true },
    });
  }

  let opponentStatus: "waiting" | "submitted" | "disconnected" | "forfeited" | null = null;
  if (latestDuel.status === "forfeited") {
    opponentStatus = "forfeited";
  } else if (opponentUserId != null && latestDuel.status === "active") {
    if (latestDuel.mode === DUEL_MODE_ROUND) {
      const roundIdx = latestDuel.currentRoundIndex ?? 0;
      const oppAns = await prisma.duelAnswer.findFirst({
        where: { duelId: id, userId: opponentUserId, roundIndex: roundIdx },
      });
      opponentStatus = oppAns ? "submitted" : "waiting";
    } else {
      opponentStatus = "waiting";
    }

    if (opponentStatus !== "submitted") {
      const oppLastSeen =
        latestDuel.opponentId === opponentUserId
          ? latestDuel.opponentLastSeenAt
          : latestDuel.challengerLastSeenAt;
      if (oppLastSeen) {
        const thresholdMs = latestDuel.mode === DUEL_MODE_SPEED ? 30000 : 60000;
        if (serverNowMs - oppLastSeen.getTime() > thresholdMs) {
          opponentStatus = "disconnected";
        }
      }
    }
  }

  const timeLeftSec =
    latestDuel.mode === DUEL_MODE_SPEED ? timeLeftSecMode1(duelRow, serverNowMs) : null;

  return NextResponse.json({
    id: latestDuel.id,
    mode: latestDuel.mode,
    status: latestDuel.status,
    wordbookId: latestDuel.wordbookId,
    durationSec: latestDuel.durationSec,
    roundCount: latestDuel.roundCount,
    wordIds,
    challenger: latestDuel.challenger,
    opponent: latestDuel.opponent,
    currentWordId,
    currentWordSpelling,
    currentWordGlosses,
    serverNow: serverNowMs,
    startedAt: latestDuel.startedAt?.toISOString() ?? null,
    finishedAt: latestDuel.finishedAt?.toISOString() ?? null,
    timeLeftSec,
    currentRoundIndex: latestDuel.currentRoundIndex,
    currentRoundStartedAt: latestDuel.currentRoundStartedAt?.toISOString() ?? null,
    myScore,
    opponentScore,
    opponentStatus,
    opponentLastSeenAt:
      (latestDuel.challengerId === opponentUserId
        ? latestDuel.challengerLastSeenAt
        : latestDuel.opponentLastSeenAt
      )?.toISOString() ?? null,
    winnerId: latestDuel.winnerId,
    forfeitById: latestDuel.forfeitById,
  });
}
