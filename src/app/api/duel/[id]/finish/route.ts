import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";
import { computeWinner } from "@/lib/duel";

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
      { status: 403 }
    );
  }

  if (duel.status !== "active") {
    return NextResponse.json(
      { error: "Duel is already finished", code: "DUEL_FINISHED" },
      { status: 409 }
    );
  }

  const answers = await prisma.duelAnswer.findMany({ where: { duelId: id } });

  const winnerId = computeWinner(duel, answers);

  const updated = await prisma.duel.update({
    where: { id },
    data: { finishedAt: new Date(), winnerId, status: "finished" },
  });

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    startedAt: updated.startedAt?.toISOString() ?? null,
    finishedAt: updated.finishedAt?.toISOString() ?? null,
    challengerLastSeenAt: updated.challengerLastSeenAt?.toISOString() ?? null,
    opponentLastSeenAt: updated.opponentLastSeenAt?.toISOString() ?? null,
    currentRoundStartedAt: updated.currentRoundStartedAt?.toISOString() ?? null,
    winner: winnerId,
  });
}
