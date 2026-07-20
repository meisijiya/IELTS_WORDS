import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

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

  const active = await prisma.session.findFirst({
    where: { wordbookId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (active) {
    if (active.wordIds === wordIdsJson) {
      return NextResponse.json({ id: active.id, resumed: true });
    }
    return NextResponse.json(
      {
        error: "EXISTING_ACTIVE_SESSION",
        message: "已有未完成会话，请先在主页结束它",
        session: {
          id: active.id,
          wordbookId: active.wordbookId,
          wordIds: active.wordIds ? JSON.parse(active.wordIds) : null,
          startedAt: active.startedAt.toISOString(),
        },
      },
      { status: 409 }
    );
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