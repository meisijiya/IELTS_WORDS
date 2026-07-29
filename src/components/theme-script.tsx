import type { ThemeMode } from "@/components/theme-provider";

/**
 * Inline script rendered inside <head> by the root layout. Runs synchronously
 * before paint so the correct theme is applied on first frame — prevents the
 * "flash of wrong theme" that happens when the class is only set after React
 * hydration. Server-authoritative `initialMode` (sourced from UserSettings)
 * is baked into the script literal; no localStorage read.
 */
export function ThemeScript({ initialMode }: { initialMode: ThemeMode }) {
  const safe = JSON.stringify(initialMode);
  const script = `(function(){try{var m=${safe};var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var c=document.documentElement.classList;d?c.add("dark"):c.remove("dark");}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}