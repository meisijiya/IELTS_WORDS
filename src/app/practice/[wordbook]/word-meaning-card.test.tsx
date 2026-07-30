import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { WordMeaningCard } from "./word-meaning-card";

const base = {
  pos: "n." as string | null,
  glosses: [{ pos: "n.", meaning: "大气层" }],
  level: 2,
  attempts: 5,
  correct: 3,
  masteryThreshold: 5,
  masteredAt: null as string | null,
};

describe("WordMeaningCard (S8)", () => {
  it("renders pos in monospace and Chinese meaning", () => {
    const html = renderToString(<WordMeaningCard {...base} />);
    expect(html).toContain("大气层");
    expect(html).toContain("font-mono");
  });

  it("renders meta row with level pill and attempt counts when not mastered", () => {
    const html = renderToString(<WordMeaningCard {...base} />).replace(
      /<!--[^>]*-->/g,
      "",
    );
    expect(html).toContain("等级 2 / 5");
    expect(html).toContain("已答对 3 次");
    expect(html).toContain("总尝试 5");
  });

  it("renders mastered pill when masteredAt is set", () => {
    const html = renderToString(
      <WordMeaningCard
        {...base}
        masteredAt="2026-01-01T00:00:00.000Z"
        attempts={5}
        correct={5}
      />,
    );
    expect(html).toContain("已熟练");
  });

  it("renders new-word pill when attempts=0", () => {
    const html = renderToString(
      <WordMeaningCard {...base} attempts={0} correct={0} />,
    );
    expect(html).toContain("新词");
  });
});