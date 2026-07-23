import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

function normalizeUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export async function PUT(
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
  if (user.role !== "admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const targetId = Number(rawId);
  if (!Number.isInteger(targetId) || targetId < 1) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  let body: { username?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const username = normalizeUsername(body.username);
  if (!/^[a-zA-Z0-9_]+$/.test(username) || username.length < 3 || username.length > 32) {
    return NextResponse.json({ error: "用户名需 3-32 字符，仅字母/数字/下划线" }, { status: 400 });
  }

  const collision = await prisma.user.findUnique({ where: { username } });
  if (collision && collision.id !== targetId) {
    return NextResponse.json({ error: "该用户名已被占用" }, { status: 409 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { username },
    select: { id: true, username: true, role: true },
  });

  return NextResponse.json({ id: updated.id, username: updated.username, role: updated.role });
}
