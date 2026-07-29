"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "@/components/theme-provider";

const ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<ThemeMode, string> = {
  light: "当前：浅色 · 点击切换深色",
  dark: "当前：深色 · 点击切换跟随系统",
  system: "当前：跟随系统 · 点击切换浅色",
};

const NEXT_LABEL: Record<ThemeMode, string> = {
  light: "浅色模式",
  dark: "深色模式",
  system: "跟随系统",
};

/**
 * Single-button three-state cycle: light → dark → system → light.
 * Icon reflects the user's chosen MODE (not the resolved color), so the
 * Monitor glyph means "I picked system", not "the OS is currently dark".
 *
 * When mounted SSR-side, mode is "system" until ThemeProvider hydrates;
 * the no-FOUC inline script in <head> has already painted the correct
 * class on <html>, so the icon-only flash is invisible.
 */
export function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const Icon = ICONS[mode];
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`主题：${LABELS[mode]}`}
      title={`主题：${NEXT_LABEL[mode]}（点击切换）`}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border text-foreground hover:bg-muted hover:text-accent transition"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}