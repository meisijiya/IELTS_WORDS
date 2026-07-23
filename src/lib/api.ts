// API-side helpers. Server-side only (uses prisma + next/headers).

import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";

export class ApiAuthError extends Error {
  constructor() {
    super("未授权");
    this.name = "ApiAuthError";
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiAuthError();
  return user;
}

export function authErrorResponse() {
  return NextResponse.json({ error: "未授权" }, { status: 401 });
}
