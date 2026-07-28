import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const data = await getLeaderboard(me.id);
  return NextResponse.json(data);
}
