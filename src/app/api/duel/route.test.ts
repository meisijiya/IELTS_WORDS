import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockWordbookFindUnique = vi.fn();
const mockWordFindMany = vi.fn();
const mockDuelCreate = vi.fn();
const mockDuelFindMany = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    wordbook: {
      findUnique: (...args: unknown[]) => mockWordbookFindUnique(...args),
    },
    word: {
      findMany: (...args: unknown[]) => mockWordFindMany(...args),
    },
    duel: {
      create: (...args: unknown[]) => mockDuelCreate(...args),
      findMany: (...args: unknown[]) => mockDuelFindMany(...args),
    },
  },
}));

import { POST, GET } from "./route";

const AUTH_USER = { id: 1, username: "admin", role: "admin" };
const AUTH_USER2 = { id: 2, username: "user2", role: "user" };

function makeWordbook(id: number, slug = "concise", name = "精简版") {
  return { id, slug, name, description: null, createdAt: new Date() };
}

function makeWords(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1 }));
}

function makeDuel(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    mode: "1",
    status: "pending",
    wordbookId: 1,
    durationSec: 60,
    roundCount: 0,
    wordIds: "[1,2,3]",
    challengerId: 1,
    opponentId: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    startedAt: null,
    finishedAt: null,
    winnerId: null,
    forfeitById: null,
    challengerLastSeenAt: null,
    opponentLastSeenAt: null,
    currentRoundIndex: null,
    currentRoundStartedAt: null,
    wordbook: { name: "精简版", slug: "concise" },
    ...overrides,
  };
}

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/duel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockDuelCreateImpl(data: Record<string, unknown>): Record<string, unknown> {
  return makeDuel(data.id as string, {
    mode: data.mode,
    status: data.status,
    wordbookId: data.wordbookId,
    durationSec: data.durationSec,
    roundCount: data.roundCount,
    wordIds: data.wordIds,
    challengerId: data.challengerId,
  });
}

describe("POST /api/duel", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    mockWordbookFindUnique.mockResolvedValue(makeWordbook(1));
    mockDuelCreate.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => mockDuelCreateImpl(data),
    );
    mockWordFindMany.mockResolvedValue(makeWords(100));
  });
  afterEach(() => vi.clearAllMocks());

  it("creates a mode 1 duel with 50 wordIds", async () => {
    mockWordFindMany.mockResolvedValue(makeWords(60));
    const res = await POST(makePostRequest({ mode: 1, wordbookId: 1 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.mode).toBe("1");
    expect(json.wordIds).toHaveLength(50);
    expect(json.durationSec).toBe(60);
    expect(json.wordbookId).toBe(1);
    expect(typeof json.id).toBe("string");
    expect(json.id).not.toBe("");
  });

  it("creates a mode 2 duel with roundCount=10", async () => {
    const res = await POST(makePostRequest({ mode: 2, wordbookId: 1, roundCount: 10 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.mode).toBe("2");
    expect(json.wordIds.length).toBeGreaterThanOrEqual(10);
    expect(json.roundCount).toBe(10);
  });

  it("defaults roundCount to 20 when not provided", async () => {
    const res = await POST(makePostRequest({ mode: 2, wordbookId: 1 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.roundCount).toBe(20);
  });

  it("returns 400 when wordbook is empty", async () => {
    mockWordFindMany.mockResolvedValue([]);
    const res = await POST(makePostRequest({ mode: 1, wordbookId: 1 }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("WORDBOOK_EMPTY");
  });

  it("returns 400 when mode is invalid", async () => {
    const res = await POST(makePostRequest({ mode: 3, wordbookId: 1 }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain("mode");
  });

  it("returns 404 when wordbook does not exist", async () => {
    mockWordbookFindUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ mode: 1, wordbookId: 999 }));
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error).toBe("WORDBOOK_NOT_FOUND");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(makePostRequest({ mode: 1, wordbookId: 1 }));
    expect(res.status).toBe(401);
    expect(mockDuelCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid roundCount", async () => {
    const res = await POST(makePostRequest({ mode: 2, wordbookId: 1, roundCount: 7 }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain("roundCount");
  });

  it("returns 400 when wordbookId is not an integer", async () => {
    const res = await POST(makePostRequest({ mode: 1, wordbookId: "abc" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain("wordbookId");
  });
});

describe("GET /api/duel", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
  });
  afterEach(() => vi.clearAllMocks());

  it("returns the current user's duels ordered by createdAt desc", async () => {
    const duels = [
      makeDuel("d1", { challengerId: 1, createdAt: new Date("2026-07-03T00:00:00Z") }),
      makeDuel("d2", { challengerId: 1, createdAt: new Date("2026-07-02T00:00:00Z") }),
      makeDuel("d3", { opponentId: 1, createdAt: new Date("2026-07-01T00:00:00Z") }),
    ];
    mockDuelFindMany.mockResolvedValue(duels);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(3);
    expect(json[0].id).toBe("d1");
    expect(json[1].id).toBe("d2");
    expect(json[2].id).toBe("d3");
    expect(json[0].createdAt).toBe("2026-07-03T00:00:00.000Z");
    expect(json[0].wordbook).toEqual({ name: "精简版", slug: "concise" });
  });

  it("does not return duels belonging to other users", async () => {
    mockDuelFindMany.mockImplementation(async ({ where }) => {
      const all = [
        makeDuel("d1", { challengerId: 1 }),
        makeDuel("d2", { challengerId: 3, opponentId: 4 }),
        makeDuel("d3", { opponentId: 1 }),
      ];
      return all.filter(
        (d) =>
          d.challengerId === where.OR?.[0]?.challengerId ||
          d.opponentId === where.OR?.[1]?.opponentId,
      );
    });

    const res = await GET();
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json.map((d: { id: string }) => d.id).sort()).toEqual(["d1", "d3"]);
  });

  it("returns empty array when user has no duels", async () => {
    mockDuelFindMany.mockResolvedValue([]);
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
