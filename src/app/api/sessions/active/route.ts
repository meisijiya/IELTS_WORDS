import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const url = new URL(request.url);
  const wordbookId = Number(url.searchParams.get("wordbookId"));
  if (!Number.isInteger(wordbookId)) {
    return NextResponse.json({ error: "wordbookId required" }, { status: 400 });
  }

  const session = await prisma.session.findFirst({
    where: { wordbookId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (!session) return NextResponse.json({ session: null });

  const liveCounts = await prisma.attempt.groupBy({
    by: ["correct"],
    where: { sessionId: session.id },
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