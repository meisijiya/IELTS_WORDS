import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockDuelFindUnique = vi.fn();
const mockDuelUpdate = vi.fn();
const mockDuelAnswerFindMany = vi.fn();
const mockDuelAnswerCount = vi.fn();
const mockDuelAnswerFindFirst = vi.fn();
const mockWordFindUnique = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    duel: {
      findUnique: (...args: unknown[]) => mockDuelFindUnique(...args),
      update: (...args: unknown[]) => mockDuelUpdate(...args),
    },
    duelAnswer: {
      findMany: (...args: unknown[]) => mockDuelAnswerFindMany(...args),
      count: (...args: unknown[]) => mockDuelAnswerCount(...args),
      findFirst: (...args: unknown[]) => mockDuelAnswerFindFirst(...args),
    },
    word: {
      findUnique: (...args: unknown[]) => mockWordFindUnique(...args),
    },
  },
}));

import { GET } from "./route";

const AUTH_USER = { id: 1, username: "test", role: "user" };
const BASE_TIME = new Date("2026-07-01T00:00:05Z");

function makeDuel(id = "d1", overrides: Record<string, unknown> = {}) {
  return {
    id,
    mode: "1",
    status: "active",
    wordbookId: 1,
    durationSec: 60,
    roundCount: 0,
    wordIds: JSON.stringify([1, 2, 3, 4, 5]),
    challengerId: 1,
    opponentId: 2,
    challenger: { id: 1, username: "test" },
    opponent: { id: 2, username: "opponent" },
    createdAt: new Date("2026-07-01T00:00:00Z"),
    startedAt: new Date("2026-07-01T00:00:00Z"),
    finishedAt: null,
    winnerId: null,
    forfeitById: null,
    challengerLastSeenAt: null,
    opponentLastSeenAt: null,
    currentRoundIndex: null,
    currentRoundStartedAt: null,
    ...overrides,
  };
}

function makeWord(id: number, wordbookId = 1, spelling = "apple") {
  return {
    id,
    wordbookId,
    spelling,
    pos: "n.",
    glosses: JSON.stringify([{ pos: "n.", meaning: "苹果" }]),
    flags: null,
  };
}

function makeDuelAnswer(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    duelId: "d1",
    userId: 1,
    wordId: 1,
    roundIndex: null,
    correct: true,
    elapsedMs: 1500,
    submittedAt: new Date("2026-07-01T00:00:01Z"),
    ...overrides,
  };
}

