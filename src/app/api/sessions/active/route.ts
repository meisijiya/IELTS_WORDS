import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

export async function GET(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  const url = new URL(request.url);
  const wordbookId = Number(url.searchParams.get("wordbookId"));
  if (!Number.isInteger(wordbookId)) {
    return NextResponse.json({ error: "wordbookId required" }, { status: 400 });
  }

  const session = await prisma.session.findFirst({
    where: { userId: user.id, wordbookId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (!session) return NextResponse.json({ session: null });

  const liveCounts = await prisma.attempt.groupBy({
    by: ["correct"],
    where: { userId: user.id, sessionId: session.id },
    _count: { _all: true },
  });
  let liveCorrect = 0;
  let liveTotal = 0;
  for (const row of liveCounts) {
    liveTotal += row._count._all;
    if (row.correct) liveCorrect += row._count._all;
  }

  return NextResponse.json({
    session: {
      id: session.id,
      wordbookId: session.wordbookId,
      wordIds: session.wordIds ? JSON.parse(session.wordIds) : null,
      startedAt: session.startedAt.toISOString(),
      totalWords: liveTotal || session.totalWords,
      correctCount: liveCorrect || session.correctCount,
    },
  });
}
