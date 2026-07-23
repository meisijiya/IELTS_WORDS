import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";
import { LeaderboardClient } from "./leaderboard-client";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const data = await getLeaderboard(me.id);

  return (
    <main className="min-h-screen px-4 py-10 md:px-8 max-w-3xl mx-auto">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 inline-flex items-center gap-2">
            <Trophy className="h-7 w-7 text-accent" /> 排行榜
          </h1>
          <p className="text-sm text-muted-foreground">
            今日打卡量 + 累计已熟练（已掌握）词数 · 截至 {new Date(data.today).toLocaleString("zh-CN")}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-accent inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> 主页
        </Link>
      </header>
      <LeaderboardClient entries={data.entries} />
    </main>
  );
}
