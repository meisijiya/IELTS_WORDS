import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseWordIds } from "@/lib/duel";
import { DuelRoomClient } from "./duel-client";

export const dynamic = "force-dynamic";

export default async function DuelRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/duel/${id}`);

  const duel = await prisma.duel.findUnique({
    where: { id },
    include: {
      challenger: { select: { id: true, username: true } },
      opponent: { select: { id: true, username: true } },
      wordbook: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!duel) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">单挑不存在</h1>
        <Link href="/duel" className="text-accent underline">返回单挑列表</Link>
      </div>
    );
  }

  const isParticipant = duel.challengerId === user.id || duel.opponentId === user.id;
  if (!isParticipant) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">你不是该对局的参与者</h1>
        <Link href="/duel" className="text-accent underline">返回单挑列表</Link>
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
