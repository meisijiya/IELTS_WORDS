import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockDuelFindUnique = vi.fn();
const mockDuelUpdate = vi.fn();

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
  },
}));

import { POST } from "./route";

const BASE_DUEL = {
  id: "duel-1",
  mode: "1",
  status: "pending",
  wordbookId: 1,
  durationSec: 60,
  roundCount: 20,
  wordIds: "[1,2,3]",
  challengerId: 1,
  opponentId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  startedAt: null,
  finishedAt: null,
  winnerId: null,
  forfeitById: null,
  challengerLastSeenAt: null,
  opponentLastSeenAt: null,
  currentRoundIndex: null,
  currentRoundStartedAt: null,
};

const AUTH_USER = { id: 2, username: "player", role: "user" };

function makeRequest(): Request {
  return new Request("http://localhost/api/duel/duel-1/join", {
    method: "POST",
  });
}

describe("POST /api/duel/[id]/join", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    mockDuelFindUnique.mockResolvedValue({ ...BASE_DUEL });
    mockDuelUpdate.mockResolvedValue({ ...BASE_DUEL, opponentId: 2, status: "ready" });
  });
  afterEach(() => vi.clearAllMocks());

  it("joins a pending duel (happy path)", async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("ready");
    expect(json.opponentId).toBe(2);
    expect(mockDuelUpdate).toHaveBeenCalledWith({
      where: { id: "duel-1" },
      data: { opponentId: 2, status: "ready" },
    });
  });

  it("rejects self-join (caller === challenger)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 1, username: "owner", role: "user" });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("DUEL_NOT_JOINABLE");
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });

  it("rejects join when duel already has an opponent", async () => {
    mockDuelFindUnique.mockResolvedValue({ ...BASE_DUEL, opponentId: 3 });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("DUEL_NOT_JOINABLE");
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });

  it("rejects join when duel is not pending", async () => {
    mockDuelFindUnique.mockResolvedValue({ ...BASE_DUEL, status: "active" });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("DUEL_NOT_JOINABLE");
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
