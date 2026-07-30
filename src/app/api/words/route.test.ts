import { describe, expect, it } from "vitest";
import { parseExamples } from "@/lib/parse-examples";

describe("parseExamples (S5)", () => {
  it("returns empty array on null", () => {
    expect(parseExamples(null)).toEqual([]);
  });

  it("returns empty array on empty string", () => {
    expect(parseExamples("")).toEqual([]);
  });

  it("parses valid JSON array of {en, zh, source?}", () => {
    const json = JSON.stringify([
      { en: "I went to the bank.", zh: "我去了银行。", source: "youdao" },
      { en: "The river bank was steep.", zh: "河岸很陡。" },
    ]);
    expect(parseExamples(json)).toEqual([
      { en: "I went to the bank.", zh: "我去了银行。", source: "youdao" },
      { en: "The river bank was steep.", zh: "河岸很陡。" },
    ]);
  });

  it("returns empty array on malformed JSON (defensive)", () => {
    expect(parseExamples("{not valid")).toEqual([]);
    expect(parseExamples("[")).toEqual([]);
  });

  it("returns empty array when JSON is not an array", () => {
    expect(parseExamples(JSON.stringify({ en: "x", zh: "y" }))).toEqual([]);
    expect(parseExamples(JSON.stringify("string"))).toEqual([]);
    expect(parseExamples(JSON.stringify(42))).toEqual([]);
  });
});
