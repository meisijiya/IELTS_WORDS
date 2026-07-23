import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockUserSettingsFindUnique = vi.fn();
const mockUserSettingsUpsert = vi.fn();
const mockUserSettingsUpdate = vi.fn();
const mockUserWordUpdateMany = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  isAuthenticated: () => mockGetCurrentUser().then((u: unknown) => u !== null),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    userSettings: {
      findUnique: (...args: unknown[]) => mockUserSettingsFindUnique(...args),
      upsert: (...args: unknown[]) => mockUserSettingsUpsert(...args),
      update: (...args: unknown[]) => mockUserSettingsUpdate(...args),
    },
    userWord: {
      updateMany: (...args: unknown[]) => mockUserWordUpdateMany(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({
      userSettings: {
        update: (...args: unknown[]) => mockUserSettingsUpdate(...args),
      },
      userWord: {
        updateMany: (...args: unknown[]) => mockUserWordUpdateMany(...args),
      },
    }),
  },
}));

import { GET, PUT } from "./route";

const SETTINGS = {
  id: 1,
  userId: 1,
  flashMs: 800,
  fadeMs: 300,
  pronunciationMode: "both",
  pullPriority: "review",
  enablePronunciation: true,
  accent: "us",
  checkinRetentionDays: null,
  masteryThreshold: 5,
  flashSkipMinLevel: null,
  soundEnabled: true,
  updatedAt: new Date(),
};

const AUTH_USER = { id: 1, username: "admin", role: "admin" };

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/settings", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    mockUserSettingsUpsert.mockResolvedValue(SETTINGS);
  });
  afterEach(() => vi.clearAllMocks());

  it("returns the new fields alongside legacy ones", async () => {
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      masteryThreshold: 5,
      flashSkipMinLevel: null,
    });
  });
});

describe("PUT /api/settings — masteryThreshold clamping (AC3/AC4)", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    mockUserSettingsFindUnique.mockResolvedValue(SETTINGS);
    mockUserSettingsUpsert.mockResolvedValue(SETTINGS);
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SETTINGS,
      ...data,
    }));
    mockUserWordUpdateMany.mockResolvedValue({ count: 0 });
  });
  afterEach(() => vi.clearAllMocks());

  it("accepts a legal value (AC3)", async () => {
    const res = await PUT(makeRequest({ masteryThreshold: 3 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.masteryThreshold).toBe(3);
  });

  it("clamps below floor (1 → 2)", async () => {
    const res = await PUT(makeRequest({ masteryThreshold: 1 }));
    const json = await res.json();
    expect(json.masteryThreshold).toBe(2);
  });

  it("clamps above ceiling (99 → 20)", async () => {
    const res = await PUT(makeRequest({ masteryThreshold: 99 }));
    const json = await res.json();
    expect(json.masteryThreshold).toBe(20);
  });

  it("falls back to default (5) on non-numeric input", async () => {
    const res = await PUT(makeRequest({ masteryThreshold: "abc" }));
    const json = await res.json();
    expect(json.masteryThreshold).toBe(5);
  });

  it("falls back to default (5) on null input", async () => {
    const res = await PUT(makeRequest({ masteryThreshold: null }));
    const json = await res.json();
    expect(json.masteryThreshold).toBe(5);
  });
});

describe("PUT /api/settings — flashSkipMinLevel (AC3/AC4)", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    mockUserSettingsFindUnique.mockResolvedValue(SETTINGS);
    mockUserSettingsUpsert.mockResolvedValue(SETTINGS);
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SETTINGS,
      ...data,
    }));
    mockUserWordUpdateMany.mockResolvedValue({ count: 0 });
  });
  afterEach(() => vi.clearAllMocks());

  it("accepts null (off)", async () => {
    const res = await PUT(makeRequest({ flashSkipMinLevel: null }));
    const json = await res.json();
    expect(json.flashSkipMinLevel).toBeNull();
  });

  it("accepts a legal value", async () => {
    const res = await PUT(makeRequest({ flashSkipMinLevel: 3 }));
    const json = await res.json();
    expect(json.flashSkipMinLevel).toBe(3);
  });

  it("clamps below floor (0 → 1)", async () => {
    const res = await PUT(makeRequest({ flashSkipMinLevel: 0 }));
    const json = await res.json();
    expect(json.flashSkipMinLevel).toBe(1);
  });

  it("clamps above ceiling (9999 → 100)", async () => {
    const res = await PUT(makeRequest({ flashSkipMinLevel: 9999 }));
    const json = await res.json();
    expect(json.flashSkipMinLevel).toBe(100);
  });
});

describe("PUT /api/settings — auth", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(null);
  });
  afterEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const res = await PUT(makeRequest({ masteryThreshold: 3 }));
    expect(res.status).toBe(401);
    expect(mockUserSettingsUpdate).not.toHaveBeenCalled();
  });
});

describe("PUT /api/settings — eager promotion (AC5/AC6)", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
  });
  afterEach(() => vi.clearAllMocks());

  it("promotes words when threshold is lowered (5 → 3)", async () => {
    mockUserSettingsFindUnique.mockResolvedValue({ ...SETTINGS, masteryThreshold: 5 });
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SETTINGS,
      ...data,
    }));
    mockUserWordUpdateMany.mockResolvedValue({ count: 17 });

    const res = await PUT(makeRequest({ masteryThreshold: 3 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.masteryThreshold).toBe(3);
    expect(json.promotedCount).toBe(17);
    expect(mockUserWordUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUserWordUpdateMany).toHaveBeenCalledWith({
      where: { userId: 1, level: { gte: 3 }, masteredAt: null },
      data: { masteredAt: expect.any(Date) },
    });
  });

  it("does NOT promote when threshold is held (5 → 5)", async () => {
    mockUserSettingsFindUnique.mockResolvedValue({ ...SETTINGS, masteryThreshold: 5 });
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SETTINGS,
      ...data,
    }));

    const res = await PUT(makeRequest({ masteryThreshold: 5 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.masteryThreshold).toBe(5);
    expect(json.promotedCount).toBeUndefined();
    expect(mockUserWordUpdateMany).not.toHaveBeenCalled();
  });

  it("does NOT promote when threshold is raised (5 → 8)", async () => {
    mockUserSettingsFindUnique.mockResolvedValue({ ...SETTINGS, masteryThreshold: 5 });
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SETTINGS,
      ...data,
    }));

    const res = await PUT(makeRequest({ masteryThreshold: 8 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.masteryThreshold).toBe(8);
    expect(json.promotedCount).toBeUndefined();
    expect(mockUserWordUpdateMany).not.toHaveBeenCalled();
  });

  it("lowered + no eligible words returns promotedCount=0", async () => {
    mockUserSettingsFindUnique.mockResolvedValue({ ...SETTINGS, masteryThreshold: 5 });
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SETTINGS,
      ...data,
    }));
    mockUserWordUpdateMany.mockResolvedValue({ count: 0 });

    const res = await PUT(makeRequest({ masteryThreshold: 3 }));
    const json = await res.json();

    expect(json.promotedCount).toBe(0);
  });
});
