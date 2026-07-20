import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { id } = await params;

  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) {
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