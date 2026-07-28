/**
 * Seeded deterministic shuffle for Duel word list generation.
 *
 * Two players in the same Duel must see the same word sequence in the same order,
 * so the shuffle must be deterministic. We use a Fisher–Yates pass driven by
 * Mulberry32 (a tiny seeded PRNG) seeded from a string-hashed duel id.
 */

/** Hash a string into a 32-bit unsigned integer. Stable across runs. */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0; // FNV-1a offset
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Convert a numeric seed to a 32-bit unsigned integer. */
function normalizeSeed(seed: number): number {
  return seed >>> 0;
}

/** Mulberry32 PRNG: returns a function that yields uniform floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Return a new array containing the elements of `arr` in a deterministically
 * shuffled order. Same seed + same input → same output. Input is not mutated.
 */
export function shuffleWithSeed<T>(arr: readonly T[], seed: string | number): T[] {
  const out = arr.slice();
  if (out.length <= 1) return out;

  const numericSeed =
    typeof seed === "number" ? normalizeSeed(seed) : hashSeed(seed);
  const rand = mulberry32(numericSeed);

  // Fisher–Yates (in-place on the copy)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}