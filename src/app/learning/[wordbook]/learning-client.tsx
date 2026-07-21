"use client";

import Link from "next/link";
import { PartyPopper, Dumbbell, Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CollectionWord } from "@/lib/word-collections";
import type { DailyStat } from "@/lib/word-history";
import { WrongWordSparkline } from "@/components/wrong-word-sparkline";
import { CollectionTabs } from "@/components/collection-tabs";

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

export function LearningClient({
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
    router.push(`/learning/${wordbook.slug}?${sp.toString()}`);
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
          学习中 <span className="text-muted-fg">· {wordbook.name}</span>
        </h1>
        <p className="text-sm text-muted-fg">
          {words.length === 0
            ? <span className="inline-flex items-center gap-1.5"><PartyPopper className="h-4 w-4" /> 当前没有正在学习的词</span>
            : `共 ${words.length} 个词在持续练习中（未掌握且无错误）`}
        </p>
      </header>

      <CollectionTabs wordbookSlug={wordbook.slug} current="learning" range={range} />

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
        <p className="text-center text-muted-fg py-12 inline-flex items-center gap-1.5"><Dumbbell className="h-4 w-4" /> 当前范围没有学习中词</p>
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
                    <span className="text-xs px-2 py-0.5 bg-info/15 text-info rounded-full font-medium shrink-0">
                      Lv{w.level}/5
                    </span>
                  </span>
                  <span className="text-xs text-muted-fg shrink-0">
                    <span className="font-semibold">{w.attempts}</span> 次尝试
                    <span className="mx-1">·</span>
                    <span className="text-success inline-flex items-center gap-0.5">{w.correct} <Check className="h-3 w-3" /></span>
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
                        继续练习
                      </Link>
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