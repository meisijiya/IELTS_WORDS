import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

const MASTERY_THRESHOLD_FALLBACK = 5;

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
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
    const [attempt, updatedUserWord, deMastered, newlyMastered, masteryThreshold] = await prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        select: { mode: true, userId: true },
      });
      if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Session 不存在");
      if (session.userId !== user.id) throw new ApiError(403, "FORBIDDEN_SESSION", "无权操作此会话");

      const userWord = await tx.userWord.findUnique({
        where: { userId_wordId: { userId: user.id, wordId } },
        select: { level: true, masteredAt: true },
      });
      const currentLevel = userWord?.level ?? 0;
      const currentMasteredAt = userWord?.masteredAt ?? null;

      const settings = await tx.userSettings.findUnique({
        where: { userId: user.id },
        select: { masteryThreshold: true },
      });
      const masteryThreshold = settings?.masteryThreshold ?? MASTERY_THRESHOLD_FALLBACK;

      // Review mode (错题批量练习): only log the attempt, never mutate Word state.
      // Drill mode (默认): full SM-2 ladder / mastery promotion logic.
      if (session.mode === "review") {
        const a = await tx.attempt.create({
          data: {
            sessionId,
            userId: user.id,
            wordId,
            typed,
            correct,
            retries: body.retries ?? 0,
            errorType: body.errorType ?? null,
          },
        });
        return [
          a,
          { level: currentLevel, masteredAt: currentMasteredAt } as { level: number; masteredAt: Date | null },
          false,
          false,
          masteryThreshold,
        ] as const;
      }

      let newLevel: number;
      let masteredAtChange: Date | null | undefined = undefined;
      let deMastered = false;
      let newlyMastered = false;

      if (correct) {
        newLevel = Math.min(masteryThreshold, currentLevel + 1);
        if (newLevel === masteryThreshold && !currentMasteredAt) {
          masteredAtChange = new Date();
          newlyMastered = true;
        }
      } else if (currentLevel >= masteryThreshold) {
        newLevel = 0;
        masteredAtChange = null;
        deMastered = true;
      } else {
        newLevel = Math.max(0, currentLevel - 1);
      }

      const userWordData: Record<string, unknown> = {
        level: newLevel,
        attempts: { increment: 1 },
        correct: correct ? { increment: 1 } : undefined,
      };
      if (masteredAtChange !== undefined) userWordData.masteredAt = masteredAtChange;

      const [a, uw] = await Promise.all([
        tx.attempt.create({
          data: {
            sessionId,
            userId: user.id,
            wordId,
            typed,
            correct,
            retries: body.retries ?? 0,
            errorType: body.errorType ?? null,
          },
        }),
        tx.userWord.upsert({
          where: { userId_wordId: { userId: user.id, wordId } },
          update: userWordData as never,
          create: {
            userId: user.id,
            wordId,
            level: newLevel,
            attempts: 1,
            correct: correct ? 1 : 0,
            masteredAt: masteredAtChange ?? null,
            firstAttemptedAt: new Date(),
          },
        }),
      ]);
      return [a, { level: uw.level, masteredAt: uw.masteredAt }, deMastered, newlyMastered, masteryThreshold] as const;
    });

    return NextResponse.json({
      id: attempt.id,
      wordLevel: updatedUserWord.level,
      leveledUp: correct,
      mastered: updatedUserWord.level >= masteryThreshold,
      newlyMastered,
      deMastered,
      masteredAt: updatedUserWord.masteredAt,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    }
    throw e;
  }
}
