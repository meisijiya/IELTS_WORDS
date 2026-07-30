// Pick the first example sentence for "sentence mode" practice UI.
// Pure function — no Prisma, no I/O. Safe to call from Edge / client components.

export interface Example {
  en: string;
  zh: string;
  source?: string;
}

/**
 * Return the first well-formed example from `examples`, or null.
 * Defensive: any non-array input, empty array, or malformed first item
 * returns null so callers can fall back to bare-word flash without
 * crashing the practice page.
 */
export function pickSentence(examples: unknown): Example | null {
  if (!Array.isArray(examples) || examples.length === 0) return null;
  const first = examples[0] as { en?: unknown; zh?: unknown; source?: unknown };
  if (typeof first?.en !== "string" || first.en.length === 0) return null;
  if (typeof first?.zh !== "string" || first.zh.length === 0) return null;
  return {
    en: first.en,
    zh: first.zh,
    source: typeof first.source === "string" ? first.source : undefined,
  };
}
