import { describe, expect, it } from "vitest";
import {
  checkSpelling,
  parseWordIds,
  isMode1TimeUp,
  timeLeftSecMode1,
  isMode2RoundTimedOut,
  isMode2Complete,
  computeRoundWinner,
  computeWinner,
  checkForfeit,
  type DuelRow,
  type DuelAnswerRow,
} from "./duel";

function makeDuel(overrides: Partial<DuelRow> = {}): DuelRow {
  return {
    id: "duel-1",
    mode: "1",
    status: "active",
    wordbookId: 1,
    durationSec: 60,
    roundCount: 20,
    wordIds: "[1,2,3,4,5]",
    challengerId: 100,
    opponentId: 200,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    startedAt: new Date("2026-01-01T00:00:00Z"),
    finishedAt: null,
    winnerId: null,
    forfeitById: null,
    challengerLastSeenAt: new Date("2026-01-01T00:00:00Z"),
    opponentLastSeenAt: new Date("2026-01-01T00:00:00Z"),
    currentRoundIndex: null,
    currentRoundStartedAt: null,
    ...overrides,
  };
}

function makeAnswer(overrides: Partial<DuelAnswerRow> = {}): DuelAnswerRow {
  return {
    id: 1,
    duelId: "duel-1",
    userId: 100,
    wordId: 1,
    roundIndex: null,
    correct: true,
    elapsedMs: 1000,
    submittedAt: new Date("2026-01-01T00:00:01Z"),
    ...overrides,
  };
}

describe("checkSpelling", () => {
  it("matches identical strings", () => {
    expect(checkSpelling("alphabet", "alphabet")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(checkSpelling("Alphabet", "alphabet")).toBe(true);
    expect(checkSpelling("ALPHABET", "alphabet")).toBe(true);
    expect(checkSpelling("alphabet", "ALPHABET")).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(checkSpelling("  alphabet  ", "alphabet")).toBe(true);
    expect(checkSpelling("alphabet", "  alphabet  ")).toBe(true);
  });

  it("rejects wrong spellings", () => {
    expect(checkSpelling("alphabt", "alphabet")).toBe(false);
    expect(checkSpelling("alphabets", "alphabet")).toBe(false);
  });

  it("rejects empty typed when target is non-empty", () => {
    expect(checkSpelling("", "alphabet")).toBe(false);
  });

  it("rejects empty target when typed is non-empty", () => {
    expect(checkSpelling("alphabet", "")).toBe(false);
  });

  it("matches both empty", () => {
    expect(checkSpelling("", "")).toBe(true);
  });
});

describe("parseWordIds", () => {
  it("parses a valid JSON array of integers", () => {
    expect(parseWordIds("[1,2,3,4,5]")).toEqual([1, 2, 3, 4, 5]);
  });

  it("parses empty array", () => {
    expect(parseWordIds("[]")).toEqual([]);
  });

  it("returns empty for invalid JSON", () => {
    expect(parseWordIds("not json")).toEqual([]);
  });

  it("returns empty for non-array JSON", () => {
    expect(parseWordIds('{"a":1}')).toEqual([]);
  });

  it("filters non-integer entries", () => {
    expect(parseWordIds('[1, "two", 3, null, 5]')).toEqual([1, 3, 5]);
  });
});

describe("isMode1TimeUp", () => {
  it("returns false when not started", () => {
    const d = makeDuel({ startedAt: null });
    expect(isMode1TimeUp(d, Date.now())).toBe(false);
  });

  it("returns false when within duration", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const d = makeDuel({ startedAt: new Date(start) });
    expect(isMode1TimeUp(d, start + 30_000)).toBe(false);
  });

  it("returns true when duration reached", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const d = makeDuel({ startedAt: new Date(start), durationSec: 60 });
    expect(isMode1TimeUp(d, start + 60_000)).toBe(true);
  });

  it("returns true when duration exceeded", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const d = makeDuel({ startedAt: new Date(start), durationSec: 60 });
    expect(isMode1TimeUp(d, start + 90_000)).toBe(true);
  });
});

describe("timeLeftSecMode1", () => {
  it("returns full duration when not started", () => {
    const d = makeDuel({ startedAt: null, durationSec: 60 });
    expect(timeLeftSecMode1(d, Date.now())).toBe(60);
  });

  it("returns remaining seconds within duration", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const d = makeDuel({ startedAt: new Date(start), durationSec: 60 });
    expect(timeLeftSecMode1(d, start + 30_000)).toBe(30);
  });

  it("returns 0 when duration reached", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const d = makeDuel({ startedAt: new Date(start), durationSec: 60 });
    expect(timeLeftSecMode1(d, start + 60_000)).toBe(0);
  });

  it("returns 0 when exceeded", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const d = makeDuel({ startedAt: new Date(start), durationSec: 60 });
    expect(timeLeftSecMode1(d, start + 100_000)).toBe(0);
  });
});

