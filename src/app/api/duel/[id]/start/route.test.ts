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
  status: "ready",
  wordbookId: 1,
  durationSec: 60,
  roundCount: 20,
  wordIds: "[1,2,3]",
  challengerId: 1,
  opponentId: 2,
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

const AUTH_USER = { id: 1, username: "challenger", role: "user" };

function makeRequest(): Request {
  return new Request("http://localhost/api/duel/duel-1/start", {
    method: "POST",
  });
}

describe("POST /api/duel/[id]/start", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    mockDuelFindUnique.mockResolvedValue({ ...BASE_DUEL });
    mockDuelUpdate.mockImplementation(async ({ data }) => ({
      ...BASE_DUEL,
      ...data,
    }));
  });
  afterEach(() => vi.clearAllMocks());

  it("starts a ready duel (happy path mode 1)", async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("active");
    expect(json.startedAt).toBeTruthy();
    expect(mockDuelUpdate).toHaveBeenCalledWith({
      where: { id: "duel-1" },
      data: { startedAt: expect.any(Date), status: "active" },
    });
  });

  it("sets currentRoundIndex and currentRoundStartedAt for mode 2", async () => {
    mockDuelFindUnique.mockResolvedValue({ ...BASE_DUEL, mode: "2" });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("active");
    expect(json.startedAt).toBeTruthy();
    expect(json.currentRoundIndex).toBe(0);
    expect(json.currentRoundStartedAt).toBeTruthy();
    expect(mockDuelUpdate).toHaveBeenCalledWith({
      where: { id: "duel-1" },
      data: {
        startedAt: expect.any(Date),
        status: "active",
        currentRoundIndex: 0,
        currentRoundStartedAt: expect.any(Date),
      },
    });
  });

  it("returns 409 when duel is not in ready status", async () => {
    mockDuelFindUnique.mockResolvedValue({ ...BASE_DUEL, status: "pending" });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("DUEL_NOT_STARTABLE");
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
