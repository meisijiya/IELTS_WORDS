import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockDuelFindUnique = vi.fn();
const mockWordFindUnique = vi.fn();
const mockDuelAnswerFindUnique = vi.fn();
const mockDuelAnswerCreate = vi.fn();
const mockDuelAnswerFindMany = vi.fn();
const mockDuelAnswerCount = vi.fn();
const mockDuelUpdate = vi.fn();

const mockTx = {
  duelAnswer: {
    create: mockDuelAnswerCreate,
    findMany: mockDuelAnswerFindMany,
    count: mockDuelAnswerCount,
  },
  duel: {
    update: mockDuelUpdate,
  },
};

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (fn: (tx: typeof mockTx) => unknown) => Promise.resolve(fn(mockTx)),
    duel: {
      findUnique: (...args: unknown[]) => mockDuelFindUnique(...args),
    },
    word: {
      findUnique: (...args: unknown[]) => mockWordFindUnique(...args),
    },
    duelAnswer: {
      findUnique: (...args: unknown[]) => mockDuelAnswerFindUnique(...args),
    },
  },
}));

import { POST } from "./route";

const AUTH_USER = { id: 1, username: "test", role: "user" };
const AUTH_USER2 = { id: 2, username: "opponent", role: "user" };

function makeDuel(id: string, overrides: Record<string, unknown> = {}) {
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

function makePostRequest(body: unknown, url = "http://localhost/api/duel/d1/answer"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function callPost(body: unknown, id = "d1"): Promise<Response> {
  return POST(makePostRequest(body), { params: Promise.resolve({ id }) });
}

describe("POST /api/duel/[id]/answer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:05Z"));
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    mockDuelFindUnique.mockResolvedValue(makeDuel("d1"));
    mockWordFindUnique.mockResolvedValue(makeWord(1));
    mockDuelAnswerFindUnique.mockResolvedValue(null);
    mockDuelAnswerCreate.mockResolvedValue(makeDuelAnswer());
    mockDuelAnswerFindMany.mockResolvedValue([]);
    mockDuelAnswerCount.mockResolvedValue(0);
    mockDuelUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("mode 1 happy: returns correct + totalCorrect", async () => {
    mockDuelAnswerCount.mockResolvedValue(1);

    const res = await callPost({ wordId: 1, typed: "apple" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.correct).toBe(true);
    expect(json.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(json.totalCorrect).toBe(1);
    expect(json.finished).toBe(false);
  });

  it("mode 1 wrong spelling: returns correct: false", async () => {
    mockWordFindUnique.mockResolvedValue(makeWord(1, 1, "apple"));
    mockDuelAnswerCount.mockResolvedValue(0);

    const res = await callPost({ wordId: 1, typed: "orangle" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.correct).toBe(false);
    expect(json.totalCorrect).toBe(0);
  });

  it("mode 1 auto-finish: time elapses → duel becomes finished", async () => {
    vi.setSystemTime(new Date("2026-07-01T00:01:05Z"));
    const startedAt = new Date("2026-07-01T00:00:00Z");
    mockDuelFindUnique.mockResolvedValue(
      makeDuel("d1", { startedAt, durationSec: 60 }),
    );
    mockDuelAnswerCount.mockResolvedValue(10);
    mockDuelAnswerFindMany.mockResolvedValue([
      makeDuelAnswer({ userId: 1, correct: true }),
      makeDuelAnswer({ userId: 2, correct: false }),
    ]);

    const res = await callPost({ wordId: 1, typed: "apple" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.finished).toBe(true);
    expect(mockDuelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          status: "finished",
          winnerId: 1,
        }),
      }),
    );
  });

  it("mode 2 happy: both submit → round advances", async () => {
    const duel = makeDuel("d1", {
      mode: "2",
      roundCount: 10,
      currentRoundIndex: 0,
      currentRoundStartedAt: new Date("2026-07-01T00:00:00Z"),
    });
    mockDuelFindUnique.mockResolvedValue(duel);
    mockDuelAnswerFindMany.mockImplementation(
      async ({ where }: { where: { duelId: string; roundIndex?: number } }) => {
        if (where.roundIndex === 0) {
          return [
            makeDuelAnswer({
              userId: 1,
              roundIndex: 0,
              correct: true,
              elapsedMs: 800,
            }),
            makeDuelAnswer({
              userId: 2,
              roundIndex: 0,
              correct: true,
              elapsedMs: 1200,
            }),
          ];
        }
        return [];
      },
    );
    mockDuelAnswerCount.mockResolvedValue(1);

    const res = await callPost({ wordId: 1, typed: "apple", roundIndex: 0 });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.correct).toBe(true);
    expect(json.finished).toBe(false);

    expect(mockDuelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          currentRoundIndex: 1,
        }),
      }),
    );
  });

  it("mode 2 duplicate round: 409 ROUND_ALREADY_SUBMITTED", async () => {
    const duel = makeDuel("d1", {
      mode: "2",
      roundCount: 10,
      currentRoundIndex: 0,
      currentRoundStartedAt: new Date("2026-07-01T00:00:00Z"),
    });
    mockDuelFindUnique.mockResolvedValue(duel);
    mockDuelAnswerFindUnique.mockResolvedValue(makeDuelAnswer({ roundIndex: 0 }));

    const res = await callPost({ wordId: 1, typed: "apple", roundIndex: 0 });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("ROUND_ALREADY_SUBMITTED");
  });

  it("mode 1 with roundIndex: 400 INVALID_ROUND_INDEX", async () => {
    const res = await callPost({ wordId: 1, typed: "apple", roundIndex: 0 });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_ROUND_INDEX");
  });

  it("mode 2 missing roundIndex: 400 INVALID_ROUND_INDEX", async () => {
    const duel = makeDuel("d1", {
      mode: "2",
      roundCount: 10,
      currentRoundIndex: 0,
      currentRoundStartedAt: new Date("2026-07-01T00:00:00Z"),
    });
    mockDuelFindUnique.mockResolvedValue(duel);

    const res = await callPost({ wordId: 1, typed: "apple" });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_ROUND_INDEX");
  });

  it("word not in duel pool: 400 INVALID_WORD", async () => {
    const res = await callPost({ wordId: 99, typed: "apple" });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_WORD");
  });

  it("wordbookId mismatch: 400 INVALID_WORD", async () => {
    mockWordFindUnique.mockResolvedValue(makeWord(1, 999));

    const res = await callPost({ wordId: 1, typed: "apple" });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_WORD");
  });

  it("duel already finished: 409 DUEL_FINISHED", async () => {
    mockDuelFindUnique.mockResolvedValue(makeDuel("d1", { status: "finished" }));

    const res = await callPost({ wordId: 1, typed: "apple" });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("DUEL_FINISHED");
  });

  it("not a participant: 403 NOT_PARTICIPANT", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 3, role: "user" });

    const res = await callPost({ wordId: 1, typed: "apple" });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("NOT_PARTICIPANT");
  });

  it("unauthenticated: 401", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await callPost({ wordId: 1, typed: "apple" });
    expect(res.status).toBe(401);
    expect(mockDuelAnswerCreate).not.toHaveBeenCalled();
  });

  it("invalid JSON body: 400", async () => {
    const res = await POST(new Request("http://localhost/api/duel/d1/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    }), { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(400);
  });

  it("missing wordId: 400", async () => {
    const res = await callPost({ typed: "apple" });
    expect(res.status).toBe(400);
  });

  it("missing typed: 400", async () => {
    const res = await callPost({ wordId: 1 });
    expect(res.status).toBe(400);
  });

  it("duel not found: 404", async () => {
    mockDuelFindUnique.mockResolvedValue(null);

    const res = await callPost({ wordId: 1, typed: "apple" });
    expect(res.status).toBe(404);
  });
});
