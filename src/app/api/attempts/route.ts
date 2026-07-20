import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

const MAX_LEVEL = 5;

function nextLevel(current: number, correct: boolean): number {
  if (correct) return Math.min(MAX_LEVEL, current + 1);
  return Math.max(0, current - 1);
}

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

  const [attempt, updatedWord] = await prisma.$transaction(async (tx) => {
    const word = await tx.word.findUnique({
      where: { id: wordId },
      select: { level: true },
    });
    if (!word) throw new Error(`word ${wordId} not found`);

    const newLevel = nextLevel(word.level, correct);

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
        data: {
          attempts: { increment: 1 },
          correct: correct ? { increment: 1 } : undefined,
          level: newLevel,
        },
      }),
    ]);
    return [a, w];
  });

  return NextResponse.json({
    id: attempt.id,
    wordLevel: updatedWord.level,
    leveledUp: updatedWord.level !== undefined && correct,
    mastered: updatedWord.level === MAX_LEVEL,
  });
}