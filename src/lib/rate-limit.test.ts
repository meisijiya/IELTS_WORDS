import { describe, expect, it } from "vitest";
import { checkRate, recordFail, resetBucket } from "./rate-limit";

describe("rate limiter", () => {
  it("allows up to 5 failures per IP per window", () => {
    const ip = "1.2.3.4-test";
    resetBucket(ip);

    expect(checkRate(ip).allowed).toBe(true);
    recordFail(ip);
    expect(checkRate(ip).allowed).toBe(true);
    recordFail(ip);
    recordFail(ip);
    recordFail(ip);
    recordFail(ip);
    // 5 fails recorded, next check should be blocked
    expect(checkRate(ip).allowed).toBe(false);
  });

  it("resets on successful login", () => {
    const ip = "1.2.3.5-test";
    resetBucket(ip);
    recordFail(ip);
    recordFail(ip);
    expect(checkRate(ip).allowed).toBe(true);
    resetBucket(ip);
    expect(checkRate(ip).allowed).toBe(true);
  });
});