function callGET(id = "d1"): Promise<Response> {
  return GET(new Request(`http://localhost/api/duel/${id}/state`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/duel/[id]/state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    mockDuelFindUnique.mockReset();
    mockDuelFindUnique.mockResolvedValue(makeDuel("d1"));
    mockDuelUpdate.mockReset();
    mockDuelUpdate.mockResolvedValue({});
    mockDuelAnswerFindMany.mockReset();
    mockDuelAnswerFindMany.mockResolvedValue([]);
    mockDuelAnswerCount.mockReset();
    mockDuelAnswerCount.mockResolvedValue(0);
    mockDuelAnswerFindFirst.mockReset();
    mockDuelAnswerFindFirst.mockResolvedValue(null);
    mockWordFindUnique.mockReset();
    mockWordFindUnique.mockResolvedValue(makeWord(4, 1, "orange"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // Number of count calls per scenario:
  //   mode 1 active:  3 (answeredCount + myScore + opponentScore)
  //   mode 2 active:  2 (myScore + opponentScore)
  //   forfeited:      2 (myScore + opponentScore, currentWordId is null)
  //   finished:       2 (myScore + opponentScore, currentWordId is null)
  //   401/403/404:    0 (early return)

  it("mode 1 happy: returns full state with current word", async () => {
    mockDuelAnswerCount
      .mockResolvedValueOnce(3)  // answeredCount → wordIds[3] = 4
      .mockResolvedValueOnce(3)  // myScore
      .mockResolvedValueOnce(2); // opponentScore

    const res = await callGET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe("d1");
    expect(json.mode).toBe("1");
    expect(json.status).toBe("active");
    expect(json.wordIds).toEqual([1, 2, 3, 4, 5]);
    expect(json.challenger).toEqual({ id: 1, username: "test" });
    expect(json.opponent).toEqual({ id: 2, username: "opponent" });
    expect(json.currentWordId).toBe(4);
    expect(json.currentWordSpelling).toBe("orange");
    expect(json.currentWordGlosses).toEqual([{ pos: "n.", meaning: "苹果" }]);
    expect(json.myScore).toBe(3);
    expect(json.opponentScore).toBe(2);
    expect(typeof json.serverNow).toBe("number");
    expect(json.timeLeftSec).toBeGreaterThan(0);
    expect(json.currentRoundIndex).toBeNull();
  });

  it("mode 2 happy: returns currentRoundIndex correctly", async () => {
    mockDuelFindUnique.mockResolvedValue(
      makeDuel("d1", {
        mode: "2",
        roundCount: 10,
        currentRoundIndex: 2,
        currentRoundStartedAt: new Date("2026-07-01T00:00:00Z"),
      }),
    );

    mockDuelAnswerCount
      .mockResolvedValueOnce(1)  // myScore
      .mockResolvedValueOnce(2); // opponentScore (mode 2: no answeredCount call)

    const res = await callGET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.mode).toBe("2");
    expect(json.currentRoundIndex).toBe(2);
    expect(json.currentWordId).toBe(3);  // wordIds[2]
    expect(json.currentRoundStartedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(json.timeLeftSec).toBeNull();
  });

  it("heartbeat: updates challengerLastSeenAt", async () => {
    mockDuelAnswerCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    await callGET();

    expect(mockDuelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          challengerLastSeenAt: BASE_TIME,
        }),
      }),
    );
  });

  it("heartbeat as opponent: updates opponentLastSeenAt", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 2, username: "opponent", role: "user" });
    mockDuelFindUnique.mockResolvedValue(makeDuel("d1"));

    mockDuelAnswerCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    await callGET();

    expect(mockDuelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          opponentLastSeenAt: BASE_TIME,
        }),
      }),
    );
  });

  it("forfeit triggers mode 1: opponentLastSeenAt stale → forfeited", async () => {
    const forfeitNow = new Date("2026-07-01T00:00:35Z"); // 35s after epoch
    vi.setSystemTime(forfeitNow);
    const farPast = new Date("2026-07-01T00:00:00Z"); // 35s before forfeitNow
    const forfeitedDuel = makeDuel("d1", {
      status: "forfeited",
      winnerId: 1,
      forfeitById: 2,
      finishedAt: forfeitNow,
      opponentLastSeenAt: farPast,
    });

    mockDuelFindUnique
      .mockResolvedValueOnce(makeDuel("d1", { opponentLastSeenAt: farPast }))
      .mockResolvedValueOnce(forfeitedDuel);

    mockDuelAnswerCount
      .mockResolvedValueOnce(0)  // myScore
      .mockResolvedValueOnce(0); // opponentScore (status=forfeited → null currentWordId → 2 count calls)

    const res = await callGET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("forfeited");
    expect(json.winnerId).toBe(1);
    expect(json.forfeitById).toBe(2);
    expect(json.opponentStatus).toBe("forfeited");
    expect(mockDuelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({ status: "forfeited" }),
      }),
    );
  });

  it("forfeit does NOT trigger mode 1: opponentLastSeenAt recent", async () => {
    const recent = new Date("2026-07-01T00:00:03Z"); // 2s ago, < MODE1_FORFEIT_MS (30s)
    mockDuelFindUnique.mockResolvedValue(
      makeDuel("d1", { opponentLastSeenAt: recent }),
    );

    mockDuelAnswerCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const res = await callGET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("active");
  });

  it("mode 1 auto-finish: time elapses → status finished, winner calculated", async () => {
    const startedAt = new Date("2026-07-01T00:00:00Z");
    const now = new Date("2026-07-01T00:01:05Z"); // 65s later, > 60s duration
    const finishedDuel = makeDuel("d1", {
      startedAt,
      status: "finished",
      winnerId: 1,
      finishedAt: now,
    });

    vi.setSystemTime(now);

    mockDuelFindUnique
      .mockResolvedValueOnce(makeDuel("d1", { startedAt }))
      .mockResolvedValueOnce(finishedDuel);

    mockDuelAnswerFindMany.mockResolvedValue([
      makeDuelAnswer({ userId: 1, correct: true }),
      makeDuelAnswer({ userId: 2, correct: false }),
    ]);

    mockDuelAnswerCount
      .mockResolvedValueOnce(1)  // myScore
      .mockResolvedValueOnce(0); // opponentScore (status=finished → null currentWordId)

    const res = await callGET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("finished");
    expect(json.winnerId).toBe(1);
    expect(json.currentWordId).toBeNull();
    expect(json.timeLeftSec).toBe(0);
    expect(mockDuelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({ status: "finished" }),
      }),
    );
  });

  it("mode 2 round advances when both submit", async () => {
    const duel = makeDuel("d1", {
      mode: "2",
      roundCount: 10,
      currentRoundIndex: 0,
      currentRoundStartedAt: new Date("2026-07-01T00:00:00Z"),
    });

    mockDuelFindUnique
      .mockResolvedValueOnce(duel)
      .mockResolvedValueOnce({ ...duel, currentRoundIndex: 1 });

    mockDuelAnswerFindMany.mockImplementation(
      async ({ where }: { where: { duelId: string; roundIndex?: number } }) => {
        if (where.roundIndex === 0) {
          return [
            makeDuelAnswer({ userId: 1, roundIndex: 0 }),
            makeDuelAnswer({ userId: 2, roundIndex: 0 }),
          ];
        }
        return [];
      },
    );

    mockDuelAnswerCount
      .mockResolvedValueOnce(1)  // myScore
      .mockResolvedValueOnce(1); // opponentScore (mode 2: no answeredCount)

    const res = await callGET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.currentRoundIndex).toBe(1);
    expect(mockDuelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({ currentRoundIndex: 1 }),
      }),
    );
  });

  it("mode 2 round advances on timeout even if opponent not submitted", async () => {
    const duel = makeDuel("d1", {
      mode: "2",
      roundCount: 10,
      currentRoundIndex: 0,
      currentRoundStartedAt: new Date("2026-07-01T00:00:00Z"),
    });

    const now = new Date("2026-07-01T00:00:15Z"); // 15s later, > 10s ROUND_TIMEOUT_MS
    const advancedDuel = { ...duel, currentRoundIndex: 1 };
    vi.setSystemTime(now);

    mockDuelFindUnique
      .mockResolvedValueOnce(duel)
      .mockResolvedValueOnce(advancedDuel);

    // Only challenger submitted, opponent didn't → timed out
    mockDuelAnswerFindMany.mockResolvedValue([
      makeDuelAnswer({ userId: 1, roundIndex: 0 }),
    ]);

    mockDuelAnswerCount
      .mockResolvedValueOnce(1)  // myScore
      .mockResolvedValueOnce(0); // opponentScore (mode 2: no answeredCount)

    const res = await callGET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockDuelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({ currentRoundIndex: 1 }),
      }),
    );
  });

  it("mode 2 finishes when all rounds complete", async () => {
    const startedAt = new Date("2026-07-01T00:00:00Z");
    const duel = makeDuel("d1", {
      mode: "2",
      roundCount: 1,
      currentRoundIndex: 0,
      currentRoundStartedAt: startedAt,
    });

    const finishedDuel = makeDuel("d1", {
      mode: "2",
      roundCount: 1,
      status: "finished",
      winnerId: 1,
      finishedAt: BASE_TIME,
      currentRoundIndex: 1,
    });

    mockDuelFindUnique
      .mockResolvedValueOnce(duel)
      .mockResolvedValueOnce(finishedDuel);

    mockDuelAnswerFindMany.mockImplementation(
      async ({ where }: { where: { duelId: string; roundIndex?: number } }) => {
        if (where.roundIndex === 0 || where.roundIndex === undefined) {
          return [
            makeDuelAnswer({ userId: 1, roundIndex: 0, correct: true }),
            makeDuelAnswer({ userId: 2, roundIndex: 0, correct: false }),
          ];
        }
        return [];
      },
    );

    mockDuelAnswerCount
      .mockResolvedValueOnce(1)  // myScore
      .mockResolvedValueOnce(0); // opponentScore (status=finished → null currentWordId)

    const res = await callGET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("finished");
    expect(json.winnerId).toBe(1);
    expect(mockDuelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({ status: "finished" }),
      }),
    );
  });

  it("not a participant: 403 NOT_PARTICIPANT", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 3, role: "user" });
    mockDuelFindUnique.mockReset();
    mockDuelFindUnique.mockResolvedValue(makeDuel("d1"));

    const res = await callGET();
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("NOT_PARTICIPANT");
  });

  it("unauthenticated: 401", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await callGET();
    expect(res.status).toBe(401);
  });

  it("duel not found: 404", async () => {
    mockDuelFindUnique.mockResolvedValue(null);

    const res = await callGET();
    expect(res.status).toBe(404);
  });

  it("wordIds returned as number[]", async () => {
    mockDuelFindUnique.mockResolvedValue(
      makeDuel("d1", { wordIds: JSON.stringify([10, 20, 30]) }),
    );

    mockDuelAnswerCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const res = await callGET();
    const json = await res.json();

    expect(Array.isArray(json.wordIds)).toBe(true);
    expect(json.wordIds).toEqual([10, 20, 30]);
    expect(json.wordIds.every((n: unknown) => typeof n === "number")).toBe(true);
  });

  it("mode 1 currentWordId is null when all words answered", async () => {
    mockDuelFindUnique.mockResolvedValue(
      makeDuel("d1", { wordIds: JSON.stringify([1, 2]) }),
    );

    mockDuelAnswerCount
      .mockResolvedValueOnce(2)  // answeredCount = 2, which equals wordIds.length
      .mockResolvedValueOnce(2)  // myScore
      .mockResolvedValueOnce(1); // opponentScore

    const res = await callGET();
    const json = await res.json();

    expect(json.currentWordId).toBeNull();
    expect(json.currentWordSpelling).toBeNull();
  });
});
