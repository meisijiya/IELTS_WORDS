import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

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

  if (duel.challengerId === user.id) {
    return NextResponse.json(
      { error: "Cannot join your own duel", code: "DUEL_NOT_JOINABLE" },
      { status: 409 }
    );
  }

  if (duel.opponentId != null) {
    return NextResponse.json(
      { error: "Duel already has an opponent", code: "DUEL_NOT_JOINABLE" },
      { status: 409 }
    );
  }

  if (duel.status !== "pending") {
    return NextResponse.json(
      { error: "Duel is not joinable", code: "DUEL_NOT_JOINABLE" },
      { status: 409 }
    );
  }

  const updated = await prisma.duel.update({
    where: { id },
    data: { opponentId: user.id, status: "ready" },
  });

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    startedAt: updated.startedAt?.toISOString() ?? null,
    finishedAt: updated.finishedAt?.toISOString() ?? null,
    challengerLastSeenAt: updated.challengerLastSeenAt?.toISOString() ?? null,
    opponentLastSeenAt: updated.opponentLastSeenAt?.toISOString() ?? null,
    currentRoundStartedAt: updated.currentRoundStartedAt?.toISOString() ?? null,
  });
}
