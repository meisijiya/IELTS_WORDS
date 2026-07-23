import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

const DEFAULT_TTL_DAYS = 7;
const MAX_TTL_DAYS = 30;
const CODE_BYTES = 9;

function generateCode(): string {
  // 9 random bytes → 12 url-safe base64 chars; ambiguous chars trimmed.
  return randomBytes(CODE_BYTES)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function GET() {
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

  const [invitations, users] = await Promise.all([
    prisma.invitation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        inviter: { select: { id: true, username: true } },
        invitee: { select: { id: true, username: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, role: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    invitations: invitations.map((i) => ({
      id: i.id,
      code: i.code,
      inviter: i.inviter,
      invitee: i.invitee,
      expiresAt: i.expiresAt.toISOString(),
      usedAt: i.usedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    })),
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
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

  let body: { ttlDays?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ttlDays = Math.max(
    1,
    Math.min(MAX_TTL_DAYS, Math.floor(Number(body.ttlDays) || DEFAULT_TTL_DAYS)),
  );
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  // Generate a code; retry on the astronomically-rare collision.
  let invitation;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      invitation = await prisma.invitation.create({
        data: {
          id: randomBytes(16).toString("hex"),
          code,
          inviterId: user.id,
          expiresAt,
        },
      });
      break;
    } catch (e: unknown) {
      // Unique-constraint violation on `code` — retry.
      if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
        continue;
      }
      throw e;
    }
  }
  if (!invitation) {
    return NextResponse.json({ error: "CODE_GENERATION_FAILED" }, { status: 500 });
  }

  return NextResponse.json({
    id: invitation.id,
    code: invitation.code,
    expiresAt: invitation.expiresAt.toISOString(),
  });
}

export async function DELETE(request: Request) {
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

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Cannot delete an already-used invitation: it represents a real user.
  const existing = await prisma.invitation.findUnique({ where: { id: body.id } });
  if (!existing) {
    return NextResponse.json({ error: "INVITATION_NOT_FOUND" }, { status: 404 });
  }
  if (existing.usedAt) {
    return NextResponse.json({ error: "INVITATION_ALREADY_USED" }, { status: 400 });
  }

  await prisma.invitation.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
