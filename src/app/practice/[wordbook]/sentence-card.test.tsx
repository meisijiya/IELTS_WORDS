import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createRef } from "react";
import { SentenceCard } from "./sentence-card";

const stripComments = (s: string) => s.replace(/<!--[^>]*-->/g, "");

describe("SentenceCard (S7)", () => {
  it("typing phase masks the target word and shows Chinese always", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="bank"
          sentence={{ en: "I went to the bank yesterday.", zh: "我昨天去了银行。" }}
          phase="typing"
          hintPositions={new Set([0])}
        />,
      ),
    );
    expect(html).toContain("I went to the");
    expect(html).toContain("我昨天去了银行");
    expect(html).toContain(">b<");
    const underscoreCount = (html.match(/>_</g) ?? []).length;
    expect(underscoreCount).toBe(3);
    expect(html).not.toContain("animate-revealPulse");
    expect(html).not.toContain("bg-success-soft");
  });

  it("feedback phase reveals the word, shows Chinese, triggers reveal animation", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="bank"
          sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
          phase="feedback"
        />,
      ),
    );
    expect(html).toContain(">b<");
    expect(html).toContain(">a<");
    expect(html).toContain(">n<");
    expect(html).toContain(">k<");
    expect(html).not.toMatch(/b_{3,}/);
    expect(html).toContain("我去了银行");
    expect(html).toContain("animate-revealPulse");
    expect(html).toContain("bg-success-soft");
  });

  it("returns null when sentence is null (caller falls back to bare flash)", () => {
    const html = renderToString(
      <SentenceCard spelling="bank" sentence={null} phase="typing" />,
    );
    expect(html).toBe("");
  });

  it("strips literal <b> tags and renders masked content as accent block", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="upgrade"
          sentence={{ en: "How do we know when to invest in an <b>u______</b>?", zh: "我们怎么知道何时升级？" }}
          phase="typing"
        />,
      ),
    );
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("</b>");
    expect(html).toContain("bg-accent");
    expect(html).not.toContain("u______");
  });

  it("strips <b> wrapping the FULL word (does not leak answer in typing phase)", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="atmosphere"
          sentence={{ en: "The <b>atmosphere</b> was electric.", zh: "气氛很热烈。" }}
          phase="typing"
          hintPositions={new Set([0])}
        />,
      ),
    );
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("</b>");
    expect(html).toContain(">a<");
    expect(html).not.toContain(">atmosphere<");
  });

  it("feedback phase reveals the actual spelling, not the <b> content", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="atmosphere"
          sentence={{ en: "The <b>atmosphere</b> was electric.", zh: "气氛很热烈。" }}
          phase="feedback"
        />,
      ),
    );
    expect(html).toContain(">a<");
    expect(html).toContain(">t<");
    expect(html).toContain(">m<");
    expect(html).toContain(">o<");
    expect(html).toContain(">s<");
    expect(html).toContain(">p<");
    expect(html).toContain(">h<");
    expect(html).toContain(">e<");
    expect(html).toContain(">r<");
    expect(html).toContain("气氛很热烈");
  });

  it("falls back to spelling-aware splitter when no <b> tags present", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="bank"
          sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
          phase="typing"
          hintPositions={new Set([0])}
        />,
      ),
    );
    expect(html).toContain("I went to the");
    expect(html).toContain(">b<");
    const underscoreCount = (html.match(/>_</g) ?? []).length;
    expect(underscoreCount).toBe(3);
  });

  it("typing phase: typed input syncs to mask, replacing _ at non-hint positions", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="bank"
          sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
          phase="typing"
          userTyped="ba"
        />,
      ),
    );
    expect(html).toContain("I went to the");
    expect(html).toContain(">b<");
    expect(html).toContain(">a<");
    expect(html).not.toContain(">n<");
    expect(html).not.toContain(">k<");
    expect(html).toContain(">_<");
    const underscoreCount = (html.match(/>_</g) ?? []).length;
    expect(underscoreCount).toBe(2);
  });

  it("typing phase: hint position shows hint char when user hasn't typed", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="proceed"
          sentence={{ en: "Let us proceed.", zh: "让我们继续。" }}
          phase="typing"
          hintPositions={new Set([0])}
        />,
      ),
    );
    expect(html).toContain("Let us");
    expect(html).toContain(">p<");
    expect(html).toContain(">_<");
    const underscoreCount = (html.match(/>_</g) ?? []).length;
    expect(underscoreCount).toBe(6);
  });

  it("typing phase: user override of hint char with wrong value shows in red + line-through", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="proceed"
          sentence={{ en: "Let us proceed.", zh: "让我们继续。" }}
          phase="typing"
          userTyped="xroceed"
          hintPositions={new Set([0])}
        />,
      ),
    );
    expect(html).toMatch(/text-error.*line-through/);
  });

  it("typing phase: hint position with correct override still shows accent", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="proceed"
          sentence={{ en: "Let us proceed.", zh: "让我们继续。" }}
          phase="typing"
          userTyped="proceed"
          hintPositions={new Set([0])}
        />,
      ),
    );
    expect(html).toContain(">p<");
    expect(html).toContain(">r<");
    expect(html).toContain(">o<");
    expect(html).toContain(">c<");
    expect(html).toContain(">e<");
    expect(html).toContain(">d<");
    expect(html).not.toMatch(/text-error/);
  });

  it("typing phase + showExpected: renders full spelling in flash window (hint positions bright white, others dim)", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="bank"
          sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
          phase="typing"
          hintPositions={new Set([0])}
          showExpected={true}
        />,
      ),
    );
    // Full spelling rendered (every letter present, no underscore placeholders)
    expect(html).toContain(">b<");
    expect(html).toContain(">a<");
    expect(html).toContain(">n<");
    expect(html).toContain(">k<");
    const underscoreCount = (html.match(/>_</g) ?? []).length;
    expect(underscoreCount).toBe(0);
    // Hint position 0 ("b") uses bright text-white (NOT text-accent — same
    // color as the bg-accent pill background would be invisible there).
    expect(html).toMatch(/text-white[^>]*>b</);
    // Non-hint positions use dim text-white/70
    expect(html).toMatch(/text-white\/70[^>]*>a</);
    expect(html).toMatch(/text-white\/70[^>]*>n</);
    expect(html).toMatch(/text-white\/70[^>]*>k</);
    // No feedback-phase colors leak in
    expect(html).not.toContain("text-success");
    expect(html).not.toContain("text-error");
    expect(html).not.toContain("animate-revealPulse");
    expect(html).not.toContain("animate-shake");
  });

  it("typing phase + showExpected=false (default): still masks as before (no regression)", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="bank"
          sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
          phase="typing"
          hintPositions={new Set([0])}
        />,
      ),
    );
    const underscoreCount = (html.match(/>_</g) ?? []).length;
    expect(underscoreCount).toBe(3);
  });

  it("renders dark-mode CSS classes for the card container", () => {
    const html = renderToString(
      <SentenceCard
        spelling="bank"
        sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
        phase="typing"
        hintPositions={new Set([0])}
      />,
    );
    expect(html).toContain("from-white");
    expect(html).toContain("dark:from-slate-900");
  });

  it("feedback phase with wrong answer shows red reveal + shake (not green)", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="sprinkle"
          sentence={{ en: "Sprinkle onion and cheese in the pie plate.", zh: "把洋葱和干酪撒在饼盅中。" }}
          phase="feedback"
          isCorrect={false}
          userTyped="sprnkle"
        />,
      ),
    );
    expect(html).toContain("text-error");
    expect(html).toContain("animate-shake");
    expect(html).not.toContain("animate-revealPulse");
    expect(html).not.toContain("bg-success-soft");
    expect(html).toContain(">s<");
    expect(html).toContain(">p<");
    expect(html).toContain(">r<");
    expect(html).toContain(">i<");
    expect(html).toContain(">n<");
    expect(html).toContain(">k<");
    expect(html).toContain(">l<");
    expect(html).toContain(">e<");
    expect(html).not.toContain("你打的");
    expect(html).toContain("data-testid=\"sentence-revealed-wrong\"");
  });

  it("feedback phase with correct answer shows green reveal (unchanged)", () => {
    const html = stripComments(
      renderToString(
        <SentenceCard
          spelling="bank"
          sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
          phase="feedback"
          isCorrect={true}
        />,
      ),
    );
    expect(html).toContain("text-success");
    expect(html).toContain("animate-revealPulse");
    expect(html).toContain("data-testid=\"sentence-revealed\"");
    expect(html).not.toContain("text-error");
    expect(html).not.toContain("animate-shake");
  });

  describe("interactive pill (in-pill input overlay)", () => {
    it("typing phase + handlers provided: renders transparent <input> overlay inside the pill", () => {
      const html = stripComments(
        renderToString(
          <SentenceCard
            spelling="bank"
            sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
            phase="typing"
            hintPositions={new Set([0])}
            inputRef={createRef<HTMLInputElement>()}
            onInputChange={() => {}}
            onInputKeyDown={() => {}}
            onInputFocus={() => {}}
            onInputBlur={() => {}}
          />,
        ),
      );
      // Overlay input rendered with absolute positioning + transparent text
      expect(html).toMatch(/<input[^>]*type="text"[^>]*absolute[^>]*text-transparent/);
      expect(html).toContain('aria-label="拼写 bank"');
      expect(html).toContain(">b<");
      expect(html).toMatch(/>_</);
      // No feedback-phase animations or colors leak in
      expect(html).not.toContain("animate-revealPulse");
      expect(html).not.toContain("animate-shake");
    });

    it("feedback phase: input overlay stays mounted but readOnly (mirrors DiffRow)", () => {
      const html = stripComments(
        renderToString(
          <SentenceCard
            spelling="bank"
            sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
            phase="feedback"
            inputRef={createRef<HTMLInputElement>()}
            onInputChange={() => {}}
            onInputKeyDown={() => {}}
          />,
        ),
      );
      expect(html).toMatch(/<input[^>]*aria-label="拼写 bank"/);
      expect(html).toMatch(/readOnly/i);
      expect(html).toContain("text-success");
      expect(html).toContain("animate-revealPulse");
    });

    it("typing phase WITHOUT handlers: pill is read-only (no input overlay)", () => {
      // Defensive: legacy callers / tests that don't pass handlers should
      // still render a static pill. Without overlay, no keyboard can open.
      const html = stripComments(
        renderToString(
          <SentenceCard
            spelling="bank"
            sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
            phase="typing"
            hintPositions={new Set([0])}
          />,
        ),
      );
      expect(html).not.toMatch(/<input/);
      expect(html).toContain(">b<");
    });
  });

  describe("speaker replay button", () => {
    it("renders a speaker button next to '例句' when onReplayAudio is provided", () => {
      const html = stripComments(
        renderToString(
          <SentenceCard
            spelling="bank"
            sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
            phase="typing"
            onReplayAudio={() => {}}
          />,
        ),
      );
      expect(html).toContain("例句");
      expect(html).toContain('aria-label="播放发音"');
      expect(html).toContain("<button");
    });

    it("omits the speaker button when onReplayAudio is not provided", () => {
      const html = stripComments(
        renderToString(
          <SentenceCard
            spelling="bank"
            sentence={{ en: "I went to the bank.", zh: "我去了银行。" }}
            phase="typing"
          />,
        ),
      );
      expect(html).toContain("例句");
      expect(html).not.toContain('aria-label="播放发音"');
    });
  });
});
