import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";
import { DUEL_MODE_ROUND } from "@/lib/duel";

export async function POST(
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

  const duel = await prisma.duel.findUnique({ where: { id } });
  if (!duel) {
    return NextResponse.json({ error: "duel not found" }, { status: 404 });
  }

  if (duel.challengerId !== user.id && duel.opponentId !== user.id) {
    return NextResponse.json(
      { error: "Not a participant", code: "NOT_PARTICIPANT" },
      { status: 403 },
    );
  }

  // Only callable in the "ready" hand-shake phase. If the duel is already
  // active / finished, starting makes no sense — finish it instead.
  if (duel.status !== "ready") {
    return NextResponse.json(
      { error: `Cannot start from '${duel.status}'`, code: "DUEL_NOT_STARTABLE" },
      { status: 409 },
    );
  }

  const isChallenger = duel.challengerId === user.id;
  const readyField = isChallenger ? "challengerReadyAt" : "opponentReadyAt";

  // Mark this side as ready (idempotent — repeated POSTs are no-ops).
  await prisma.duel.update({
    where: { id },
    data: { [readyField]: new Date() },
  });

  // Re-read to see if both sides are now ready.
  const refreshed = await prisma.duel.findUnique({ where: { id } });
  if (!refreshed) {
    return NextResponse.json({ error: "duel vanished" }, { status: 500 });
  }

  const bothReady =
    refreshed.challengerReadyAt !== null && refreshed.opponentReadyAt !== null;

  if (bothReady) {
    // Transition to active. Mode 2 needs a fresh round anchor.
    const data: Record<string, unknown> = {
      status: "active",
      startedAt: new Date(),
    };
    if (refreshed.mode === DUEL_MODE_ROUND) {
      data.currentRoundIndex = 0;
      data.currentRoundStartedAt = new Date();
    }
    await prisma.duel.update({ where: { id }, data });
    return NextResponse.json({ ok: true, transitioned: true });
  }

  return NextResponse.json({ ok: true, transitioned: false });
}

// Rescind my readiness. Only valid while the duel is still in "ready"
// AND has not yet transitioned to active. Once both sides hit ready and
// the duel goes active, this is a no-op (early return).
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

  const duel = await prisma.duel.findUnique({ where: { id } });
  if (!duel) {
    return NextResponse.json({ error: "duel not found" }, { status: 404 });
  }

  if (duel.challengerId !== user.id && duel.opponentId !== user.id) {
    return NextResponse.json(
      { error: "Not a participant", code: "NOT_PARTICIPANT" },
      { status: 403 },
    );
  }

  // If both sides already ready and the duel is active, can no longer rescind.
  if (duel.status !== "ready") {
    return NextResponse.json({ ok: true, noop: true });
  }

  const isChallenger = duel.challengerId === user.id;
  const readyField = isChallenger ? "challengerReadyAt" : "opponentReadyAt";
  await prisma.duel.update({ where: { id }, data: { [readyField]: null } });
  return NextResponse.json({ ok: true });
}
