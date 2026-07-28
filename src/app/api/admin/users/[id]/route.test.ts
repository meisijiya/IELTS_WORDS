import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserDelete = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      delete: (...args: unknown[]) => mockUserDelete(...args),
    },
  },
}));

import { DELETE } from "./route";

const ADMIN = { id: 1, role: "admin" };
const USER_TARGET = { id: 2, username: "tester", role: "user" };

function callDELETE(id: number | string, body?: unknown): Promise<Response> {
  return DELETE(new Request(`http://localhost/api/admin/users/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? { confirm: "DELETE USER" }),
  }), {
    params: Promise.resolve({ id: String(id) }),
  });
}

describe("DELETE /api/admin/users/[id]", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(ADMIN);
    mockUserFindUnique.mockResolvedValue(USER_TARGET);
    mockUserDelete.mockResolvedValue({ ...USER_TARGET });
  });
  afterEach(() => vi.clearAllMocks());

  it("admin deletes another user with confirm phrase → 200 + prisma.user.delete called", async () => {
    const res = await callDELETE(2);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deletedId: 2, deletedUsername: "tester" });
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  it("admin tries to delete self → 400 CANNOT_DELETE_SELF (no DB call)", async () => {
    const res = await callDELETE(1);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("CANNOT_DELETE_SELF");
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("missing confirm phrase → 400 CONFIRM_REQUIRED", async () => {
    const res = await callDELETE(2, {});
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("CONFIRM_REQUIRED");
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("wrong confirm phrase → 400 CONFIRM_REQUIRED", async () => {
    const res = await callDELETE(2, { confirm: "delete user" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("CONFIRM_REQUIRED");
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("target not found → 404", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await callDELETE(999);
    expect(res.status).toBe(404);
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("invalid id (non-numeric) → 400", async () => {
    const res = await callDELETE("abc");
    expect(res.status).toBe(400);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("invalid JSON body → 400", async () => {
    const res = await DELETE(
      new Request("http://localhost/api/admin/users/2", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      { params: Promise.resolve({ id: "2" }) },
    );
    expect(res.status).toBe(400);
  });

  it("non-admin → 403", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 2, role: "user" });
    const res = await callDELETE(3);
    expect(res.status).toBe(403);
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("unauthenticated → 401", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await callDELETE(2);
    expect(res.status).toBe(401);
    expect(mockUserDelete).not.toHaveBeenCalled();
  });
});