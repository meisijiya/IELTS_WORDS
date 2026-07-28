import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockHashPassword = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock("@/lib/password", () => ({
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
}));

import { POST } from "./route";

const ADMIN = { id: 1, role: "admin" };
const TARGET = { id: 2, username: "tester", role: "user" };

function callPOST(id: number | string, body?: unknown): Promise<Response> {
  return POST(new Request(`http://localhost/api/admin/users/${id}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? { confirm: "RESET PASSWORD", newPassword: "new-strong-pw" }),
  }), {
    params: Promise.resolve({ id: String(id) }),
  });
}

describe("POST /api/admin/users/[id]/reset-password", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(ADMIN);
    mockUserFindUnique.mockResolvedValue(TARGET);
    mockHashPassword.mockResolvedValue("hashed:new-strong-pw");
    mockUserUpdate.mockResolvedValue({ ...TARGET, passwordHash: "hashed:new-strong-pw" });
  });
  afterEach(() => vi.clearAllMocks());

  it("admin resets password with confirm phrase + valid newPassword → 200 + hash updated", async () => {
    const res = await callPOST(2);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, userId: 2, username: "tester" });
    expect(mockHashPassword).toHaveBeenCalledWith("new-strong-pw");
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { passwordHash: "hashed:new-strong-pw" },
    });
  });

  it("missing confirm phrase → 400 CONFIRM_REQUIRED (no hash, no update)", async () => {
    const res = await callPOST(2, { newPassword: "new-strong-pw" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("CONFIRM_REQUIRED");
    expect(mockHashPassword).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("wrong confirm phrase → 400", async () => {
    const res = await callPOST(2, { confirm: "reset password", newPassword: "new-strong-pw" });
    expect(res.status).toBe(400);
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it("missing newPassword → 400", async () => {
    const res = await callPOST(2, { confirm: "RESET PASSWORD" });
    expect(res.status).toBe(400);
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it("weak newPassword (<6 chars) → 400", async () => {
    const res = await callPOST(2, { confirm: "RESET PASSWORD", newPassword: "abc" });
    expect(res.status).toBe(400);
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it("target not found → 404", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await callPOST(999);
    expect(res.status).toBe(404);
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it("invalid id (non-numeric) → 400", async () => {
    const res = await callPOST("xyz");
    expect(res.status).toBe(400);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("invalid JSON body → 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/users/2/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      { params: Promise.resolve({ id: "2" }) },
    );
    expect(res.status).toBe(400);
  });

  it("non-admin → 403", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 2, role: "user" });
    const res = await callPOST(3);
    expect(res.status).toBe(403);
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it("unauthenticated → 401", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await callPOST(2);
    expect(res.status).toBe(401);
  });

  it("admin can reset own password (no self-block)", async () => {
    const res = await callPOST(1);
    expect(res.status).toBe(200);
    expect(mockHashPassword).toHaveBeenCalled();
  });
});