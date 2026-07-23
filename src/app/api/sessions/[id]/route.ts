import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  const { id } = await params;
  let body: { endedAt?: string; totalWords?: number; correctCount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const session = await prisma.session.findUnique({ where: { id }, select: { userId: true } });
  if (!session || session.userId !== user.id) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
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
