import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { id } = await params;
  let body: { endedAt?: string; totalWords?: number; correctCount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  await prisma.session.update({
    where: { id },
    data: {
      endedAt: body.endedAt ? new Date(body.endedAt) : new Date(),
      totalWords: body.totalWords ?? 0,
      correctCount: body.correctCount ?? 0,
    },
  });

  return NextResponse.json({ ok: true });
}