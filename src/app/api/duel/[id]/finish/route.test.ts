import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockDuelFindUnique = vi.fn();
const mockDuelUpdate = vi.fn();
const mockDuelAnswerFindMany = vi.fn();
const mockComputeWinner = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  isAuthenticated: () => mockGetCurrentUser().then((u: unknown) => u !== null),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    duel: {
      findUnique: (...args: unknown[]) => mockDuelFindUnique(...args),
      update: (...args: unknown[]) => mockDuelUpdate(...args),
    },
    duelAnswer: {
      findMany: (...args: unknown[]) => mockDuelAnswerFindMany(...args),
    },
  },
}));
vi.mock("@/lib/duel", () => ({
  computeWinner: (...args: unknown[]) => mockComputeWinner(...args),
}));

import { POST } from "./route";

const BASE_DUEL = {
  id: "duel-1",
  mode: "1",
  status: "active",
  wordbookId: 1,
  durationSec: 60,
  roundCount: 20,
  wordIds: "[1,2,3]",
  challengerId: 1,
  opponentId: 2,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  startedAt: new Date("2026-01-01T00:01:00Z"),
  finishedAt: null,
  winnerId: null,
  forfeitById: null,
  challengerLastSeenAt: null,
  opponentLastSeenAt: null,
  currentRoundIndex: null,
  currentRoundStartedAt: null,
};

const AUTH_USER = { id: 1, username: "challenger", role: "user" };

function makeRequest(): Request {
  return new Request("http://localhost/api/duel/duel-1/finish", {
    method: "POST",
  });
}

describe("POST /api/duel/[id]/finish", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    mockDuelFindUnique.mockResolvedValue({ ...BASE_DUEL });
    mockDuelAnswerFindMany.mockResolvedValue([]);
    mockComputeWinner.mockReturnValue(1);
    mockDuelUpdate.mockImplementation(async ({ data }) => ({
      ...BASE_DUEL,
      ...data,
    }));
  });
  afterEach(() => vi.clearAllMocks());

  it("finishes an active duel (happy path)", async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("finished");
    expect(json.finishedAt).toBeTruthy();
    expect(json.winner).toBe(1);
    expect(mockDuelAnswerFindMany).toHaveBeenCalledWith({
      where: { duelId: "duel-1" },
    });
    expect(mockComputeWinner).toHaveBeenCalled();
    expect(mockDuelUpdate).toHaveBeenCalledWith({
      where: { id: "duel-1" },
      data: {
        finishedAt: expect.any(Date),
        winnerId: 1,
        status: "finished",
      },
    });
  });

  it("handles tie (winnerId null)", async () => {
    mockComputeWinner.mockReturnValue(null);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("finished");
    expect(json.winner).toBeNull();
    expect(mockDuelUpdate).toHaveBeenCalledWith({
      where: { id: "duel-1" },
      data: {
        finishedAt: expect.any(Date),
        winnerId: null,
        status: "finished",
      },
    });
  });

  it("returns 409 when duel is not active", async () => {
    mockDuelFindUnique.mockResolvedValue({ ...BASE_DUEL, status: "pending" });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("DUEL_FINISHED");
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not a participant", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 99, username: "stranger", role: "user" });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("NOT_PARTICIPANT");
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when duel not found", async () => {
    mockDuelFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "nonexistent" }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("duel not found");
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    expect(res.status).toBe(401);
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });
});
