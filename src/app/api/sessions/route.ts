import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

function sameIds(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    const aArr = JSON.parse(a) as number[];
    const bArr = JSON.parse(b) as number[];
    return JSON.stringify([...aArr].sort((x, y) => x - y)) ===
      JSON.stringify([...bArr].sort((x, y) => x - y));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  let body: { wordbookId?: number; wordIds?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const wordbookId = Number(body.wordbookId);
  if (!Number.isInteger(wordbookId)) {
    return NextResponse.json({ error: "wordbookId required" }, { status: 400 });
  }

  const wordIdsJson = body.wordIds && body.wordIds.length > 0 ? JSON.stringify(body.wordIds) : null;
  const isTargeted = wordIdsJson !== null;

  // Targeted sessions (错词批量练习) coexist with random sessions.
  // Conflict only when both are random, or both targeted with the SAME id set.
  const candidates = await prisma.session.findMany({
    where: { wordbookId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  const reusable = candidates.find((s) => sameIds(s.wordIds, wordIdsJson));
  if (reusable) {
    return NextResponse.json({ id: reusable.id, resumed: true });
  }

  // For a random session, refuse if any random (null-wordIds) active session exists.
  if (!isTargeted) {
    const randomActive = candidates.find((s) => s.wordIds === null);
    if (randomActive) {
      return NextResponse.json(
        {
          error: "EXISTING_RANDOM_SESSION",
          message: "已有随机模式未完成会话，请先在主页结束它",
          session: {
            id: randomActive.id,
            wordbookId: randomActive.wordbookId,
            wordIds: null,
            startedAt: randomActive.startedAt.toISOString(),
          },
        },
        { status: 409 }
      );
    }
  }

  const session = await prisma.session.create({
    data: {
      id: randomUUID(),
      wordbookId,
      wordIds: wordIdsJson,
    },
  });

  return NextResponse.json({ id: session.id, created: true });
}