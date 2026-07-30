"use client";

import { useEffect, useRef, useState } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";

type PullMode = "review" | "balanced" | "new";
type SentenceMode = "always" | "off";

interface PracticeQuickSwitchProps {
  initialPullPriority: PullMode;
  initialSentenceMode: SentenceMode;
}

const PULL_OPTIONS: { value: PullMode; label: string; hint: string }[] = [
  { value: "review",   label: "复习优先", hint: "4 新 + 8 学过 + 8 已熟练" },
  { value: "balanced", label: "均衡",     hint: "14 新 + 5 学过 + 1 已熟练" },
  { value: "new",      label: "新词优先", hint: "18 新 + 2 学过 + 0 已熟练" },
];

const SENTENCE_OPTIONS: { value: SentenceMode; label: string; hint: string }[] = [
  { value: "always", label: "总是例句", hint: "例句缺失回退裸单词（推荐）" },
  { value: "off",    label: "关闭例句", hint: "永远裸单词拼写" },
];

/**
 * Single-button popover on the top bar that exposes the two settings
 * which actually affect the practice page batch:
 *   - sentenceMode (always / off)
 *   - pullPriority (review / balanced / new)
 *
 * Click any option → PUT /api/settings with just those two fields; the
 * server normalizes via existing normalizeSentenceMode / normalizePullPriority,
 * so we never touch the rest of the user's settings.
 *
 * Visual style mirrors settings-client.tsx (filled accent when selected).
 */
export function PracticeQuickSwitch({
  initialPullPriority,
  initialSentenceMode,
}: PracticeQuickSwitchProps) {
  const [open, setOpen] = useState(false);
  const [pullPriority, setPullPriority] = useState<PullMode>(initialPullPriority);
  const [sentenceMode, setSentenceMode] = useState<SentenceMode>(initialSentenceMode);
  const [saving, setSaving] = useState<"pull" | "sentence" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — same pattern as NavMenu.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function savePull(next: PullMode) {
    if (next === pullPriority) return;
    setPullPriority(next);
    setSaving("pull");
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pullPriority: next }),
      });
      if (!res.ok) throw new Error("保存失败");
    } catch (e) {
      setPullPriority(initialPullPriority);
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(null);
    }
  }

  async function saveSentence(next: SentenceMode) {
    if (next === sentenceMode) return;
    setSentenceMode(next);
    setSaving("sentence");
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentenceMode: next }),
      });
      if (!res.ok) throw new Error("保存失败");
    } catch (e) {
      setSentenceMode(initialSentenceMode);
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "关闭快速切换" : "打开快速切换"}
        aria-expanded={open}
        title="练习快速切换"
        className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border text-foreground hover:bg-muted hover:text-accent transition"
      >
        {open ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-surface border border-border rounded-xl shadow-soft-lg p-3 z-50 space-y-3"
          role="dialog"
          aria-label="练习快速切换"
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-sm font-semibold inline-flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" /> 练习快速切换
            </span>
            <span className="text-[10px] text-muted-foreground">点击即保存</span>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">例句模式</p>
            <div className="grid grid-cols-3 gap-1">
              {SENTENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={saving === "sentence"}
                  onClick={() => saveSentence(opt.value)}
                  title={opt.hint}
                  className={`px-2 py-1.5 rounded-md border text-xs font-medium transition text-center ${
                    sentenceMode === opt.value
                      ? "bg-accent text-accent-foreground border-accent"
                      : "border-border hover:border-accent/50 disabled:opacity-50"
                  }`}
                >
                  {opt.label}
                  {sentenceMode === opt.value && (
                    <Check className="inline h-3 w-3 ml-0.5 -mt-0.5" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">拉取优先级</p>
            <div className="space-y-1">
              {PULL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={saving === "pull"}
                  onClick={() => savePull(opt.value)}
                  title={opt.hint}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border text-xs font-medium transition text-left ${
                    pullPriority === opt.value
                      ? "bg-accent text-accent-foreground border-accent"
                      : "border-border hover:border-accent/50 disabled:opacity-50"
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    className={`text-[10px] font-mono ${
                      pullPriority === opt.value
                        ? "text-accent-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-error border-t border-border pt-2">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}