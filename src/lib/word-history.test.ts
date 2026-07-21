import { describe, expect, it } from "vitest";
import { aggregateWordHistories, type DailyStat } from "./word-history";

describe("aggregateWordHistories", () => {
  // Fixed reference "now" so tests are deterministic.
  const NOW = new Date("2026-07-21T12:00:00Z");
  const daysAgo = (n: number) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() - n);
    d.setHours(10, 0, 0, 0);
    return d;
  };

  it("returns empty object when no attempts are provided", () => {
    const result = aggregateWordHistories([], NOW);
    expect(result).toEqual({});
  });

  it("produces one non-zero day + 29 zero days for a single attempt", () => {
    const result = aggregateWordHistories(
      [{ wordId: 1, correct: true, createdAt: daysAgo(3) }],
      NOW,
    );

    expect(result[1]).toBeDefined();
    expect(result[1]).toHaveLength(30);

    // day index 0 = oldest (29 days ago), index 29 = today
    // attempt was 3 days ago → index 26 (29 - 3 = 26)
    const stat = result[1]![26]!;
    expect(stat).toEqual<DailyStat>({
      date: "2026-07-18",
      correct: 1,
      total: 1,
    });

    // all other days: 0/0
    const zeroDays = result[1]!.filter((d) => d.total === 0);
    expect(zeroDays).toHaveLength(29);
    expect(zeroDays[0]!.date).toBe("2026-06-22");
    expect(zeroDays[28]!.date).toBe("2026-07-21");
  });

  it("merges multiple attempts on the same day for the same word", () => {
    const result = aggregateWordHistories(
      [
        { wordId: 7, correct: true, createdAt: daysAgo(1) },
        { wordId: 7, correct: false, createdAt: daysAgo(1) },
        { wordId: 7, correct: true, createdAt: daysAgo(1) },
      ],
      NOW,
    );

    expect(result[7]).toHaveLength(30);
    // day index 28 = yesterday
    expect(result[7]![28]).toEqual<DailyStat>({
      date: "2026-07-20",
      correct: 2,
      total: 3,
    });
  });

  it("drops attempts older than the 30-day window", () => {
    const result = aggregateWordHistories(
      [
        { wordId: 9, correct: true, createdAt: daysAgo(3) }, // in window
        { wordId: 9, correct: true, createdAt: daysAgo(31) }, // out
        { wordId: 9, correct: true, createdAt: daysAgo(60) }, // out
      ],
      NOW,
    );

    expect(result[9]).toHaveLength(30);
    // only the in-window attempt contributes
    const nonZero = result[9]!.filter((d) => d.total > 0);
    expect(nonZero).toHaveLength(1);
    expect(nonZero[0]!.correct).toBe(1);
    expect(nonZero[0]!.total).toBe(1);
  });
});