describe("isMode2RoundTimedOut", () => {
  it("returns false when round not started", () => {
    const d = makeDuel({ currentRoundStartedAt: null });
    expect(isMode2RoundTimedOut(d, Date.now())).toBe(false);
  });

  it("returns false when within 10s", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const d = makeDuel({ currentRoundStartedAt: new Date(start) });
    expect(isMode2RoundTimedOut(d, start + 5_000)).toBe(false);
  });

  it("returns true at exactly 10s", () => {
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    const d = makeDuel({ currentRoundStartedAt: new Date(start) });
    expect(isMode2RoundTimedOut(d, start + 10_000)).toBe(true);
  });
});

describe("isMode2Complete", () => {
  it("returns false when currentRoundIndex is null", () => {
    const d = makeDuel({ currentRoundIndex: null, roundCount: 10 });
    expect(isMode2Complete(d)).toBe(false);
  });

  it("returns false when currentRoundIndex < roundCount", () => {
    const d = makeDuel({ currentRoundIndex: 3, roundCount: 10 });
    expect(isMode2Complete(d)).toBe(false);
  });

  it("returns true when currentRoundIndex >= roundCount", () => {
    const d = makeDuel({ currentRoundIndex: 10, roundCount: 10 });
    expect(isMode2Complete(d)).toBe(true);
  });
});

describe("computeRoundWinner", () => {
  it("both correct: faster wins", () => {
    expect(computeRoundWinner({ correct: true, elapsedMs: 1000 }, { correct: true, elapsedMs: 2000 })).toBe("challenger");
    expect(computeRoundWinner({ correct: true, elapsedMs: 2000 }, { correct: true, elapsedMs: 1000 })).toBe("opponent");
  });

  it("both correct at exactly same time: tie", () => {
    expect(computeRoundWinner({ correct: true, elapsedMs: 1500 }, { correct: true, elapsedMs: 1500 })).toBe("tie");
  });

  it("only challenger correct", () => {
    expect(computeRoundWinner({ correct: true, elapsedMs: 5000 }, { correct: false, elapsedMs: 1000 })).toBe("challenger");
  });

  it("only opponent correct", () => {
    expect(computeRoundWinner({ correct: false, elapsedMs: 1000 }, { correct: true, elapsedMs: 5000 })).toBe("opponent");
  });

  it("both wrong: tie", () => {
    expect(computeRoundWinner({ correct: false, elapsedMs: 1000 }, { correct: false, elapsedMs: 2000 })).toBe("tie");
  });

  it("both missing: tie", () => {
    expect(computeRoundWinner(null, null)).toBe("tie");
  });

  it("only challenger submitted: challenger wins (vacant)", () => {
    expect(computeRoundWinner({ correct: false, elapsedMs: 1000 }, null)).toBe("challenger");
  });

  it("only opponent submitted: opponent wins (vacant)", () => {
    expect(computeRoundWinner(null, { correct: false, elapsedMs: 1000 })).toBe("opponent");
  });
});

describe("computeWinner — mode 1 (speed race)", () => {
  it("challenger has more correct → challenger wins", () => {
    const d = makeDuel({ mode: "1" });
    const answers = [
      makeAnswer({ userId: 100, correct: true }),
      makeAnswer({ userId: 100, correct: true }),
      makeAnswer({ userId: 100, correct: true }),
      makeAnswer({ userId: 200, correct: true }),
      makeAnswer({ userId: 200, correct: false }),
    ];
    expect(computeWinner(d, answers)).toBe(100);
  });

  it("opponent has more correct → opponent wins", () => {
    const d = makeDuel({ mode: "1" });
    const answers = [
      makeAnswer({ userId: 100, correct: false }),
      makeAnswer({ userId: 100, correct: true }),
      makeAnswer({ userId: 200, correct: true }),
      makeAnswer({ userId: 200, correct: true }),
      makeAnswer({ userId: 200, correct: true }),
    ];
    expect(computeWinner(d, answers)).toBe(200);
  });

  it("tied correct counts → tie (null)", () => {
    const d = makeDuel({ mode: "1" });
    const answers = [
      makeAnswer({ userId: 100, correct: true }),
      makeAnswer({ userId: 200, correct: true }),
    ];
    expect(computeWinner(d, answers)).toBe(null);
  });

  it("no answers → tie", () => {
    const d = makeDuel({ mode: "1" });
    expect(computeWinner(d, [])).toBe(null);
  });
});

