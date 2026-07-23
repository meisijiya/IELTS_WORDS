// Edge-safe password hashing using Web Crypto PBKDF2-SHA-256.
//
// Storage format: "saltB64.hashB64" (both standard base64). 100k iterations
// is the lower end of the OWASP 2023 recommendation for PBKDF2-SHA-256 and
// runs in ~50ms on Edge — fine for interactive login. Bump iterations if
// attackers get fast.
//
// Verification is constant-time on the hash bytes (we compare the stored
// string exactly so any byte mismatch fails cleanly; using `===` on the
// fixed-length string is good enough for this surface).

const ITERATIONS = 100_000;
const KEY_LEN_BITS = 256;

function b64(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return deriveAndEncode(password, salt);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(".");
  if (parts.length !== 2) return false;
  const [saltB64, hashB64] = parts;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = b64decode(saltB64);
    expected = b64decode(hashB64);
  } catch {
    return false;
  }
  const actual = await deriveBits(password, salt);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function deriveBits(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
    passwordKey,
    KEY_LEN_BITS,
  );
  return new Uint8Array(bits);
}

async function deriveAndEncode(password: string, salt: Uint8Array): Promise<string> {
  const bits = await deriveBits(password, salt);
  return `${b64(salt)}.${b64(bits)}`;
}
