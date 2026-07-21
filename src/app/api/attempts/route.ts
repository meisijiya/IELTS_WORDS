import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

const MAX_LEVEL = 5;

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

  const [attempt, updatedWord, deMastered, newlyMastered] = await prisma.$transaction(async (tx) => {
    const word = await tx.word.findUnique({
      where: { id: wordId },
      select: { level: true, masteredAt: true },
    });
    if (!word) throw new Error(`word ${wordId} not found`);

    let newLevel: number;
    // undefined = leave masteredAt untouched; null/Date = explicit write
    let masteredAtChange: Date | null | undefined = undefined;
    let deMastered = false;
    let newlyMastered = false;

    if (correct) {
      newLevel = Math.min(MAX_LEVEL, word.level + 1);
      if (newLevel === MAX_LEVEL && !word.masteredAt) {
        masteredAtChange = new Date();
        newlyMastered = true;
      }
    } else if (word.level >= MAX_LEVEL) {
      // Wrong on a mastered word → de-master, reset to level 0
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
    return [a, w, deMastered, newlyMastered] as const;
  });

  return NextResponse.json({
    id: attempt.id,
    wordLevel: updatedWord.level,
    leveledUp: correct,
    mastered: updatedWord.level === MAX_LEVEL,
    newlyMastered,
    deMastered,
    masteredAt: updatedWord.masteredAt,
  });
}