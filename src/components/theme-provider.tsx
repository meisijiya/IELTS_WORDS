"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Three-mode theme control. Server-authoritative: UserSettings.theme is read
 * by the RSC and passed as `initialMode`. localStorage is a session cache;
 * setMode() PUTs the choice back so it survives across devices.
 */

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "yasi-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredMode(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MEDIA_QUERY).matches;
}

function applyMode(mode: ThemeMode): "light" | "dark" {
  const resolved =
    mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  return resolved;
}

function persistMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ponytail: Safari private mode + iframe-with-blocked-storage throw on write.
  }
}

// ponytail: fire-and-forget PUT so the theme choice survives across devices.
// 401 (cookie expired) is swallowed silently — toggle still works in-session.
function persistToServer(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme: mode }),
    keepalive: true,
  }).catch(() => {});
}

export function ThemeProvider({
  initialMode,
  children,
}: {
  initialMode: ThemeMode;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // ponytail: one-time legacy migration — if stale localStorage holds a
  // value the server doesn't, push it back to the server. Runs once.
  useEffect(() => {
    const stored = readStoredMode();
    if (stored !== null && stored !== initialMode) {
      persistToServer(stored);
      setModeState(stored);
      setResolved(applyMode(stored));
    } else {
      setResolved(applyMode(initialMode));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track OS preference changes only when the user picked "system".
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia(MEDIA_QUERY);
    const onChange = () => setResolved(applyMode("system"));
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    persistMode(next);
    setResolved(applyMode(next));
    persistToServer(next);
  }, []);

  const cycle = useCallback(() => {
    setMode(
      mode === "light" ? "dark" : mode === "dark" ? "system" : "light",
    );
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, cycle }),
    [mode, resolved, setMode, cycle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}