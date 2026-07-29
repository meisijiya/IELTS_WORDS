import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

/**
 * DELETE /api/duel/[id]
 *
 * Behavior matrix:
 *
 * | Duel status | Caller role        | Effect                                          |
 * |-------------|--------------------|-------------------------------------------------|
 * | pending     | challenger only    | Hard delete (no opponent yet, no history)       |
 * | ready       | challenger only    | Hard delete (opponent never submitted answers)  |
 * | pending     | opponent           | 403 — opponent can't cancel a pending duel     |
 * | active / finished / forfeited | either side | Soft delete (set this side's hiddenAt)         |
 *                                     | both hiddenAt set | Hard delete + cascade DuelAnswer rows    |
 *
 * Rationale: only the challenger should be able to abort a duel the
 * opponent hasn't joined yet (cancel UI is challenger-only in the list).
 * Once both sides have participated, deletion is a personal hygiene
 * action — each side sets their own hidden flag. When BOTH sides have
 * hidden the row, it falls out of every list and we hard-delete it.
 */
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

  const isChallenger = duel.challengerId === user.id;
  const isOpponent = duel.opponentId === user.id;
  if (!isChallenger && !isOpponent) {
    return NextResponse.json(
      { error: "Not a participant", code: "NOT_PARTICIPANT" },
      { status: 403 }
    );
  }

  // Pre-active states: challenger-only hard cancel.
  if (duel.status === "pending" || duel.status === "ready") {
    if (!isChallenger) {
      return NextResponse.json(
        { error: "Only the challenger can cancel a pending duel", code: "NOT_CHALLENGER" },
        { status: 403 },
      );
    }
    // Cascade removes DuelAnswer rows too (DuelAnswer.duel onDelete: Cascade).
    await prisma.duel.delete({ where: { id } });
    return NextResponse.json({ ok: true, id, hard: true });
  }

  // From here on, the duel has finished/forfeited (or is still active).
  // Either participant may soft-delete from their view.
  const hiddenField = isChallenger ? "challengerHiddenAt" : "opponentHiddenAt";
  const otherHiddenField = isChallenger ? "opponentHiddenAt" : "challengerHiddenAt";

  const updated = await prisma.duel.update({
    where: { id },
    data: { [hiddenField]: new Date() },
  });

  // If the OTHER side already soft-deleted, the row is now orphaned —
  // hard-delete it (and its answers via cascade).
  if (updated[otherHiddenField] !== null) {
    await prisma.duel.delete({ where: { id } });
    return NextResponse.json({ ok: true, id, hard: true });
  }

  return NextResponse.json({ ok: true, id, hard: false });
}