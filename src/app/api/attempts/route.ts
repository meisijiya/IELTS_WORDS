import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

const MASTERY_THRESHOLD_FALLBACK = 5;
const SETTINGS_SINGLETON_ID = 1;

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  let body: {
    sessionId?: string;
    wordId?: number;
    typed?: string;
    correct?: boolean;
    retries?: number;
    errorType?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { sessionId, wordId, typed, correct } = body;
  if (
    typeof sessionId !== "string" ||
    typeof wordId !== "number" ||
    typeof typed !== "string" ||
    typeof correct !== "boolean"
  ) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  try {
  const [attempt, updatedWord, deMastered, newlyMastered, masteryThreshold] = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { mode: true },
    });
    if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Session 不存在");

    const word = await tx.word.findUnique({
      where: { id: wordId },
      select: { level: true, masteredAt: true, attempts: true, correct: true },
    });
    if (!word) throw new ApiError(404, "WORD_NOT_FOUND", "Word 不存在");

    const settings = await tx.userSettings.findUnique({
      where: { id: SETTINGS_SINGLETON_ID },
      select: { masteryThreshold: true },
    });
    const masteryThreshold = settings?.masteryThreshold ?? MASTERY_THRESHOLD_FALLBACK;

    // Review mode (错题批量练习): only log the attempt, never mutate Word state.
    // Drill mode (默认): full SM-2 ladder / mastery promotion logic.
    if (session.mode === "review") {
      const a = await tx.attempt.create({
        data: {
          sessionId,
          wordId,
          typed,
          correct,
          retries: body.retries ?? 0,
          errorType: body.errorType ?? null,
        },
      });
      return [a, word, false, false, masteryThreshold] as const;
    }

    let newLevel: number;
    // undefined = leave masteredAt untouched; null/Date = explicit write
    let masteredAtChange: Date | null | undefined = undefined;
    let deMastered = false;
    let newlyMastered = false;

    if (correct) {
      newLevel = Math.min(masteryThreshold, word.level + 1);
      if (newLevel === masteryThreshold && !word.masteredAt) {
        masteredAtChange = new Date();
        newlyMastered = true;
      }
    } else if (word.level >= masteryThreshold) {
      // Wrong on a word at or above the mastery rung → de-master, reset to 0.
      newLevel = 0;
      masteredAtChange = null;
      deMastered = true;
    } else {
      newLevel = Math.max(0, word.level - 1);
    }

    const wordData: Record<string, unknown> = {
      attempts: { increment: 1 },
      correct: correct ? { increment: 1 } : undefined,
      level: newLevel,
    };
    if (masteredAtChange !== undefined) wordData.masteredAt = masteredAtChange;

    const [a, w] = await Promise.all([
      tx.attempt.create({
        data: {
          sessionId,
          wordId,
          typed,
          correct,
          retries: body.retries ?? 0,
          errorType: body.errorType ?? null,
        },
      }),
      tx.word.update({
        where: { id: wordId },
        data: wordData as never,
      }),
    ]);
    return [a, w, deMastered, newlyMastered, masteryThreshold] as const;
  });

  return NextResponse.json({
    id: attempt.id,
    wordLevel: updatedWord.level,
    leveledUp: correct,
    mastered: updatedWord.level >= masteryThreshold,
    newlyMastered,
    deMastered,
    masteredAt: updatedWord.masteredAt,
  });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    }
    throw e;
  }
}

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}