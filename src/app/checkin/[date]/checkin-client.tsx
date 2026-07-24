"use client";

import Link from "next/link";
import { Camera, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";

interface Mistake {
  wordId: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  mistakes: number;
}

interface WordbookStat {
  name: string;
  attempts: number;
  correct: number;
  words: number;
}

interface DailyReport {
  date: string;
  weekday: string;
  isToday: boolean;
  wordsAttempted: number;
  masteredTodayCount: number;
  learningCount: number;
  totalAttempts: number;
  correctCount: number;
  accuracy: number;
  sessionsCount: number;
  topMissed: Mistake[];
  cumulativeMastered: number;
  wordbookBreakdown: Record<string, WordbookStat>;
}

export function CheckinClient({ date }: { date: string }) {
  const [data, setData] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/analytics/daily?date=${date}`)
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
  }, [date]);

  async function handleDownload() {
    if (!cardRef.current || !data) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#F8FAFC",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `Yasi-Words-${data.date}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      alert("生成图片失败：" + (e instanceof Error ? e.message : "未知错误"));
    } finally {
      setDownloading(false);
    }
  }

  function handlePrevDay() {
    const d = new Date(data?.date ?? date);
    d.setDate(d.getDate() - 1);
    window.location.href = `/checkin/${d.toISOString().slice(0, 10)}`;
  }

  function handleNextDay() {
    if (!data) return;
    if (data.isToday) return;
    const d = new Date(data.date);
    d.setDate(d.getDate() + 1);
    window.location.href = `/checkin/${d.toISOString().slice(0, 10)}`;
  }

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-soft-sm p-12 text-center text-muted-foreground">
        加载打卡记录…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-soft-sm p-12 text-center text-error">
        {error || "暂无数据"}
      </div>
    );
  }

  const hasActivity = data.totalAttempts > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={handlePrevDay}
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:border-accent hover:text-accent transition"
        >
          ← 前一天
        </button>
        <h1 className="text-lg font-semibold">
          {data.isToday ? "今日打卡" : "打卡记录"}
        </h1>
        <button
          onClick={handleNextDay}
          disabled={data.isToday}
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:border-accent hover:text-accent transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-current"
        >
          后一天 →
        </button>
      </div>

      <div
        ref={cardRef}
        className="bg-surface border border-border rounded-xl shadow-soft-md overflow-hidden"
      >
        <div className="px-8 pt-8 pb-6 bg-gradient-to-br from-accent-soft/40 to-transparent border-b border-border">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold tracking-tight">
              {data.date}
            </span>
            <span className="text-sm text-muted-foreground">
              {data.weekday}
            </span>
            {data.isToday && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                TODAY
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.isToday ? "今天的学习记录 ·" : "历史学习记录 ·"}
            Yasi Words 雅思单词拼写训练
          </p>
        </div>

        {!hasActivity ? (
          <div className="px-8 py-16 text-center">
            <p className="text-muted-foreground mb-4">这一天还没有学习记录</p>
            <Link
              href="/"
              className="inline-block px-5 py-2 bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent-hover transition"
            >
              开始学习
            </Link>
          </div>
        ) : (
          <div className="px-8 py-8 space-y-8">
            <section>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
                今日学习
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-background rounded-lg p-5 border border-border">
                  <p className="text-sm text-muted-foreground">尝试次数</p>
                  <p className="mt-1 text-4xl font-bold text-accent tabular-nums">
                    {data.totalAttempts}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">当日总尝试</p>
                </div>
                <div className="bg-background rounded-lg p-5 border border-border">
                  <p className="text-sm text-muted-foreground">新词</p>
                  <p className="mt-1 text-4xl font-bold tabular-nums text-muted-foreground">
                    {data.wordsAttempted - data.learningCount - data.masteredTodayCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">首次遇到</p>
                </div>
                <div className="bg-background rounded-lg p-5 border border-border">
                  <p className="text-sm text-muted-foreground">复练词数</p>
                  <p className="mt-1 text-4xl font-bold text-warning tabular-nums">
                    {data.learningCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">学而未熟</p>
                </div>
                <div className="bg-background rounded-lg p-5 border border-border">
                  <p className="text-sm text-muted-foreground">今日掌握</p>
                  <p className="mt-1 text-4xl font-bold text-success tabular-nums">
                    {data.masteredTodayCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">当日熟练的词数</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-right tabular-nums">
                {(data.wordsAttempted - data.learningCount - data.masteredTodayCount) + data.learningCount + data.masteredTodayCount}
                {" = "}练过 {data.wordsAttempted} 词
              </p>
            </section>

            <section>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
                准确率
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums">
                    {Math.round(data.accuracy * 100)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">正确率</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-success">
                    {data.correctCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">正确</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-error">
                    {data.totalAttempts - data.correctCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">错误</p>
                </div>
              </div>
            </section>

            {data.topMissed.length > 0 && (
              <section>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
                  错词 · Top {data.topMissed.length}
                </p>
                <ul className="space-y-2">
                  {data.topMissed.map((w, i) => (
                    <li
                      key={w.wordId}
                      className="flex items-baseline justify-between px-4 py-3 bg-background rounded-md border border-border"
                    >
                      <span className="flex items-baseline gap-3 min-w-0">
                        <span className="text-xs text-muted-foreground tabular-nums w-5">
                          {i + 1}.
                        </span>
                        <span className="font-mono font-semibold">{w.spelling}</span>
                        {w.pos && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {w.pos}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-error font-medium tabular-nums shrink-0">
                        错 {w.mistakes}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {Object.keys(data.wordbookBreakdown).length > 0 && (
              <section>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
                  词库分布
                </p>
                <ul className="space-y-2">
                  {Object.entries(data.wordbookBreakdown).map(([id, wb]) => (
                    <li
                      key={id}
                      className="flex items-baseline justify-between text-sm"
                    >
                      <span className="text-foreground truncate">{wb.name}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0 ml-3">
                        {wb.words} 词 · {wb.attempts} 次 · {Math.round((wb.correct / wb.attempts) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                累计掌握 ·{" "}
                <span className="text-foreground font-bold tabular-nums">
                  {data.cumulativeMastered}
                </span>{" "}
                词
              </p>
            </section>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleDownload}
          disabled={downloading || !hasActivity}
          className="flex-1 px-5 py-3 bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading ? "生成中…" : <span className="inline-flex items-center gap-1.5"><Camera className="h-4 w-4" /> 下载打卡图（PNG）</span>}
        </button>
        <button
          onClick={() => window.print()}
          disabled={!hasActivity}
          className="px-5 py-3 border border-border rounded-md font-medium hover:border-accent hover:text-accent transition disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-1.5"><Printer className="h-4 w-4" /> 打印 / 手动截图</span>
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        提示：可下载 PNG 直接发给老师，或使用「打印」功能手动截图保存。
      </p>
    </div>
  );
}