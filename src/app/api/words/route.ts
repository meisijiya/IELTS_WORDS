import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

const MAX_LIMIT = 200;
const RANDOM_HARD_CAP = 20;
const MASTERY_THRESHOLD_FALLBACK = 5;
const SETTINGS_SINGLETON_ID = 1;

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

type PullMode = "review" | "balanced" | "new";
type Pool = "new" | "learned" | "mastered";

const PULL_CONFIG: Record<PullMode, {
  ratio: [number, number, number]; // [new, learned, mastered]
  fallback: [Pool, Pool, Pool];
}> = {
  // "速通雅思"：复习优先（默认）。熟悉 + 已熟练为主，新词保持供血
  review:   { ratio: [4, 8, 8],  fallback: ["mastered", "learned", "new"] },
  // 平衡：跟以前一样的 14/5/1
  balanced: { ratio: [14, 5, 1], fallback: ["new", "learned", "mastered"] },
  // 新词优先：扩张为主
  new:      { ratio: [18, 2, 0], fallback: ["new", "learned", "mastered"] },
};

function normalizePullMode(value: unknown): PullMode {
  return value === "review" || value === "balanced" || value === "new"
    ? value
    : "review";
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
  // priority=review|balanced|new — overrides the default ratio + fallback order
  const priority = normalizePullMode(url.searchParams.get("priority"));

  if (!Number.isInteger(wordbookId) || wordbookId < 1) {
    return NextResponse.json({ error: "wordbookId required" }, { status: 400 });
  }

  const settings = await prisma.userSettings.findUnique({
    where: { id: SETTINGS_SINGLETON_ID },
    select: { masteryThreshold: true },
  });
  const masteryThreshold = settings?.masteryThreshold ?? MASTERY_THRESHOLD_FALLBACK;

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
        where: { wordbookId, level: { lt: masteryThreshold }, attempts: 0 },
        select: { id: true },
      }),
      prisma.word.findMany({
        where: {
          wordbookId,
          level: { lt: masteryThreshold },
          attempts: { gt: 0 },
          masteredAt: null,
        },
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

    const poolMap: Record<Pool, { id: number }[]> = {
      new: newSet,
      learned: learnedSet,
      mastered: masteredSet,
    };
    const [newShare, learnedShare, masteredShare] = PULL_CONFIG[priority].ratio;

    for (const pool of ["new", "learned", "mastered"] as Pool[]) {
      const want = pool === "new" ? newShare : pool === "learned" ? learnedShare : masteredShare;
      const take = Math.min(want, poolMap[pool].length, N - ids.length);
      for (const id of pickIds(poolMap[pool], take)) {
        if (!used.has(id)) {
          ids.push(id);
          used.add(id);
        }
      }
    }
    if (ids.length < N) {
      const fallbackOrder = PULL_CONFIG[priority].fallback;
      const fallback: { id: number }[] = [];
      for (const pool of fallbackOrder) {
        fallback.push(...poolMap[pool].filter((w) => !used.has(w.id)));
      }
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
    const count = await prisma.word.count({
      where: { wordbookId, level: { lt: masteryThreshold } },
    });
    const take = Math.min(limit, count);
    if (take > 0) {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: number; spelling: string; pos: string | null; glosses: string;
          level: number; attempts: number; correct: number; masteredAt: Date | null;
        }>
      >(
        `SELECT id, spelling, pos, glosses, level, attempts, correct, masteredAt FROM Word
         WHERE wordbookId = ? AND level < ?
         ORDER BY RANDOM()
         LIMIT ?`,
        wordbookId,
        masteryThreshold,
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