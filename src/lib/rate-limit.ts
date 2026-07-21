// In-memory rate limiter: per IP bucket, 5 failures in 60 s → 429.
// Single-process; sufficient for single-instance Docker deployment.
const FAIL_WINDOW_MS = 60_000;
const FAIL_THRESHOLD = 5;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function getIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function checkRate(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 0, resetAt: now + FAIL_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= FAIL_THRESHOLD) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFail(ip: string): void {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + FAIL_WINDOW_MS });
    return;
  }
  bucket.count++;
}

function resetBucket(ip: string): void {
  buckets.delete(ip);
}

export { checkRate, recordFail, resetBucket };