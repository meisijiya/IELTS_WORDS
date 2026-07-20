// Web Crypto API for Edge-runtime compatibility (middleware runs on Edge).

export const SESSION_COOKIE_NAME = "yasi_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }
  return s;
}

function getAdminPassword(): string {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) throw new Error("ADMIN_PASSWORD must be set");
  return p;
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

export function checkPassword(input: string): boolean {
  const expected = new TextEncoder().encode(getAdminPassword());
  const actual = new TextEncoder().encode(input);
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected[i] ^ actual[i];
  }
  return diff === 0;
}

export async function createSessionCookie(): Promise<string> {
  const payload = {
    sub: "admin",
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = b64urlEncode(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const sig = await hmacSign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifySessionCookie(
  cookieValue: string | undefined
): Promise<boolean> {
  if (!cookieValue) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  if (!(await hmacVerify(payloadB64, sig))) return false;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(new Uint8Array(b64urlDecode(payloadB64)))
    );
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);
    return await verifySessionCookie(cookie?.value);
  } catch {
    return false;
  }
}