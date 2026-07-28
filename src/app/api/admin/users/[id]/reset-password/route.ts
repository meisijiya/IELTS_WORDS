import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";
import { hashPassword } from "@/lib/password";

const MIN_PASSWORD_LEN = 6;

const RESET_CONFIRM_PHRASE = "RESET PASSWORD";

function parseBody(raw: string): { confirm?: unknown; newPassword?: unknown } {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as { confirm?: unknown; newPassword?: unknown })
      : {};
  } catch {
    return {};
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let me;
  try {
    me = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }
  if (me.role !== "admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const targetId = Number(rawId);
  if (!Number.isInteger(targetId) || targetId < 1) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const body = parseBody(await request.text());
  if (body.confirm !== RESET_CONFIRM_PHRASE) {
    return NextResponse.json({ error: "CONFIRM_REQUIRED" }, { status: 400 });
  }

  if (
    typeof body.newPassword !== "string" ||
    body.newPassword.length < MIN_PASSWORD_LEN
  ) {
    return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, username: true },
  });
  if (!target) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const passwordHash = await hashPassword(body.newPassword);
  await prisma.user.update({
    where: { id: targetId },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true, userId: targetId, username: target.username });
}