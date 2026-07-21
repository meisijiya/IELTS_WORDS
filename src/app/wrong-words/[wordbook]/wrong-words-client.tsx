"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DailyStat } from "@/lib/word-history";
import { WrongWordSparkline } from "@/components/wrong-word-sparkline";
import { CollectionTabs } from "@/components/collection-tabs";

interface Mistake {
  wordId: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  mistakes: number;
  correct: number;
  level: number;
}

const RANGE_TABS: { value: string; label: string }[] = [
  { value: "today", label: "今天" },
  { value: "week",  label: "近一周" },
  { value: "month", label: "近一月" },
  { value: "all",   label: "全部" },
];

const TOP_OPTIONS = [
  { value: 5, label: "Top 5" },
  { value: 10, label: "Top 10" },
  { value: 20, label: "Top 20" },
  { value: 0, label: "全部" },
];

export function WrongWordsClient({
  wordbook,
  range,
  mistakes: initial,
  allMistakes,
  reviewedTodayIds,
  reviewedTodayCount,
  wordHistories,
}: {
  wordbook: { id: number; slug: string; name: string };
  range: string;
  mistakes: Mistake[];
  allMistakes: Mistake[];
  reviewedTodayIds: number[];
  reviewedTodayCount: number;
  wordHistories: Record<number, DailyStat[]>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [mistakes, setMistakes] = useState(initial);
  const [topN, setTopN] = useState<number>(20);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [markedIds, setMarkedIds] = useState<Set<number>>(new Set());
  const reviewedSet = useMemo(
    () => new Set(reviewedTodayIds),
    [reviewedTodayIds],
  );
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    setMistakes(initial);
  }, [initial]);

  const visibleMistakes = useMemo(
    () => (topN === 0 ? mistakes : mistakes.slice(0, topN)),
    [mistakes, topN],
  );

  const allIdsParam = useMemo(
    () => [...new Set(allMistakes.map((m) => m.wordId))].join(","),
    [allMistakes],
  );
  const remainingIdsParam = useMemo(
    () => allMistakes
      .filter((m) => !reviewedSet.has(m.wordId))
      .map((m) => m.wordId)
      .join(","),
    [allMistakes, reviewedSet],
  );

  function setRange(next: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("range", next);
    router.push(`/wrong-words/${wordbook.slug}?${sp.toString()}`);
  }

  async function markMastered(wordId: number) {
    if (!confirm("标记为已熟？将不再出现在错词榜。")) return;
    setBusyId(wordId);
    try {
      await fetch("/api/words/mark-mastered", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId }),
      });
      setMistakes((arr) => arr.filter((m) => m.wordId !== wordId));
      setMarkedIds((s) => new Set([...s, wordId]));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/analytics" className="text-sm text-muted-fg hover:text-accent transition">
          ← 返回分析
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">
          错词榜 <span className="text-muted-fg">· {wordbook.name}</span>
        </h1>
        <p className="text-sm text-muted-fg">
          {mistakes.length === 0
            ? "🎉 当前范围暂无错词"
            : `共 ${mistakes.length} 个错词，按错误次数排序`}
        </p>
      </header>

      <CollectionTabs wordbookSlug={wordbook.slug} current="wrong" range={range} />

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1">
          {RANGE_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setRange(t.value)}
              className={`px-3 py-1.5 text-sm rounded-md border transition font-medium ${
                range === t.value
                  ? "bg-accent text-accent-fg border-accent"
                  : "border-border text-muted-fg hover:border-accent/60 hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {TOP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTopN(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md border transition font-medium ${
                topN === opt.value
                  ? "bg-accent text-accent-fg border-accent"
                  : "border-border text-muted-fg hover:border-accent/60"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {allMistakes.length > 0 && (
        <div className="rounded-lg shadow-soft-md bg-accent text-accent-fg overflow-hidden">
          <div className="px-5 pt-4 pb-2 text-xs opacity-90 flex items-baseline justify-between">
            <span>🎯 批量练习模式：</span>
            <span className="tabular-nums">
              全量 {allMistakes.length} · 已复习 {reviewedTodayCount} · 剩余 {allMistakes.length - reviewedTodayCount}
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-accent-fg/20">
            <Link
              href={`/practice/${wordbook.slug}?ids=${allIdsParam}`}
              className="px-5 py-4 hover:bg-accent-hover transition text-left"
            >
              <p className="font-semibold flex items-baseline gap-2">
                全量复习
                <span className="text-sm opacity-90">（{allMistakes.length} 词）</span>
              </p>
              <p className="text-xs opacity-80 mt-1">包括今日已复习的</p>
            </Link>
            <Link
              href={`/practice/${wordbook.slug}?ids=${remainingIdsParam}`}
              className={`px-5 py-4 transition text-left ${
                remainingIdsParam ? "hover:bg-accent-hover" : "opacity-40 pointer-events-none"
              }`}
              aria-disabled={!remainingIdsParam}
            >
              <p className="font-semibold flex items-baseline gap-2">
                仅剩余
                <span className="text-sm opacity-90">（{allMistakes.length - reviewedTodayCount} 词）</span>
              </p>
              <p className="text-xs opacity-80 mt-1">跳过今日已复习的</p>
            </Link>
          </div>
        </div>
      )}

      {visibleMistakes.length === 0 ? (
        <p className="text-center text-muted-fg py-12">当前 Top 没有错词 💪</p>
      ) : (
        <ol className="space-y-2">
          {visibleMistakes.map((w, idx) => {
            const isExpanded = expanded === w.wordId;
            const isMarked = markedIds.has(w.wordId);
            return (
              <li
                key={w.wordId}
                className={`border border-border rounded-md bg-surface shadow-soft-sm overflow-hidden ${
                  isMarked ? "opacity-50" : ""
                }`}
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : w.wordId)}
                  className="w-full flex items-baseline justify-between gap-3 p-3 text-left hover:bg-muted/30 transition"
                >
                  <span className="flex items-baseline gap-3 min-w-0">
                    <span className="text-sm font-mono text-muted-fg w-7 shrink-0">{idx + 1}</span>
                    <span className="font-medium truncate">{w.spelling}</span>
                    {w.pos && (
                      <span className="text-xs font-mono text-muted-fg shrink-0">{w.pos}</span>
                    )}
                    {reviewedSet.has(w.wordId) && (
                      <span className="text-xs px-2 py-0.5 bg-success/15 text-success rounded-full font-medium shrink-0">
                        ✓ 今日已复习
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-fg shrink-0">
                    <span className="text-error font-semibold">{w.mistakes} ✗</span>
                    <span className="mx-1">·</span>
                    <span className="text-success">{w.correct} ✓</span>
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/60 bg-muted/20 space-y-2">
                    <div className="pt-2">
                      <WrongWordSparkline data={wordHistories[w.wordId] ?? []} />
                    </div>
                    {w.glosses.length > 0 && (
                      <ul className="text-sm space-y-0.5">
                        {w.glosses.slice(0, 3).map((g, i) => (
                          <li key={i}>
                            <span className="font-mono text-xs text-muted-fg mr-1">{g.pos}</span>
                            <span>{g.meaning}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Link
                        href={`/practice/${wordbook.slug}?ids=${w.wordId}`}
                        className="text-xs px-3 py-1.5 bg-accent text-accent-fg rounded-md hover:bg-accent-hover transition"
                      >
                        单练
                      </Link>
                      <button
                        onClick={() => markMastered(w.wordId)}
                        disabled={busyId === w.wordId}
                        className="text-xs px-3 py-1.5 border border-border rounded-md text-muted-fg hover:text-success hover:border-success transition disabled:opacity-50"
                      >
                        {busyId === w.wordId ? "标记中…" : "标记已熟"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
