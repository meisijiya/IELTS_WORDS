import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

const MAX_LIMIT = 200;
const RANDOM_HARD_CAP = 20;

interface WordDto {
  id: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  level: number;
  attempts: number;
  correct: number;
  masteredAt: string | null;
}

function shuffle<T>(arr: readonly T[], seed?: number): T[] {
  // Fisher–Yates with optional deterministic seed for tests.
  const out = [...arr];
  const rand = seed === undefined ? Math.random : mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rowToDto(w: {
  id: number;
  spelling: string;
  pos: string | null;
  glosses: string;
  level: number;
  attempts: number;
  correct: number;
  masteredAt: Date | null;
}): WordDto {
  return {
    id: w.id,
    spelling: w.spelling,
    pos: w.pos,
    glosses: JSON.parse(w.glosses),
    level: w.level,
    attempts: w.attempts,
    correct: w.correct,
    masteredAt: w.masteredAt ? w.masteredAt.toISOString() : null,
  };
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const url = new URL(request.url);
  const wordbookId = Number(url.searchParams.get("wordbookId"));
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), MAX_LIMIT);
  const random = url.searchParams.get("random") === "true";
  // weighted=true: 14 new + 5 learned + 1 mastered, fall-back fills with anything
  const weighted = url.searchParams.get("weighted") !== "false" && random;
  const idsParam = url.searchParams.get("ids");

  if (!Number.isInteger(wordbookId) || wordbookId < 1) {
    return NextResponse.json({ error: "wordbookId required" }, { status: 400 });
  }

  let words: WordDto[] = [];

  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return NextResponse.json({ words: [] });
    const rows = await prisma.word.findMany({
      where: { id: { in: ids }, wordbookId },
    });
    words = rows.map(rowToDto);
  } else if (random && weighted) {
    const N = Math.min(limit, RANDOM_HARD_CAP);
    const [newSet, learnedSet, masteredSet] = await Promise.all([
      prisma.word.findMany({
        where: { wordbookId, level: { lt: 5 }, attempts: 0 },
        select: { id: true },
      }),
      prisma.word.findMany({
        where: { wordbookId, level: { lt: 5 }, attempts: { gt: 0 }, masteredAt: null },
        select: { id: true },
      }),
      prisma.word.findMany({
        where: { wordbookId, masteredAt: { not: null } },
        select: { id: true },
      }),
    ]);

    const pickIds = (pool: { id: number }[], k: number): number[] =>
      shuffle(pool).slice(0, k).map((w) => w.id);
    const used = new Set<number>();
    const ids: number[] = [];

    const newTake = Math.min(14, newSet.length);
    for (const id of pickIds(newSet, newTake)) {
      ids.push(id);
      used.add(id);
    }
    const learnedTake = Math.min(5, learnedSet.length, N - ids.length);
    for (const id of pickIds(learnedSet, learnedTake)) {
      if (!used.has(id)) {
        ids.push(id);
        used.add(id);
      }
    }
    const masteredTake = Math.min(1, masteredSet.length, N - ids.length);
    for (const id of pickIds(masteredSet, masteredTake)) {
      if (!used.has(id)) {
        ids.push(id);
        used.add(id);
      }
    }
    // Fill the rest from anything still available, in priority: new > learned > mastered
    if (ids.length < N) {
      const fallback = [
        ...newSet.filter((w) => !used.has(w.id)),
        ...learnedSet.filter((w) => !used.has(w.id)),
        ...masteredSet.filter((w) => !used.has(w.id)),
      ];
      for (const w of shuffle(fallback)) {
        if (ids.length >= N) break;
        if (!used.has(w.id)) {
          ids.push(w.id);
          used.add(w.id);
        }
      }
    }

    if (ids.length === 0) {
      return NextResponse.json({ words: [] });
    }
    const rows = await prisma.word.findMany({
      where: { id: { in: ids }, wordbookId },
    });
    // Restore random order from `ids` (findMany doesn't preserve order)
    const byId = new Map(rows.map((r) => [r.id, r]));
    words = ids.map((id) => byId.get(id)).filter((w): w is NonNullable<typeof w> => !!w).map(rowToDto);
  } else if (random) {
    // Pure random fallback (weighted=false)
    const count = await prisma.word.count({ where: { wordbookId, level: { lt: 5 } } });
    const take = Math.min(limit, count);
    if (take > 0) {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: number; spelling: string; pos: string | null; glosses: string;
          level: number; attempts: number; correct: number; masteredAt: Date | null;
        }>
      >(
        `SELECT id, spelling, pos, glosses, level, attempts, correct, masteredAt FROM Word
         WHERE wordbookId = ? AND level < 5
         ORDER BY RANDOM()
         LIMIT ?`,
        wordbookId,
        take
      );
      words = (rows as unknown as Parameters<typeof rowToDto>[0][]).map(rowToDto);
    }
  } else {
    const rows = await prisma.word.findMany({
      where: { wordbookId },
      take: limit,
      orderBy: { id: "asc" },
    });
    words = rows.map(rowToDto);
  }

  return NextResponse.json({ words });
}