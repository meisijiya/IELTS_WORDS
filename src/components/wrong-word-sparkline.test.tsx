import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WrongWordSparkline } from "./wrong-word-sparkline";

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
});