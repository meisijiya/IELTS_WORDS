"use client";

import Link from "next/link";
import { X, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface Wordbook {
  id: number;
  slug: string;
  name: string;
  _count: { words: number };
}

interface Mistake {
  wordId: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  mistakes: number;
  correct: number;
}

interface SessionRow {
  id: string;
  startedAt: string;
  endedAt: string | null;
  totalWords: number;
  correctCount: number;
}

interface Overview {
  progress: {
    totalWords: number;
    newWords: number;
    learningWords: number;
    masteredWords: number;
    progressPct: number;
  };
  recent: {
    totalAttempts: number;
    correctCount: number;
    accuracy: number;
  };
  topMissed: Mistake[];
  errorPositions: {
    firstLetter: number;
    lastLetter: number;
    middle: number;
    lengthMismatch: number;
  };
  sessions: SessionRow[];
  range: string;
}

type Range = "today" | "week" | "month" | "all";

const RANGE_LABEL: Record<Range, string> = {
  today: "今天",
  week: "近一周",
  month: "近一个月",
  all: "全部",
};

export function AnalyticsClient({ wordbooks }: { wordbooks: Wordbook[] }) {
  const [selectedId, setSelectedId] = useState<number>(wordbooks[0]?.id ?? 0);
  const [range, setRange] = useState<Range>("all");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedWordId, setExpandedWordId] = useState<number | null>(null);
  const [markedIds, setMarkedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analytics?wordbookId=${selectedId}&range=${range}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setError(d.error);
        } else {
          setData(d);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "未知错误");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, range]);

  async function markMastered(wordId: number) {
    if (!confirm("标记为已熟？将不再出现在错词榜。" )) return;
    await fetch("/api/words/mark-mastered", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId }),
    });
    setMarkedIds((s) => new Set([...s, wordId]));
    setData((d) => d ? {
      ...d,
      topMissed: d.topMissed.filter((w) => w.wordId !== wordId),
    } : d);
  }

  const wordbook = wordbooks.find((w) => w.id === selectedId);
  const mistakeIdsParam = useMemo(() => {
    if (!data?.topMissed.length) return "";
    return data.topMissed.map((w) => w.wordId).slice(0, 20).join(",");
  }, [data?.topMissed]);

  if (wordbooks.length === 0) {
    return <p className="text-muted-fg">暂无词库</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800 pb-2">
        {wordbooks.map((wb) => (
          <button
            key={wb.id}
            onClick={() => setSelectedId(wb.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              selectedId === wb.id
                ? "border-accent text-accent"
                : "border-transparent text-muted-fg hover:text-foreground"
            }`}
          >
            {wb.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1 text-sm rounded-full border ${
              range === r
                ? "bg-accent text-accent-fg border-accent"
                : "border-gray-300 dark:border-gray-700 hover:border-accent"
            }`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {loading && <p className="text-muted-fg">加载分析数据…</p>}
      {error && <p className="text-error">{error}</p>}

      {data && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="总词数" value={data.progress.totalWords} />
            <Stat label="已掌握" value={data.progress.masteredWords} accent />
            <Stat label="学习中" value={data.progress.learningWords} />
            <Stat label="新词" value={data.progress.newWords} />
          </section>

          <ProgressBar
            newWords={data.progress.newWords}
            learningWords={data.progress.learningWords}
            masteredWords={data.progress.masteredWords}
            totalWords={data.progress.totalWords}
          />

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Stat label={`累计尝试 (${RANGE_LABEL[data.range as Range]})`} value={data.recent.totalAttempts} big />
            <Stat label="正确率" value={`${Math.round(data.recent.accuracy * 100)}%`} big accent />
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">错词榜 · {data.topMissed.length}</h2>
              {data.topMissed.length > 0 && wordbook && (
                <Link
                  href={`/wrong-words/${wordbook.slug}?range=${range}`}
                  className="text-sm text-muted-fg hover:text-accent transition"
                >
                  查看全部 →
                </Link>
              )}
            </div>
            {data.topMissed.length === 0 ? (
              <p className="text-muted-fg text-sm">暂无错词记录</p>
            ) : (
              <ol className="space-y-2">
                {data.topMissed.map((w, i) => {
                  const expanded = expandedWordId === w.wordId;
                  return (
                    <li key={w.wordId} className="border border-gray-200 dark:border-gray-800 rounded">
                      <button
                        onClick={() => setExpandedWordId(expanded ? null : w.wordId)}
                        className="w-full flex items-baseline justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900"
                      >
                        <span className="font-mono">
                          <span className="text-muted-fg text-sm mr-2">{i + 1}.</span>
                          <span className="font-semibold">{w.spelling}</span>
                          {w.pos && (
                            <span className="text-xs text-muted-fg ml-2 font-mono">{w.pos}</span>
                          )}
                        </span>
                        <span className="text-sm flex items-center gap-3">
                          <span className="text-error font-mono inline-flex items-center gap-0.5"><X className="h-3.5 w-3.5" /> {w.mistakes}</span>
                          <span className="text-muted-fg">·</span>
                          <span className="text-success font-mono inline-flex items-center gap-0.5"><Check className="h-3.5 w-3.5" /> {w.correct}</span>
                          <span className="text-muted-fg">{expanded ? "▲" : "▼"}</span>
                        </span>
                      </button>
                      {expanded && (
                        <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-3 bg-gray-50 dark:bg-gray-900/50">
                          <div>
                            <p className="text-xs text-muted-fg mb-1">中文释义</p>
                            <ul className="space-y-1">
                              {w.glosses.map((g, idx) => (
                                <li key={idx} className="text-sm">
                                  <span className="font-mono text-accent mr-2">{g.pos}</span>
                                  <span>{g.meaning}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-2">
                            {wordbook && (
                              <Link
                                href={`/practice/${wordbook.slug}?ids=${w.wordId}`}
                                className="px-3 py-1 text-sm bg-accent text-accent-fg rounded"
                              >
                                重新练习这个词
                              </Link>
                            )}
                            <button
                              onClick={() => markMastered(w.wordId)}
                              disabled={markedIds.has(w.wordId)}
                              className="px-3 py-1 text-sm border border-success text-success rounded hover:bg-success hover:text-white transition disabled:opacity-50"
                            >
                              {markedIds.has(w.wordId) ? <><Check className="inline h-3.5 w-3.5" /> 已标记</> : "标记为已熟"}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">拼写错误模式</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <ErrorBox label="首字母错" count={data.errorPositions.firstLetter} />
              <ErrorBox label="末尾字母错" count={data.errorPositions.lastLetter} />
              <ErrorBox label="中间字母错" count={data.errorPositions.middle} />
              <ErrorBox label="长度不匹配" count={data.errorPositions.lengthMismatch} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">会话历史</h2>
            {data.sessions.length === 0 ? (
              <p className="text-muted-fg text-sm">暂无会话</p>
            ) : (
              <ul className="text-sm space-y-1">
                {data.sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex justify-between items-center border-b border-gray-100 dark:border-gray-900 py-2"
                  >
                    <span className="text-muted-fg">
                      {new Date(s.startedAt).toLocaleString("zh-CN")}
                    </span>
                    <span className="flex items-center gap-2">
                      <span>
                        {s.correctCount}/{s.totalWords}
                      </span>
                      {s.endedAt === null && (
                        <>
                          <span className="text-warning text-xs">进行中</span>
                          {wordbook && (
                            <Link
                              href={`/practice/${wordbook.slug}`}
                              className="text-xs text-accent hover:underline"
                            >
                              继续
                            </Link>
                          )}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  big,
  accent,
}: {
  label: string;
  value: string | number;
  big?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`p-4 border border-border rounded ${
        accent ? "border-accent" : ""
      }`}
    >
      <p className="text-xs text-muted-fg">{label}</p>
      <p className={`font-bold ${accent ? "text-accent" : ""} ${big ? "text-3xl" : "text-2xl"}`}>
        {value}
      </p>
    </div>
  );
}

function ProgressBar({
  newWords,
  learningWords,
  masteredWords,
  totalWords,
}: {
  newWords: number;
  learningWords: number;
  masteredWords: number;
  totalWords: number;
}) {
  if (totalWords === 0) return null;
  const masteredPct = (masteredWords / totalWords) * 100;
  const learningPct = (learningWords / totalWords) * 100;
  const newPct = (newWords / totalWords) * 100;
  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">掌握进度</span>
        <span className="tabular-nums text-muted-foreground">
          {masteredWords} / {totalWords}{" "}
          <span className="text-accent font-semibold">
            ({Math.round(masteredPct)}%)
          </span>
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
        <div
          className="bg-success h-full transition-all"
          style={{ width: `${masteredPct}%` }}
          title={`已掌握 ${masteredWords}`}
        />
        <div
          className="bg-warning h-full transition-all"
          style={{ width: `${learningPct}%` }}
          title={`学习中 ${learningWords}`}
        />
        <div
          className="bg-muted-foreground/40 h-full transition-all"
          style={{ width: `${newPct}%` }}
          title={`新词 ${newWords}`}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-success" />
          已掌握 {masteredWords}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-warning" />
          学习中 {learningWords}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
          新词 {newWords}
        </span>
      </div>
    </div>
  );
}

function ErrorBox({ label, count }: { label: string; count: number }) {
  return (
    <div className="p-3 border border-gray-200 dark:border-gray-800 rounded">
      <p className="text-muted-fg text-xs">{label}</p>
      <p className={`text-xl font-bold ${count > 0 ? "text-warning" : ""}`}>{count}</p>
    </div>
  );
}