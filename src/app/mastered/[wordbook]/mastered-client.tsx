"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CollectionWord } from "@/lib/word-collections";
import type { DailyStat } from "@/lib/word-history";
import { WrongWordSparkline } from "@/components/wrong-word-sparkline";

const RANGE_TABS: { value: string; label: string }[] = [
  { value: "today", label: "今天" },
  { value: "week", label: "近一周" },
  { value: "month", label: "近一月" },
  { value: "all", label: "全部" },
];

const TOP_OPTIONS = [
  { value: 5, label: "Top 5" },
  { value: 10, label: "Top 10" },
  { value: 20, label: "Top 20" },
  { value: 0, label: "全部" },
];

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function MasteredClient({
  wordbook,
  range,
  words: initial,
  wordHistories,
}: {
  wordbook: { id: number; slug: string; name: string };
  range: string;
  words: CollectionWord[];
  wordHistories: Record<number, DailyStat[]>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [words, setWords] = useState(initial);
  const [topN, setTopN] = useState<number>(20);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setWords(initial);
  }, [initial]);

  const visibleWords = useMemo(
    () => (topN === 0 ? words : words.slice(0, topN)),
    [words, topN],
  );

  function setRange(next: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("range", next);
    router.push(`/mastered/${wordbook.slug}?${sp.toString()}`);
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
          已掌握 <span className="text-muted-fg">· {wordbook.name}</span>
        </h1>
        <p className="text-sm text-muted-fg">
          {words.length === 0
            ? "🎉 当前还没有掌握的词"
            : `共 ${words.length} 个词已掌握（Level 5）`}
        </p>
      </header>

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

      {visibleWords.length === 0 ? (
        <p className="text-center text-muted-fg py-12">当前范围没有已掌握词 🌱</p>
      ) : (
        <ol className="space-y-2">
          {visibleWords.map((w, idx) => {
            const isExpanded = expanded === w.wordId;
            return (
              <li
                key={w.wordId}
                className="border border-border rounded-md bg-surface shadow-soft-sm overflow-hidden"
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
                    <span className="text-xs px-2 py-0.5 bg-success/15 text-success rounded-full font-medium shrink-0">
                      ✓ 已掌握
                    </span>
                  </span>
                  <span className="text-xs text-muted-fg shrink-0">
                    掌握于 <span className="font-medium text-foreground">{fmtDate(w.masteredAt)}</span>
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