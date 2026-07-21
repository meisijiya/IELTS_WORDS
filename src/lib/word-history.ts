export interface DailyStat {
  /** ISO-style local date key, e.g. "2026-07-21". Oldest first in the returned array. */
  date: string;
  correct: number;
  total: number;
}

/** Minimal shape we need from `Attempt` rows; matches Prisma select used by the page. */
export interface AttemptLite {
  wordId: number;
  correct: boolean;
  createdAt: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Build per-word 30-day daily accuracy histories from raw attempt rows.
 *
 * Returns a map: wordId → array of 30 `DailyStat`s, oldest first.
 * Days with zero attempts are still present (correct=0, total=0) so
 * the sparkline has a contiguous 30-point x axis.
 *
 * `now` is the right edge of the window. The window is inclusive of
 * `startOfDay(now) - 29 days` through `startOfDay(now)`.
 */
export function aggregateWordHistories(
  attempts: AttemptLite[],
  now: Date,
): Record<number, DailyStat[]> {
  const today = startOfDay(now);
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 29);

  // Pre-build the 30-day template (oldest first).
  const template: DailyStat[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + i);
    template.push({ date: dayKey(d), correct: 0, total: 0 });
  }
  const dayIndexByKey = new Map(template.map((d, i) => [d.date, i]));

  const byWord = new Map<number, DailyStat[]>();
  for (const a of attempts) {
    const key = dayKey(a.createdAt);
    const idx = dayIndexByKey.get(key);
    if (idx === undefined) continue; // outside 30-day window
    let arr = byWord.get(a.wordId);
    if (!arr) {
      arr = template.map((d) => ({ ...d }));
      byWord.set(a.wordId, arr);
    }
    const slot = arr[idx]!;
    slot.total += 1;
    if (a.correct) slot.correct += 1;
  }

  const result: Record<number, DailyStat[]> = {};
  for (const [k, v] of byWord) result[k] = v;
  return result;
}