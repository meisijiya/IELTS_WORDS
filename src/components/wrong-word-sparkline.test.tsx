import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WrongWordSparkline, findNearestIndex } from "./wrong-word-sparkline";

// Helper: build a 30-day window where every day has 0 attempts.
function zeroDays(): import("@/lib/word-history").DailyStat[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(2026, 5, 22 + i); // June 22, 2026 + i days
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date: key, correct: 0, total: 0 };
  });
}

// Helper: build a 30-day window with a single non-zero day.
function withAttempts(): import("@/lib/word-history").DailyStat[] {
  const days = zeroDays();
  // pick day index 26 (3 days from the end of the 30-day window)
  days[26] = { date: days[26]!.date, correct: 1, total: 1 };
  return days;
}

describe("WrongWordSparkline", () => {
  it("renders an svg with a path when data has attempts", () => {
    const html = renderToStaticMarkup(<WrongWordSparkline data={withAttempts()} />);
    expect(html).toContain("<svg");
    expect(html).toContain("<path");
    expect(html).toContain('stroke-width="1.5"');
  });

  it("renders placeholder span (no svg) when data is empty", () => {
    const html = renderToStaticMarkup(<WrongWordSparkline data={[]} />);
    expect(html).not.toContain("<svg");
    expect(html).toContain("近 30 天无练习记录");
  });

  it("renders placeholder span (no svg) when all days have zero attempts", () => {
    const html = renderToStaticMarkup(<WrongWordSparkline data={zeroDays()} />);
    expect(html).not.toContain("<svg");
    expect(html).toContain("近 30 天无练习记录");
  });

  it("does not render tooltip in initial (no-hover) state", () => {
    const html = renderToStaticMarkup(<WrongWordSparkline data={withAttempts()} />);
    // No guide line, no dot, no tooltip text in initial render
    expect(html).not.toContain("2026-07-18"); // date of the only attempt
    expect(html).not.toMatch(/<line/);
    expect(html).not.toMatch(/<circle/);
  });
});

describe("findNearestIndex", () => {
  const data = zeroDays();

  it("returns -1 for empty data", () => {
    expect(findNearestIndex(50, [])).toBe(-1);
  });

  it("clamps to first index when x < 0", () => {
    expect(findNearestIndex(-100, data)).toBe(0);
  });

  it("clamps to last index when x > viewBox width", () => {
    expect(findNearestIndex(500, data)).toBe(29);
  });

  it("rounds to nearest data point", () => {
    // 30 points across 120 units → dx ≈ 4.14; index = round(x / 4.14)
    expect(findNearestIndex(0, data)).toBe(0);
    expect(findNearestIndex(4.14, data)).toBe(1);
    expect(findNearestIndex(60, data)).toBe(14);
    expect(findNearestIndex(116, data)).toBe(28);
    expect(findNearestIndex(120, data)).toBe(29);
  });
});