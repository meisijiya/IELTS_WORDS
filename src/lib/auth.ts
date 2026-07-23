// Web Crypto API for Edge-runtime compatibility (middleware runs on Edge).
//
// Session cookie carries { userId, role, iat, exp } signed by HMAC-SHA256.
// The signature is verifiable on Edge (no DB), but `getCurrentUser` does
// the DB lookup on Node runtime (RSC / route handlers) to attach the
// authorized user to a request.

export const SESSION_COOKIE_NAME = "yasi_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }
  return s;
}

function b64urlEncode(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): ArrayBuffer {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function hmacSign(payloadB64: string): Promise<string> {
  const key = await importKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  );
  return b64urlEncode(new Uint8Array(sig));
}

async function hmacVerify(payloadB64: string, sigB64: string): Promise<boolean> {
  try {
    const key = await importKey();
    return await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sigB64),
      new TextEncoder().encode(payloadB64)
    );
  } catch {
    return false;
  }
}

export interface SessionPayload {
  userId: number;
  role: string;
  iat: number;
  exp: number;
}

export async function createSessionCookie(
  userId: number,
  role: string,
): Promise<string> {
  const payload: SessionPayload = {
    userId,
    role,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = b64urlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const sig = await hmacSign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifySessionPayload(
  cookieValue: string | undefined,
): Promise<SessionPayload | null> {
  if (!cookieValue) return null;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return null;
  if (!(await hmacVerify(payloadB64, sig))) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(new Uint8Array(b64urlDecode(payloadB64))),
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    if (typeof payload.userId !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifySessionCookie(
  cookieValue: string | undefined,
): Promise<boolean> {
  return (await verifySessionPayload(cookieValue)) !== null;
}

export interface CurrentUser {
  id: number;
  username: string;
  role: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Dynamic import so the prisma client (Node-only) is not pulled into
  // Edge-runtime bundles that only use verifySessionCookie.
  const { cookies } = await import("next/headers");
  const { prisma } = await import("@/lib/db");
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionPayload(cookie);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, username: true, role: true },
  });
  return user;
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}
