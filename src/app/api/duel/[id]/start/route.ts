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

  if (duel.challengerId !== user.id && duel.opponentId !== user.id) {
    return NextResponse.json(
      { error: "Not a participant", code: "NOT_PARTICIPANT" },
      { status: 403 }
    );
  }

  if (duel.status !== "ready") {
    return NextResponse.json(
      { error: "Duel is not startable", code: "DUEL_NOT_STARTABLE" },
      { status: 409 }
    );
  }

  const data: Record<string, unknown> = {
    startedAt: new Date(),
    status: "active",
  };

  if (duel.mode === "2") {
    data.currentRoundIndex = 0;
    data.currentRoundStartedAt = new Date();
  }

  const updated = await prisma.duel.update({
    where: { id },
    data,
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
