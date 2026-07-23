import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

const CONFIRM_PHRASE = "CLEAN ALL CHECKINS";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  let body: { confirm?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      {
        error: "CONFIRM_REQUIRED",
        expectedPhrase: CONFIRM_PHRASE,
        message: `Reset requires body.confirm === "${CONFIRM_PHRASE}"`,
      },
      { status: 400 },
    );
  }

  // ponytail: scoped to current user. Self-service reset only.
  // Attempts / sessions / UserWord rows are left intact so skill progress
  // is preserved; only the per-date Checkin aggregates are wiped.
  const result = await prisma.checkin.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true, deleted: result.count });
}
