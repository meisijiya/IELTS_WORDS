import { describe, expect, it } from "vitest";
import { parseExamples } from "./parse-examples";

describe("parseExamples", () => {
  it("returns [] for null", () => {
    expect(parseExamples(null)).toEqual([]);
  });

  it("returns [] for empty string", () => {
    expect(parseExamples("")).toEqual([]);
  });

  it("returns [] for malformed JSON", () => {
    expect(parseExamples("{not json")).toEqual([]);
  });

  it("returns [] for non-array JSON (object)", () => {
    expect(parseExamples('{"en":"x","zh":"y"}')).toEqual([]);
  });

  it("returns [] for non-array JSON (number)", () => {
    expect(parseExamples("42")).toEqual([]);
  });

  it("returns [] for JSON null literal", () => {
    expect(parseExamples("null")).toEqual([]);
  });

  it("parses a single example", () => {
    const out = parseExamples('[{"en":"hi","zh":"嗨"}]');
    expect(out).toEqual([{ en: "hi", zh: "嗨" }]);
  });

  it("parses multiple examples including source", () => {
    const out = parseExamples(
      '[{"en":"a","zh":"甲"},{"en":"b","zh":"乙","source":"X"}]',
    );
    expect(out).toEqual([
      { en: "a", zh: "甲" },
      { en: "b", zh: "乙", source: "X" },
    ]);
  });

  it("passes through array of non-object items (no per-element validation)", () => {
    const out = parseExamples('[1, "two", null]');
    expect(out).toEqual([1, "two", null]);
  });

  it("returns [] on nested invalid JSON", () => {
    expect(parseExamples('[{en: missing-quotes}]')).toEqual([]);
  });
});
