import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";
import { snapshotAllDatesWithAttempts } from "@/lib/checkin-snapshot";

type Scope = "all" | "progress" | "attempts" | "sessions";

// Confirm phrases — must match exactly to prevent accidental triggers.
const CONFIRM_PHRASES: Record<Scope, string> = {
  progress: "RESET PROGRESS",
  attempts: "DELETE ATTEMPTS",
  sessions: "DELETE SESSIONS",
  all:      "RESET EVERYTHING",
};

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
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
    await snapshotAllDatesWithAttempts();
    await prisma.attempt.deleteMany({});
    return NextResponse.json({ ok: true, scope });
  }

  if (scope === "sessions") {
    await snapshotAllDatesWithAttempts();
    await prisma.session.deleteMany({});
    await prisma.attempt.deleteMany({});
    return NextResponse.json({ ok: true, scope });
  }

  if (scope === "all") {
    await snapshotAllDatesWithAttempts();
    await prisma.attempt.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.word.updateMany({
      data: { level: 0, interval: 0, dueAt: null, attempts: 0, correct: 0, masteredAt: null },
    });
    return NextResponse.json({ ok: true, scope: "all" });
  }

  // scope === "progress" — same effect as before but gated by phrase.
  await snapshotAllDatesWithAttempts();
  await prisma.attempt.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.word.updateMany({
    data: { level: 0, interval: 0, dueAt: null, attempts: 0, correct: 0, masteredAt: null },
  });
  return NextResponse.json({ ok: true, scope: "progress" });
}