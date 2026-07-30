import { describe, expect, it } from "vitest";
import { checkAnswer, cleanInput, shouldSkipFlash } from "./practice-client";

describe("cleanInput", () => {
  it("strips punctuation + digits; keeps letters, spaces, hyphens, apostrophes", () => {
    expect(cleanInput("heart! attack?", 13)).toBe("heart attack");
    expect(cleanInput("a1b2c3", 6)).toBe("abc");
    expect(cleanInput("hello-world", 11)).toBe("hello-world");
    expect(cleanInput("it's", 4)).toBe("it's");
    expect(cleanInput("eco-friendly", 12)).toBe("eco-friendly");
    expect(cleanInput("south-east", 10)).toBe("south-east");
  });

  it("preserves spaces inside the input (compound words)", () => {
    expect(cleanInput("heart attack", 12)).toBe("heart attack");
    expect(cleanInput("carbon dioxide", 14)).toBe("carbon dioxide");
    expect(cleanInput("up to date", 10)).toBe("up to date");
  });

  it("caps to maxLen", () => {
    expect(cleanInput("abcdefghij", 5)).toBe("abcde");
    expect(cleanInput("heart attack extra", 12)).toBe("heart attack");
    expect(cleanInput("eco-friendly", 5)).toBe("eco-f");
  });

  it("trims leading whitespace but preserves trailing + internal spaces", () => {
    expect(cleanInput("  heart", 10)).toBe("heart");
    expect(cleanInput("  heart attack  ", 20)).toBe("heart attack  ");
    // Trailing space stays visible so user can see their input;
    // checkAnswer will judge it wrong and they'll delete it.
    expect(cleanInput("heart attack ", 13)).toBe("heart attack ");
  });

  it("handles empty input", () => {
    expect(cleanInput("", 5)).toBe("");
  });
});

describe("shouldSkipFlash (AC13)", () => {
  it("returns false when flashSkipMinLevel is null (off)", () => {
    expect(shouldSkipFlash(null, 0)).toBe(false);
    expect(shouldSkipFlash(null, 4)).toBe(false);
  });

  it("returns true when current level >= threshold", () => {
    expect(shouldSkipFlash(3, 3)).toBe(true);
    expect(shouldSkipFlash(3, 4)).toBe(true);
  });

  it("returns false when current level < threshold", () => {
    expect(shouldSkipFlash(3, 0)).toBe(false);
    expect(shouldSkipFlash(3, 2)).toBe(false);
  });

  it("threshold=1 always skips (except level 0)", () => {
    expect(shouldSkipFlash(1, 0)).toBe(false);
    expect(shouldSkipFlash(1, 1)).toBe(true);
    expect(shouldSkipFlash(1, 5)).toBe(true);
  });
});

describe("checkAnswer", () => {
  it("exact match without hints", () => {
    expect(checkAnswer("proceed", "proceed", new Set())).toBe(true);
  });

  it("rejects wrong char without hints", () => {
    expect(checkAnswer("proceed", "wroceed", new Set())).toBe(false);
  });

  it("rejects length mismatch", () => {
    expect(checkAnswer("proceed", "proce", new Set())).toBe(false);
    expect(checkAnswer("proceed", "proceeds", new Set())).toBe(false);
  });

  it("case-insensitive", () => {
    expect(checkAnswer("Proceed", "PROCEED", new Set())).toBe(true);
  });

  it("skipped hint at position 0 lets user type remaining chars", () => {
    expect(checkAnswer("proceed", "roceed", new Set([0]))).toBe(true);
  });

  it("user override of hint char with wrong value is rejected", () => {
    expect(checkAnswer("proceed", "wroceed", new Set([0]))).toBe(false);
  });

  it("user override of hint char with correct value is accepted", () => {
    expect(checkAnswer("proceed", "proceed", new Set([0]))).toBe(true);
  });

  it("multiple hints all skipped: user types non-hint positions in order", () => {
    expect(checkAnswer("planet", "let", new Set([0, 2, 3]))).toBe(true);
  });

  it("wrong non-hint char rejected", () => {
    expect(checkAnswer("planet", "let", new Set([0, 2]))).toBe(false);
  });

  it("user override with wrong char rejected", () => {
    expect(checkAnswer("proceed", "xprocee", new Set([0]))).toBe(false);
  });

  it("user types hint char correctly + completes all non-hint positions: TRUE", () => {
    expect(checkAnswer("bank", "ban", new Set([0, 3]))).toBe(true);
  });

  it("user types hint char correctly + typo at non-hint position: FALSE", () => {
    expect(checkAnswer("bank", "bbn", new Set([0, 3]))).toBe(false);
  });

  it("user types hint char correctly + missing non-hint position: FALSE", () => {
    expect(checkAnswer("bank", "bn", new Set([0, 3]))).toBe(false);
  });

  it("user overrides hint char with WRONG value: FALSE", () => {
    expect(checkAnswer("bank", "xan", new Set([0, 3]))).toBe(false);
  });

  it("all positions are hints: user types one correct char: TRUE", () => {
    expect(checkAnswer("bank", "b", new Set([0, 1, 2, 3]))).toBe(true);
  });

  it("all positions are hints: user types nothing: TRUE", () => {
    expect(checkAnswer("bank", "", new Set([0, 1, 2, 3]))).toBe(true);
  });
});