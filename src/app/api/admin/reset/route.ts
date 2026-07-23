import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";
import { snapshotAllDatesWithAttempts } from "@/lib/checkin-snapshot";

type Scope = "all" | "progress" | "attempts" | "sessions";

const CONFIRM_PHRASES: Record<Scope, string> = {
  progress: "RESET PROGRESS",
  attempts: "DELETE ATTEMPTS",
  sessions: "DELETE SESSIONS",
  all:      "RESET EVERYTHING",
};

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  let body: { scope?: Scope; confirm?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const scope: Scope = body.scope ?? "progress";
  const expected = CONFIRM_PHRASES[scope];

  if (body.confirm !== expected) {
    return NextResponse.json(
      {
        error: "CONFIRM_REQUIRED",
        scope,
        expectedPhrase: expected,
        message: `Reset '${scope}' requires body.confirm === "${expected}"`,
      },
      { status: 400 },
    );
  }

  if (scope === "attempts") {
    await snapshotAllDatesWithAttempts(user.id);
    await prisma.attempt.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ ok: true, scope });
  }

  if (scope === "sessions") {
    await snapshotAllDatesWithAttempts(user.id);
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.attempt.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ ok: true, scope });
  }

  if (scope === "all") {
    await snapshotAllDatesWithAttempts(user.id);
    await prisma.attempt.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.userWord.updateMany({
      where: { userId: user.id, OR: [{ attempts: { gt: 0 } }, { correct: { gt: 0 } }, { level: { gt: 0 } }, { masteredAt: { not: null } }] },
      data: { level: 0, interval: 0, dueAt: null, attempts: 0, correct: 0, masteredAt: null },
    });
    return NextResponse.json({ ok: true, scope: "all" });
  }

  // scope === "progress"
  await snapshotAllDatesWithAttempts(user.id);
  await prisma.attempt.deleteMany({ where: { userId: user.id } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.userWord.updateMany({
    where: { userId: user.id, OR: [{ attempts: { gt: 0 } }, { correct: { gt: 0 } }, { level: { gt: 0 } }, { masteredAt: { not: null } }] },
    data: { level: 0, interval: 0, dueAt: null, attempts: 0, correct: 0, masteredAt: null },
  });
  return NextResponse.json({ ok: true, scope: "progress" });
}
