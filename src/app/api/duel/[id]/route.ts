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

  const duel = await prisma.duel.findUnique({ where: { id } });
  if (!duel) {
    return NextResponse.json({ error: "DUEL_NOT_FOUND" }, { status: 404 });
  }

  // Only the challenger can cancel. Opponent can't kill a challenge that
  // is waiting for them — they have to either join or wait for the 7-day
  // expiry (cleanup is not implemented yet).
  if (duel.challengerId !== user.id) {
    return NextResponse.json(
      { error: "Only the challenger can cancel the duel", code: "NOT_CHALLENGER" },
      { status: 403 },
    );
  }

  // Only cancellable in pre-active states. Once both sides joined and the
  // duel is active, use /finish (with computeWinner) for fairness.
  if (duel.status !== "pending" && duel.status !== "ready") {
    return NextResponse.json(
      {
        error: `Cannot cancel a duel in '${duel.status}' state — finish it instead`,
        code: "DUEL_NOT_CANCELLABLE",
      },
      { status: 409 },
    );
  }

  await prisma.duel.delete({ where: { id } });
  return NextResponse.json({ ok: true, id });
}
