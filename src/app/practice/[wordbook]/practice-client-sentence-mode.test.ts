import { describe, expect, it } from "vitest";
import { pickDisplayMode } from "./practice-client";

describe("pickDisplayMode (S11 / AC7/8)", () => {
  it("returns 'bare' when sentenceMode is 'off'", () => {
    expect(pickDisplayMode({ sentenceMode: "off" }, [{ en: "x", zh: "y" }])).toBe("bare");
  });

  it("returns 'bare' when mode=always and examples empty (fallback to bare flash)", () => {
    expect(pickDisplayMode({ sentenceMode: "always" }, [])).toBe("bare");
  });

  it("returns 'sentence' when mode=always and examples present", () => {
    expect(pickDisplayMode({ sentenceMode: "always" }, [{ en: "x", zh: "y" }])).toBe("sentence");
  });

  it("returns 'sentence' when mode=fallback and examples present", () => {
    expect(pickDisplayMode({ sentenceMode: "fallback" }, [{ en: "x", zh: "y" }])).toBe("sentence");
  });

  it("returns 'bare' when mode=fallback and examples empty (AC7)", () => {
    expect(pickDisplayMode({ sentenceMode: "fallback" }, [])).toBe("bare");
  });
});
