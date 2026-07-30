// Defensive parser for Word.examples JSON column.
// Word.examples is a String? (JSON-encoded [{en, zh, source?}]).
// Returns [] on null / empty / malformed / non-array input — never throws.

export interface ExampleDto {
  en: string;
  zh: string;
  source?: string;
}

export function parseExamples(raw: string | null): ExampleDto[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
