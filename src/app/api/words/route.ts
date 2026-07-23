import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

const MAX_LIMIT = 200;
const RANDOM_HARD_CAP = 20;
const MASTERY_THRESHOLD_FALLBACK = 5;

interface WordDto {
  id: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  level: number;
  attempts: number;
  correct: number;
  masteredAt: string | null;
  wordbookId: number;
}

type PullMode = "review" | "balanced" | "new";
type Pool = "new" | "learned" | "mastered";

const PULL_CONFIG: Record<PullMode, {
  ratio: [number, number, number];
  fallback: [Pool, Pool, Pool];
}> = {
  review:   { ratio: [4, 8, 8],  fallback: ["mastered", "learned", "new"] },
  balanced: { ratio: [14, 5, 1], fallback: ["new", "learned", "mastered"] },
  new:      { ratio: [18, 2, 0], fallback: ["new", "learned", "mastered"] },
};

function normalizePullMode(value: unknown): PullMode {
  return value === "review" || value === "balanced" || value === "new"
    ? value
    : "review";
}

function shuffle<T>(arr: readonly T[], seed?: number): T[] {
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
  wordbookId: number;
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
    wordbookId: w.wordbookId,
  };
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  const url = new URL(request.url);
  const wordbookId = Number(url.searchParams.get("wordbookId"));
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), MAX_LIMIT);
  const random = url.searchParams.get("random") === "true";
  const weighted = url.searchParams.get("weighted") !== "false" && random;
  const idsParam = url.searchParams.get("ids");
  const priority = normalizePullMode(url.searchParams.get("priority"));

  if (!Number.isInteger(wordbookId) || wordbookId < 1) {
    return NextResponse.json({ error: "wordbookId required" }, { status: 400 });
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
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
    // Merge with per-user state when present.
    const userWordRows = await prisma.userWord.findMany({
      where: { userId: user.id, wordId: { in: ids } },
    });
    const userWordMap = new Map(userWordRows.map((uw) => [uw.wordId, uw]));
    words = rows.map((r) => {
      const uw = userWordMap.get(r.id);
      return rowToDto({
        id: r.id,
        spelling: r.spelling,
        pos: r.pos,
        glosses: r.glosses,
        level: uw?.level ?? 0,
        attempts: uw?.attempts ?? 0,
        correct: uw?.correct ?? 0,
        masteredAt: uw?.masteredAt ?? null,
        wordbookId: r.wordbookId,
      });
    });
  } else if (random && weighted) {
    const N = Math.min(limit, RANDOM_HARD_CAP);
    // Identify the user's view of the wordbook: words the user has
    // ever attempted at all, classified by their SM-2 state.
    const allUserWordIds = await prisma.userWord.findMany({
      where: { userId: user.id, word: { wordbookId } },
      select: { wordId: true, level: true, attempts: true, correct: true, masteredAt: true },
    });
    const allWordIds = await prisma.word.findMany({
      where: { wordbookId },
      select: { id: true },
    });

    const userWordMap = new Map(allUserWordIds.map((uw) => [uw.wordId, uw]));
    const newSet: number[] = [];
    const learnedSet: number[] = [];
    const masteredSet: number[] = [];
    for (const w of allWordIds) {
      const uw = userWordMap.get(w.id);
      if (!uw || uw.attempts === 0) {
        newSet.push(w.id);
      } else if (uw.masteredAt || (uw.level ?? 0) >= masteryThreshold) {
        masteredSet.push(w.id);
      } else {
        learnedSet.push(w.id);
      }
    }

    const pickIds = (pool: number[], k: number): number[] => shuffle(pool).slice(0, k);
    const used = new Set<number>();
    const ids: number[] = [];

    const poolMap: Record<Pool, number[]> = {
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
      const fallback: number[] = [];
      for (const pool of fallbackOrder) {
        fallback.push(...poolMap[pool].filter((id) => !used.has(id)));
      }
      for (const id of shuffle(fallback)) {
        if (ids.length >= N) break;
        if (!used.has(id)) {
          ids.push(id);
          used.add(id);
        }
      }
    }

    if (ids.length === 0) {
      return NextResponse.json({ words: [] });
    }
    const rows = await prisma.word.findMany({
      where: { id: { in: ids }, wordbookId },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    words = ids
      .map((id) => byId.get(id))
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map((r) => {
        const uw = userWordMap.get(r.id);
        return rowToDto({
          id: r.id,
          spelling: r.spelling,
          pos: r.pos,
          glosses: r.glosses,
          level: uw?.level ?? 0,
          attempts: uw?.attempts ?? 0,
          correct: uw?.correct ?? 0,
          masteredAt: uw?.masteredAt ?? null,
          wordbookId: r.wordbookId,
        });
      });
  } else if (random) {
    // Pure random: only words the user hasn't mastered yet.
    const userWordRows = await prisma.userWord.findMany({
      where: { userId: user.id, word: { wordbookId }, masteredAt: null },
      select: { wordId: true, level: true, attempts: true, correct: true, masteredAt: true },
    });
    const eligibleIds = userWordRows
      .filter((uw) => (uw.level ?? 0) < masteryThreshold)
      .map((uw) => uw.wordId);
    // New users see no eligible rows (no UserWord yet). Fall back to the
    // first `limit` words from the wordbook so they get a queue.
    let takeIds: number[];
    if (eligibleIds.length === 0) {
      const firstRows = await prisma.word.findMany({
        where: { wordbookId },
        select: { id: true },
        take: limit,
      });
      takeIds = firstRows.map((r) => r.id);
    } else {
      takeIds = shuffle(eligibleIds).slice(0, limit);
    }
    if (takeIds.length === 0) return NextResponse.json({ words: [] });
    const rows = await prisma.word.findMany({
      where: { id: { in: takeIds }, wordbookId },
    });
    const userWordMap = new Map(userWordRows.map((uw) => [uw.wordId, uw]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    words = takeIds
      .map((id) => byId.get(id))
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map((r) => {
        const uw = userWordMap.get(r.id);
        return rowToDto({
          id: r.id,
          spelling: r.spelling,
          pos: r.pos,
          glosses: r.glosses,
          level: uw?.level ?? 0,
          attempts: uw?.attempts ?? 0,
          correct: uw?.correct ?? 0,
          masteredAt: uw?.masteredAt ?? null,
          wordbookId: r.wordbookId,
        });
      });
  } else {
    const rows = await prisma.word.findMany({
      where: { wordbookId },
      take: limit,
      orderBy: { id: "asc" },
    });
    const userWordRows = await prisma.userWord.findMany({
      where: { userId: user.id, wordId: { in: rows.map((r) => r.id) } },
    });
    const userWordMap = new Map(userWordRows.map((uw) => [uw.wordId, uw]));
    words = rows.map((r) => {
      const uw = userWordMap.get(r.id);
      return rowToDto({
        id: r.id,
        spelling: r.spelling,
        pos: r.pos,
        glosses: r.glosses,
        level: uw?.level ?? 0,
        attempts: uw?.attempts ?? 0,
        correct: uw?.correct ?? 0,
        masteredAt: uw?.masteredAt ?? null,
        wordbookId: r.wordbookId,
      });
    });
  }

  return NextResponse.json({ words });
}
