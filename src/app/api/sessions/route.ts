import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

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
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  let body: { wordbookId?: number; wordIds?: number[]; mode?: string };
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
  const mode = body.mode === "review" ? "review" : "drill";

  const candidates = await prisma.session.findMany({
    where: { userId: user.id, wordbookId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  const reusable = candidates.find((s) => sameIds(s.wordIds, wordIdsJson));
  if (reusable) {
    return NextResponse.json({ id: reusable.id, resumed: true });
  }

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
      userId: user.id,
      wordbookId,
      wordIds: wordIdsJson,
      mode,
    },
  });

  return NextResponse.json({ id: session.id, mode, created: true });
}
