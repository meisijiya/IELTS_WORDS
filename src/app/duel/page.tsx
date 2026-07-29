import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DuelListClient, type DuelListItem } from "./page-client";

export const dynamic = "force-dynamic";

export default async function DuelPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/duel");

  const [duels, wordbooks] = await Promise.all([
    prisma.duel.findMany({
      where: {
        OR: [{ challengerId: user.id }, { opponentId: user.id }],
        // ponytail: filter my-side soft-deletes (challenger-side if I'm challenger, etc).
        NOT: [
          { challengerId: user.id, challengerHiddenAt: { not: null } },
          { opponentId: user.id, opponentHiddenAt: { not: null } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        wordbook: { select: { id: true, name: true, slug: true } },
        challenger: { select: { id: true, username: true } },
        opponent: { select: { id: true, username: true } },
      },
    }),
    prisma.wordbook.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const items: DuelListItem[] = duels.map((d) => ({
    id: d.id,
    mode: d.mode as "1" | "2",
    status: d.status as DuelListItem["status"],
    wordbook: d.wordbook,
    challenger: d.challenger,
    opponent: d.opponent,
    durationSec: d.durationSec,
    roundCount: d.roundCount,
    createdAt: d.createdAt.toISOString(),
    startedAt: d.startedAt?.toISOString() ?? null,
    finishedAt: d.finishedAt?.toISOString() ?? null,
    winnerId: d.winnerId,
    myRole: (d.challengerId === user.id ? "challenger" : "opponent") as
      | "challenger"
      | "opponent",
  }));

  return (
    <DuelListClient
      currentUser={{ id: user.id, username: user.username }}
      wordbooks={wordbooks}
      duels={items}
    />
  );
}