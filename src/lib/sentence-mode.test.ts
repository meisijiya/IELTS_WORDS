import { describe, expect, it } from "vitest";
import { pickSentence } from "./sentence-mode";

describe("pickSentence", () => {
  it("returns the first example when input is a non-empty array", () => {
    expect(
      pickSentence([
        { en: "I went to the bank.", zh: "我去了银行。", source: "youdao" },
      ]),
    ).toEqual({ en: "I went to the bank.", zh: "我去了银行。", source: "youdao" });
  });

  it("returns null for empty array", () => {
    expect(pickSentence([])).toBeNull();
  });

  it("returns null for non-array", () => {
    expect(pickSentence(null)).toBeNull();
    expect(pickSentence(undefined)).toBeNull();
    expect(pickSentence("not array")).toBeNull();
    expect(pickSentence(42)).toBeNull();
    expect(pickSentence({ en: "x", zh: "y" })).toBeNull();
  });

  it("returns null when first item lacks en or zh strings", () => {
    expect(pickSentence([{ en: 123, zh: "x" }])).toBeNull();
    expect(pickSentence([{ en: "x" }])).toBeNull();
    expect(pickSentence([{}])).toBeNull();
    expect(pickSentence([{ en: "", zh: "x" }])).toBeNull();
  });
});
