import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SETTINGS = {
  flashMs: 800,
  fadeMs: 300,
  pronunciationMode: "both",
  pullPriority: "review",
  enablePronunciation: true,
  accent: "us",
  checkinRetentionDays: null,
  masteryThreshold: 5,
  flashSkipMinLevel: null,
  soundEnabled: true,
  theme: "system",
  sentenceMode: "fallback",
} as const;

const reactState = vi.hoisted(() => ({ call: 0 }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState<T>(initialState: T | (() => T)) {
      reactState.call += 1;
      if (reactState.call === 1) return actual.useState(SETTINGS);
      if (reactState.call === 2) return actual.useState(false);
      return actual.useState(initialState);
    },
  };
});

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  json: async () => SETTINGS,
}));

import { renderToString } from "react-dom/server";
import { SettingsClient } from "./settings-client";

describe("SettingsClient sentenceMode section (S9)", () => {
  beforeEach(() => {
    reactState.call = 0;
  });

  it("renders the three-way selector with all labels", () => {
    const html = renderToString(
      createElement(SettingsClient, { currentUsername: "u", currentRole: "user" }),
    );

    expect(html).toContain("例句模式");
    expect(html).toContain("总是例句");
    expect(html).toContain("有例句才用");
    expect(html).toContain("关闭例句");
  });

  it("highlights the fallback option by default", () => {
    const html = renderToString(
      createElement(SettingsClient, { currentUsername: "u", currentRole: "user" }),
    );

    expect(html).toContain("有例句才用");
    expect(html).toContain("推荐");
  });
});
