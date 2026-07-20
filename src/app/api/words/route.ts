import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

interface WordDto {
  id: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  level: number;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const url = new URL(request.url);
  const wordbookId = Number(url.searchParams.get("wordbookId"));
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 200);
  const random = url.searchParams.get("random") === "true";
  const idsParam = url.searchParams.get("ids");

  if (!Number.isInteger(wordbookId) || wordbookId < 1) {
    return NextResponse.json({ error: "wordbookId required" }, { status: 400 });
  }

  let rows;
  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return NextResponse.json({ words: [] });
    rows = await prisma.word.findMany({
      where: { id: { in: ids }, wordbookId },
    });
  } else if (random) {
    const count = await prisma.word.count({ where: { wordbookId, level: { lt: 5 } } });
    const take = Math.min(limit, count);
    if (take === 0) {
      return NextResponse.json({ words: [] });
    }
    rows = await prisma.$queryRawUnsafe<
      Array<{ id: number; spelling: string; pos: string | null; glosses: string; level: number }>
    >(
      `SELECT id, spelling, pos, glosses, level FROM Word
       WHERE wordbookId = ? AND level < 5
       ORDER BY RANDOM()
       LIMIT ?`,
      wordbookId,
      take
    );
  } else {
    rows = await prisma.word.findMany({
      where: { wordbookId },
      take: limit,
      orderBy: { id: "asc" },
    });
  }

  const words: WordDto[] = rows.map((w) => ({
    id: w.id,
    spelling: w.spelling,
    pos: w.pos,
    glosses: JSON.parse(w.glosses),
    level: w.level,
  }));

  return NextResponse.json({ words });
}