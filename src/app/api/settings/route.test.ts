import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must be registered before the module under test imports.
const mockIsAuthenticated = vi.fn();
const mockUserSettingsFindUnique = vi.fn();
const mockUserSettingsCreate = vi.fn();
const mockUserSettingsUpdate = vi.fn();
const mockWordUpdateMany = vi.fn();

vi.mock("@/lib/auth", () => ({
  isAuthenticated: () => mockIsAuthenticated(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    userSettings: {
      findUnique: (...args: unknown[]) => mockUserSettingsFindUnique(...args),
      create: (...args: unknown[]) => mockUserSettingsCreate(...args),
      update: (...args: unknown[]) => mockUserSettingsUpdate(...args),
    },
    word: {
      updateMany: (...args: unknown[]) => mockWordUpdateMany(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({
      userSettings: {
        update: (...args: unknown[]) => mockUserSettingsUpdate(...args),
      },
      word: {
        updateMany: (...args: unknown[]) => mockWordUpdateMany(...args),
      },
    }),
  },
}));

import { GET, PUT } from "./route";

const SINGLETON = {
  id: 1,
  flashMs: 800,
  fadeMs: 300,
  pronunciationMode: "both",
  pullPriority: "review",
  enablePronunciation: true,
  accent: "us",
  checkinRetentionDays: null,
  masteryThreshold: 5,
  flashSkipMinLevel: null,
  updatedAt: new Date(),
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/settings", () => {
  beforeEach(() => {
    mockIsAuthenticated.mockResolvedValue(true);
    mockUserSettingsFindUnique.mockResolvedValue(SINGLETON);
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
    mockIsAuthenticated.mockResolvedValue(true);
    mockUserSettingsFindUnique.mockResolvedValue(SINGLETON);
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SINGLETON,
      ...data,
    }));
    mockWordUpdateMany.mockResolvedValue({ count: 0 });
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
    mockIsAuthenticated.mockResolvedValue(true);
    mockUserSettingsFindUnique.mockResolvedValue(SINGLETON);
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SINGLETON,
      ...data,
    }));
    mockWordUpdateMany.mockResolvedValue({ count: 0 });
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
    mockIsAuthenticated.mockResolvedValue(false);
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
    mockIsAuthenticated.mockResolvedValue(true);
  });
  afterEach(() => vi.clearAllMocks());

  it("promotes words when threshold is lowered (5 → 3)", async () => {
    mockUserSettingsFindUnique.mockResolvedValue({
      ...SINGLETON,
      masteryThreshold: 5,
    });
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SINGLETON,
      ...data,
    }));
    mockWordUpdateMany.mockResolvedValue({ count: 17 });

    const res = await PUT(makeRequest({ masteryThreshold: 3 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.masteryThreshold).toBe(3);
    expect(json.promotedCount).toBe(17);
    expect(mockWordUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockWordUpdateMany).toHaveBeenCalledWith({
      where: { level: { gte: 3 }, masteredAt: null },
      data: { masteredAt: expect.any(Date) },
    });
  });

  it("does NOT promote when threshold is held (5 → 5)", async () => {
    mockUserSettingsFindUnique.mockResolvedValue({
      ...SINGLETON,
      masteryThreshold: 5,
    });
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SINGLETON,
      ...data,
    }));

    const res = await PUT(makeRequest({ masteryThreshold: 5 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.masteryThreshold).toBe(5);
    expect(json.promotedCount).toBeUndefined();
    expect(mockWordUpdateMany).not.toHaveBeenCalled();
  });

  it("does NOT promote when threshold is raised (5 → 8)", async () => {
    mockUserSettingsFindUnique.mockResolvedValue({
      ...SINGLETON,
      masteryThreshold: 5,
    });
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SINGLETON,
      ...data,
    }));

    const res = await PUT(makeRequest({ masteryThreshold: 8 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.masteryThreshold).toBe(8);
    expect(json.promotedCount).toBeUndefined();
    expect(mockWordUpdateMany).not.toHaveBeenCalled();
  });

  it("lowered + no eligible words returns promotedCount=0", async () => {
    mockUserSettingsFindUnique.mockResolvedValue({
      ...SINGLETON,
      masteryThreshold: 5,
    });
    mockUserSettingsUpdate.mockImplementation(async ({ data }) => ({
      ...SINGLETON,
      ...data,
    }));
    mockWordUpdateMany.mockResolvedValue({ count: 0 });

    const res = await PUT(makeRequest({ masteryThreshold: 3 }));
    const json = await res.json();

    expect(json.promotedCount).toBe(0);
  });
});
