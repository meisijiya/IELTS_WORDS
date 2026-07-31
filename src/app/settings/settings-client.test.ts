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
  sentenceMode: "always",
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

describe("SettingsClient page", () => {
  beforeEach(() => {
    reactState.call = 0;
  });

  // ponytail: pullPriority + sentenceMode controls moved to TopBar's
  // <PracticeQuickSwitch /> (auto-save). Settings page no longer renders
  // them. Tests below cover the remaining sections on this page.
  it("renders the remaining sections without the migrated controls", () => {
    const html = renderToString(
      createElement(SettingsClient, { currentUsername: "u", currentRole: "user" }),
    );

    expect(html).not.toContain("拉取优先级");
    expect(html).not.toContain("例句模式");
    expect(html).toContain("默认主题");
    expect(html).toContain("闪现时长");
    expect(html).toContain("单词发音");
    expect(html).toContain("熟练阈值");
  });
});
