import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

export async function DELETE(
  _request: Request,
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

  const session = await prisma.session.findUnique({ where: { id }, select: { userId: true, endedAt: true } });
  if (!session || session.userId !== user.id) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (session.endedAt) {
    return NextResponse.json({ ok: true, alreadyEnded: true });
  }

  await prisma.session.update({
    where: { id },
    data: { endedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
