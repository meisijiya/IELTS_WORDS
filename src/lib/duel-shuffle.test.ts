import { describe, expect, it } from "vitest";
import { shuffleWithSeed } from "./duel-shuffle";

describe("shuffleWithSeed", () => {
  it("returns a new array of the same length", () => {
    const arr = [1, 2, 3, 4, 5];
    const out = shuffleWithSeed(arr, "seed-a");
    expect(out).toHaveLength(arr.length);
  });

  it("does not mutate the input array", () => {
    const arr = [1, 2, 3, 4, 5];
    const snapshot = [...arr];
    shuffleWithSeed(arr, "seed-a");
    expect(arr).toEqual(snapshot);
  });

  it("contains the same multiset of elements", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffleWithSeed(arr, "seed-a");
    expect([...out].sort((a, b) => a - b)).toEqual([...arr].sort((a, b) => a - b));
  });

  it("is deterministic: same seed yields same order", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = shuffleWithSeed(arr, "duel-abc");
    const b = shuffleWithSeed(arr, "duel-abc");
    expect(a).toEqual(b);
  });

  it("different seeds produce different orders (probabilistic)", () => {
    const arr = Array.from({ length: 20 }, (_, i) => i);
    const a = shuffleWithSeed(arr, "seed-a");
    const b = shuffleWithSeed(arr, "seed-b");
    expect(a).not.toEqual(b);
  });

  it("accepts a numeric seed", () => {
    const arr = [1, 2, 3, 4, 5];
    const a = shuffleWithSeed(arr, 12345);
    const b = shuffleWithSeed(arr, 12345);
    expect(a).toEqual(b);
  });

  it("handles empty array", () => {
    expect(shuffleWithSeed([], "any-seed")).toEqual([]);
  });

  it("handles single-element array", () => {
    expect(shuffleWithSeed([42], "any-seed")).toEqual([42]);
  });

  it("handles two-element array (either order is valid)", () => {
    const arr = ["a", "b"];
    const out = shuffleWithSeed(arr, "seed-x");
    expect([...out].sort()).toEqual(["a", "b"]);
    expect(out).toHaveLength(2);
  });
});