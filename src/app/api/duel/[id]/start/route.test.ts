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

import { POST, DELETE } from "./route";

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
  challengerReadyAt: null,
  opponentReadyAt: null,
  currentRoundIndex: null,
  currentRoundStartedAt: null,
};

const CHALLENGER = { id: 1, username: "challenger", role: "user" };
const OPPONENT = { id: 2, username: "opponent", role: "user" };

function makePost(): Request {
  return new Request("http://localhost/api/duel/duel-1/start", {
    method: "POST",
  });
}

function makeDelete(): Request {
  return new Request("http://localhost/api/duel/duel-1/start", {
    method: "DELETE",
  });
}

describe("POST /api/duel/[id]/start (dual-ready handshake)", () => {
  let state: Record<string, unknown>;

  beforeEach(() => {
    state = { ...BASE_DUEL };
    mockDuelFindUnique.mockImplementation(() => Promise.resolve({ ...state }));
    mockDuelUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      state = { ...state, ...data };
      return { ...state };
    });
  });
  afterEach(() => vi.clearAllMocks());

  it("first side ready: sets own readyAt, returns transitioned=false", async () => {
    mockGetCurrentUser.mockResolvedValue(CHALLENGER);

    const res = await POST(makePost(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.transitioned).toBe(false);
    expect(mockDuelUpdate).toHaveBeenCalledTimes(1);
    expect(mockDuelUpdate).toHaveBeenCalledWith({
      where: { id: "duel-1" },
      data: { challengerReadyAt: expect.any(Date) },
    });
  });

  it("second side ready: both readyAt present transitions to active (mode 1)", async () => {
    state.challengerReadyAt = new Date("2026-01-01T00:00:01Z");
    mockGetCurrentUser.mockResolvedValue(OPPONENT);

    const res = await POST(makePost(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.transitioned).toBe(true);
    expect(mockDuelUpdate).toHaveBeenCalledTimes(2);
    expect(mockDuelUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "duel-1" },
      data: { opponentReadyAt: expect.any(Date) },
    });
    expect(mockDuelUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "duel-1" },
      data: { startedAt: expect.any(Date), status: "active" },
    });
  });

  it("mode 2 transition seeds currentRoundIndex + currentRoundStartedAt", async () => {
    state.mode = "2";
    state.challengerReadyAt = new Date("2026-01-01T00:00:01Z");
    mockGetCurrentUser.mockResolvedValue(OPPONENT);

    const res = await POST(makePost(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(json.transitioned).toBe(true);
    expect(mockDuelUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "duel-1" },
      data: {
        startedAt: expect.any(Date),
        status: "active",
        currentRoundIndex: 0,
        currentRoundStartedAt: expect.any(Date),
      },
    });
  });

  it("returns 409 when duel status is not 'ready'", async () => {
    state.status = "active";
    mockGetCurrentUser.mockResolvedValue(CHALLENGER);

    const res = await POST(makePost(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("DUEL_NOT_STARTABLE");
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not a participant", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 99, username: "stranger", role: "user" });

    const res = await POST(makePost(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("NOT_PARTICIPANT");
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when duel not found", async () => {
    mockGetCurrentUser.mockResolvedValue(CHALLENGER);
    mockDuelFindUnique.mockResolvedValue(null);

    const res = await POST(makePost(), { params: Promise.resolve({ id: "nonexistent" }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("duel not found");
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makePost(), { params: Promise.resolve({ id: "duel-1" }) });
    expect(res.status).toBe(401);
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/duel/[id]/start (rescind readiness)", () => {
  let state: Record<string, unknown>;

  beforeEach(() => {
    state = { ...BASE_DUEL };
    mockDuelFindUnique.mockImplementation(() => Promise.resolve({ ...state }));
    mockDuelUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      state = { ...state, ...data };
      return { ...state };
    });
  });
  afterEach(() => vi.clearAllMocks());

  it("clears own readyAt while duel is still in ready", async () => {
    state.challengerReadyAt = new Date("2026-01-01T00:00:01Z");
    mockGetCurrentUser.mockResolvedValue(CHALLENGER);

    const res = await DELETE(makeDelete(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockDuelUpdate).toHaveBeenCalledWith({
      where: { id: "duel-1" },
      data: { challengerReadyAt: null },
    });
  });

  it("clears opponent's readyAt when opponent calls", async () => {
    state.opponentReadyAt = new Date("2026-01-01T00:00:01Z");
    mockGetCurrentUser.mockResolvedValue(OPPONENT);

    const res = await DELETE(makeDelete(), { params: Promise.resolve({ id: "duel-1" }) });
    expect(res.status).toBe(200);
    expect(mockDuelUpdate).toHaveBeenCalledWith({
      where: { id: "duel-1" },
      data: { opponentReadyAt: null },
    });
  });

  it("no-ops when duel already active (cannot rescind post-start)", async () => {
    state.status = "active";
    mockGetCurrentUser.mockResolvedValue(CHALLENGER);

    const res = await DELETE(makeDelete(), { params: Promise.resolve({ id: "duel-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.noop).toBe(true);
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await DELETE(makeDelete(), { params: Promise.resolve({ id: "duel-1" }) });
    expect(res.status).toBe(401);
    expect(mockDuelUpdate).not.toHaveBeenCalled();
  });
});
