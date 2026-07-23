"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Crown, ChevronDown, ChevronUp, X } from "lucide-react";

interface LeaderboardEntry {
  id: number;
  username: string;
  role: string;
  isMe: boolean;
  todayAttempts: number;
  masteredCount: number;
  recentWords: Array<{ spelling: string; createdAt: string }>;
}

interface UserToday {
  user: { id: number; username: string; role: string };
  date: string;
  totalToday: number;
  correctToday: number;
  attempts: Array<{
    id: number;
    spelling: string;
    pos: string | null;
    glosses: { pos: string; meaning: string }[];
    typed: string;
    correct: boolean;
    createdAt: string;
  }>;
}

function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function LeaderboardClient({ entries: initial }: { entries: LeaderboardEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const [tick, setTick] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UserToday | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/leaderboard")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data?.entries) setEntries(data.entries);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    function recompute() {
      if (expandedId === null) {
        setShowBackToTop(false);
        return;
      }
      const el = rowRefs.current.get(expandedId);
      if (!el) {
        setShowBackToTop(false);
        return;
      }
      const rect = el.getBoundingClientRect();
      setShowBackToTop(rect.top < -120);
    }
    window.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute);
    recompute();
    return () => {
      window.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [expandedId, entries]);

  const sorted = [...entries].sort(
    (a, b) => b.todayAttempts - a.todayAttempts || b.masteredCount - a.masteredCount,
  );

  async function toggleExpand(userId: number) {
    if (expandedId === userId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(userId);
    setDetail(null);
    setDetailLoading(true);
    requestAnimationFrame(() => {
      rowRefs.current.get(userId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    try {
      const res = await fetch(`/api/leaderboard/${userId}/today`);
      if (!res.ok) {
        setDetailLoading(false);
        return;
      }
      const data = await res.json();
      setDetail(data);
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  }

  function scrollToExpandedTop() {
    if (expandedId === null) return;
    rowRefs.current.get(expandedId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-2">
      {sorted.map((e, idx) => {
        const isOpen = expandedId === e.id;
        return (
          <div
            key={e.id}
            ref={(el) => {
              if (el) rowRefs.current.set(e.id, el);
              else rowRefs.current.delete(e.id);
            }}
            className={`bg-surface border rounded-xl transition overflow-hidden ${
              e.isMe ? "border-accent ring-1 ring-accent/30" : "border-border"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleExpand(e.id)}
              className="w-full text-left flex items-center gap-3 p-4 hover:bg-muted/30 transition"
              aria-expanded={isOpen}
            >
              <div className="w-8 text-center text-sm font-bold tabular-nums">
                {idx === 0 ? (
                  <Crown className="h-5 w-5 mx-auto text-accent" />
                ) : (
                  <span className="text-muted-foreground">{idx + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {e.username}
                  {e.isMe && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-accent font-semibold">YOU</span>
                  )}
                  {e.role === "admin" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">ADMIN</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {e.recentWords.length > 0 ? (
                    <>
                      最近答对：
                      {e.recentWords.map((w) => (
                        <span key={w.createdAt} className="ml-1.5 font-mono">{w.spelling}</span>
                      ))}
                    </>
                  ) : (
                    "今日还未答对单词"
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold tabular-nums">{e.todayAttempts}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">今日</div>
              </div>
              <div className="text-right shrink-0 min-w-12">
                <div className="text-lg font-bold tabular-nums text-accent">{e.masteredCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">已熟练</div>
              </div>
              <div className="text-muted-foreground">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border bg-muted/20 px-4 py-3">
                {detailLoading && (
                  <p className="text-xs text-muted-foreground text-center py-2">加载中…</p>
                )}
                {!detailLoading && detail && (
                  <TodayPanel detail={detail} />
                )}
                {!detailLoading && !detail && (
                  <p className="text-xs text-muted-foreground text-center py-2">加载失败</p>
                )}
                <div className="pt-3 mt-3 border-t border-border/60 flex justify-end">
                  <button
                    type="button"
                    onClick={scrollToExpandedTop}
                    className="text-xs text-accent hover:text-accent-hover inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border hover:border-accent/40 transition"
                  >
                    <ArrowUp className="h-3.5 w-3.5" /> 回到顶部
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {expandedId !== null && (
        <button
          type="button"
          onClick={scrollToExpandedTop}
          aria-label="回到顶部"
          title="回到顶部"
          className={`fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-accent text-accent-foreground shadow-soft-lg hover:bg-accent-hover active:scale-95 transition flex items-center justify-center ${
            showBackToTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
          }`}
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
      {expandedId !== null && (
        <button
          type="button"
          onClick={() => setExpandedId(null)}
          aria-label="收起详情"
          title="收起详情"
          className="fixed bottom-6 right-20 z-40 w-12 h-12 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:border-accent/40 shadow-soft-md active:scale-95 transition flex items-center justify-center"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function TodayPanel({ detail }: { detail: UserToday }) {
  const accuracy = detail.totalToday > 0
    ? Math.round((detail.correctToday / detail.totalToday) * 100)
    : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-surface rounded-md p-2">
          <div className="text-xs text-muted-foreground">今日总尝试</div>
          <div className="text-lg font-bold tabular-nums">{detail.totalToday}</div>
        </div>
        <div className="bg-surface rounded-md p-2">
          <div className="text-xs text-muted-foreground">正确</div>
          <div className="text-lg font-bold tabular-nums text-success">{detail.correctToday}</div>
        </div>
        <div className="bg-surface rounded-md p-2">
          <div className="text-xs text-muted-foreground">准确率</div>
          <div className="text-lg font-bold tabular-nums">{accuracy}%</div>
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">今日打卡明细</div>
        {detail.attempts.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">今日暂无打卡</p>
        ) : (
          <ul className="divide-y divide-border">
            {detail.attempts.map((a) => (
              <li key={a.id} className="py-1.5 flex items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-12">
                  {timeOfDay(a.createdAt)}
                </span>
                <span className={`w-4 h-4 inline-flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${a.correct ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}>
                  {a.correct ? "✓" : "✗"}
                </span>
                <span className="font-mono font-medium shrink-0">{a.spelling}</span>
                {!a.correct && (
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    → {a.typed || "(空)"}
                  </span>
                )}
                {a.pos && (
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {a.pos} {a.glosses.map((g) => g.meaning).join("; ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