describe("computeWinner — mode 2 (round race)", () => {
  it("challenger wins more rounds → challenger wins", () => {
    const d = makeDuel({
      mode: "2",
      currentRoundIndex: 3, // 3 rounds played
    });
    // Round 0: both correct, challenger faster
    // Round 1: only opponent correct
    // Round 2: both wrong → tie
    // Challenger: 1 win, Opponent: 1 win, Tie: 1 → tied → null
    // Let me revise:
    // Round 0: only challenger correct → challenger wins
    // Round 1: only challenger correct → challenger wins
    // Round 2: both correct, challenger faster → challenger wins
    const answers = [
      makeAnswer({ userId: 100, roundIndex: 0, correct: true, elapsedMs: 1000 }),
      makeAnswer({ userId: 200, roundIndex: 0, correct: false, elapsedMs: 2000 }),
      makeAnswer({ userId: 100, roundIndex: 1, correct: true, elapsedMs: 1000 }),
      makeAnswer({ userId: 200, roundIndex: 1, correct: false, elapsedMs: 2000 }),
      makeAnswer({ userId: 100, roundIndex: 2, correct: true, elapsedMs: 1000 }),
      makeAnswer({ userId: 200, roundIndex: 2, correct: true, elapsedMs: 2000 }),
    ];
    expect(computeWinner(d, answers)).toBe(100);
  });

  it("tied round wins → null", () => {
    const d = makeDuel({
      mode: "2",
      currentRoundIndex: 2,
    });
    // Round 0: challenger wins
    // Round 1: opponent wins
    const answers = [
      makeAnswer({ userId: 100, roundIndex: 0, correct: true, elapsedMs: 1000 }),
      makeAnswer({ userId: 200, roundIndex: 0, correct: false, elapsedMs: 2000 }),
      makeAnswer({ userId: 100, roundIndex: 1, correct: false, elapsedMs: 1000 }),
      makeAnswer({ userId: 200, roundIndex: 1, correct: true, elapsedMs: 500 }),
    ];
    expect(computeWinner(d, answers)).toBe(null);
  });

  it("opponent wins more rounds → opponent wins", () => {
    const d = makeDuel({
      mode: "2",
      currentRoundIndex: 2,
    });
    // Round 0: opponent wins
    // Round 1: opponent wins
    const answers = [
      makeAnswer({ userId: 100, roundIndex: 0, correct: false, elapsedMs: 1000 }),
      makeAnswer({ userId: 200, roundIndex: 0, correct: true, elapsedMs: 2000 }),
      makeAnswer({ userId: 100, roundIndex: 1, correct: false, elapsedMs: 1000 }),
      makeAnswer({ userId: 200, roundIndex: 1, correct: true, elapsedMs: 500 }),
    ];
    expect(computeWinner(d, answers)).toBe(200);
  });

  it("no answers → null", () => {
    const d = makeDuel({ mode: "2", currentRoundIndex: 0 });
    expect(computeWinner(d, [])).toBe(null);
  });
});

describe("checkForfeit", () => {
  it("returns false when status is not active", () => {
    const d = makeDuel({ status: "pending" });
    expect(checkForfeit(d, 100, new Date(), Date.now())).toEqual({ forfeit: false });
  });

  it("returns false when opponent has never been seen", () => {
    const d = makeDuel({ status: "active", mode: "1" });
    expect(checkForfeit(d, 100, null, Date.now())).toEqual({ forfeit: false });
  });

  it("returns false when within threshold (mode 1: 30s)", () => {
    const start = Date.now();
    const d = makeDuel({ status: "active", mode: "1" });
    expect(checkForfeit(d, 100, new Date(start - 10_000), start)).toEqual({ forfeit: false });
  });

  it("returns true when threshold reached (mode 1: 30s)", () => {
    const start = Date.now();
    const d = makeDuel({ status: "active", mode: "1" });
    expect(checkForfeit(d, 100, new Date(start - 30_000), start).forfeit).toBe(true);
  });

  it("returns false when within threshold (mode 2: 60s)", () => {
    const start = Date.now();
    const d = makeDuel({ status: "active", mode: "2" });
    expect(checkForfeit(d, 100, new Date(start - 30_000), start)).toEqual({ forfeit: false });
  });

  it("returns true when threshold reached (mode 2: 60s)", () => {
    const start = Date.now();
    const d = makeDuel({ status: "active", mode: "2" });
    expect(checkForfeit(d, 100, new Date(start - 60_000), start).forfeit).toBe(true);
  });
});

describe("getTodayDuelStats", () => {
  it("returns zeros when user has no duels", async () => {
    const prisma = {
      duel: {
        findMany: async () => [],
      },
    } as never;
    const { getTodayDuelStats } = await import("./duel");
    const stats = await getTodayDuelStats(prisma, 100);
    expect(stats).toEqual({ wins: 0, total: 0, winRate: null });
  });

  it("counts wins correctly and computes winRate", async () => {
    const prisma = {
      duel: {
        findMany: async () => [
          { winnerId: 100, challengerId: 100, opponentId: 200 },
          { winnerId: 200, challengerId: 100, opponentId: 200 },
          { winnerId: 100, challengerId: 100, opponentId: 200 },
          { winnerId: 100, challengerId: 100, opponentId: 200 },
        ],
      },
    } as never;
    const { getTodayDuelStats } = await import("./duel");
    const stats = await getTodayDuelStats(prisma, 100);
    expect(stats).toEqual({ wins: 3, total: 4, winRate: 0.75 });
  });

  it("returns null winRate when total is 0", async () => {
    const prisma = {
      duel: {
        findMany: async () => [],
      },
    } as never;
    const { getTodayDuelStats } = await import("./duel");
    const stats = await getTodayDuelStats(prisma, 999);
    expect(stats.winRate).toBe(null);
  });
});