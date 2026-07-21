import { describe, expect, it } from "vitest";
import { cleanInput } from "./practice-client";

describe("cleanInput", () => {
  it("strips punctuation, digits, and symbols (keeps letters + spaces)", () => {
    expect(cleanInput("heart! attack?", 12)).toBe("heart attack");
    expect(cleanInput("it's", 3)).toBe("its"); // apostrophe stripped, length-capped
    expect(cleanInput("a1b2c3", 6)).toBe("abc");
    expect(cleanInput("hello-world", 10)).toBe("helloworld"); // hyphen stripped
  });

  it("preserves spaces inside the input (compound words)", () => {
    expect(cleanInput("heart attack", 12)).toBe("heart attack");
    expect(cleanInput("carbon dioxide", 14)).toBe("carbon dioxide");
    expect(cleanInput("up to date", 10)).toBe("up to date");
  });

  it("caps to maxLen", () => {
    expect(cleanInput("abcdefghij", 5)).toBe("abcde");
    expect(cleanInput("heart attack extra", 12)).toBe("heart attack");
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