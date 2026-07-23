import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

const RETENTION_MAX_DAYS = 3650;

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cutoffDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return fmtDate(d);
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  let body: { days?: number; confirm?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const days = Number(body.days);
  if (!Number.isFinite(days) || !Number.isInteger(days) || days < 1 || days > RETENTION_MAX_DAYS) {
    return NextResponse.json(
      { error: "INVALID_DAYS", message: `days must be an integer in [1, ${RETENTION_MAX_DAYS}]` },
      { status: 400 },
    );
  }

  const expected = `CLEAN ${days} DAYS`;
  if (body.confirm !== expected) {
    return NextResponse.json(
      { error: "CONFIRM_REQUIRED", expectedPhrase: expected, days },
      { status: 400 },
    );
  }

  const cutoff = cutoffDate(days);
  const result = await prisma.checkin.deleteMany({
    where: { userId: user.id, date: { lt: cutoff } },
  });

  return NextResponse.json({ ok: true, days, cutoff, deleted: result.count });
}
