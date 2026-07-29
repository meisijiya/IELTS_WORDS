import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseWordIds } from "@/lib/duel";
import { DuelRoomClient } from "./duel-client";

export const dynamic = "force-dynamic";

const duelInclude = {
  challenger: { select: { id: true, username: true } },
  opponent: { select: { id: true, username: true } },
  wordbook: { select: { id: true, name: true, slug: true } },
} as const;

export default async function DuelRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/duel/${id}`);

  const initial = await prisma.duel.findUnique({
    where: { id },
    include: duelInclude,
  });
  if (!initial) notFound();

  let duel = initial;
  const isParticipant =
    duel.challengerId === user.id || duel.opponentId === user.id;
  if (
    !isParticipant &&
    duel.status === "pending" &&
    duel.opponentId === null &&
    duel.challengerId !== user.id
  ) {
    const { count } = await prisma.duel.updateMany({
      where: {
        id,
        opponentId: null,
        status: "pending",
        challengerId: { not: user.id },
      },
      data: { opponentId: user.id, status: "ready" },
    });
    if (count > 0) {
      const refreshed = await prisma.duel.findUnique({
        where: { id },
        include: duelInclude,
      });
      if (refreshed) duel = refreshed;
    }
  }

  const finalIsParticipant =
    duel.challengerId === user.id || duel.opponentId === user.id;
  if (!finalIsParticipant) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">该邀请已被接受</h1>
        <p className="text-muted-foreground">
          {initial.opponent
            ? `对手 ${initial.opponent.username} 已经在等你。`
            : "这场对战已开始或已结束。"}
          {" "}邀请码只有一次有效机会。
        </p>
        <div className="flex gap-3 text-sm">
          <Link href="/duel" className="text-accent underline">回到单挑列表</Link>
          <Link href="/" className="text-muted-foreground underline">返回主页</Link>
        </div>
      </div>
    );
  }

  return (
    <DuelRoomClient
      duelId={duel.id}
      myUserId={user.id}
      myUsername={user.username}
      initialMode={duel.mode as "1" | "2"}
      initialStatus={duel.status as "pending" | "ready" | "active" | "finished" | "forfeited"}
      wordbookName={duel.wordbook.name}
      challengerName={duel.challenger.username}
      opponentName={duel.opponent?.username ?? null}
      isChallenger={duel.challengerId === user.id}
      initialWordIds={parseWordIds(duel.wordIds)}
    />
  );
}
