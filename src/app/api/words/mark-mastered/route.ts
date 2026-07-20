import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  let body: { wordId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const wordId = Number(body.wordId);
  if (!Number.isInteger(wordId) || wordId < 1) {
    return NextResponse.json({ error: "wordId required" }, { status: 400 });
  }

  await prisma.word.update({
    where: { id: wordId },
    data: { level: 5, interval: 30, dueAt: null, attempts: 0, correct: 0 },
  });

  return NextResponse.json({ ok: true });
}