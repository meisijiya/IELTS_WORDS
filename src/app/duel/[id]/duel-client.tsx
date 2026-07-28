"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Swords, Clock, Trophy, AlertTriangle, Users, Copy } from "lucide-react";

interface Gloss {
  pos: string;
  meaning: string;
}

interface DuelState {
  id: string;
  mode: "1" | "2";
  status: "pending" | "ready" | "active" | "finished" | "forfeited";
  wordbookId: number;
  durationSec: number;
  roundCount: number;
  wordIds: number[];
  challenger: { id: number; username: string };
  opponent: { id: number; username: string } | null;
  currentWordId: number | null;
  currentWordSpelling: string | null;
  currentWordGlosses: Gloss[] | null;
  serverNow: number;
  startedAt: string | null;
  finishedAt: string | null;
  timeLeftSec: number | null;
  currentRoundIndex: number | null;
  currentRoundStartedAt: string | null;
  myScore: number;
  opponentScore: number;
  opponentStatus: "waiting" | "submitted" | "disconnected" | "forfeited" | null;
  opponentLastSeenAt: string | null;
  winnerId: number | null;
  forfeitById: number | null;
}

export function DuelRoomClient({
  duelId,
  myUserId,
  myUsername,
  initialMode,
  initialStatus,
  wordbookName,
  challengerName,
  opponentName,
  isChallenger,
  initialWordIds,
}: {
  duelId: string;
  myUserId: number;
  myUsername: string;
  initialMode: "1" | "2";
  initialStatus: "pending" | "ready" | "active" | "finished" | "forfeited";
  wordbookName: string;
  challengerName: string;
  opponentName: string | null;
  isChallenger: boolean;
  initialWordIds: number[];
}) {
  const [state, setState] = useState<DuelState | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRoundRef = useRef(false);
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchState = async () => {
      try {
        const res = await fetch(`/api/duel/${duelId}/state`);
        if (!res.ok) return;
        const data: DuelState = await res.json();
        if (!cancelled) {
          setState(data);
          if (data.currentRoundIndex != null) {
            submittedRoundRef.current = false;
          }
        }
      } catch {
        // silent
      }
    };

    fetchState();
    pollRef.current = setInterval(fetchState, 1000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [duelId]);

  useEffect(() => {
    if (!state) return;
    if (["finished", "forfeited"].includes(state.status)) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [state?.status]);

  useEffect(() => {
    if (state?.status === "active" && state.currentWordId != null) {
      inputRef.current?.focus();
    }
  }, [state?.status, state?.currentWordId]);

  async function submitAnswer() {
    if (!input.trim()) return;
    if (submitting) return;
    if (!state?.currentWordId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/duel/${duelId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordId: state.currentWordId,
          typed: input,
          roundIndex: state.mode === "2" ? state.currentRoundIndex : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "提交失败");
        return;
      }
      const data = await res.json();
      setResult({ correct: data.correct });
      setInput("");
      submittedRoundRef.current = true;
      setTimeout(() => setResult(null), 1500);
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !submitting) {
      submitAnswer();
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }

  async function startDuel() {
    setError(null);
    try {
      const res = await fetch(`/api/duel/${duelId}/start`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "开始失败");
      }
    } catch {
      setError("网络错误");
    }
  }

  const display = state ?? null;
  const status = display?.status ?? initialStatus;
  const mode = display?.mode ?? initialMode;

  const isActive = status === "active";
  const isFinished = status === "finished" || status === "forfeited";
  const hasWord = isActive && display?.currentWordId != null && display.currentWordSpelling != null;
  const waitingForOpponent =
    display?.mode === "2" &&
    status === "active" &&
    submittedRoundRef.current &&
    display.opponentStatus !== "submitted";

  const statusBadge = {
    pending: "等待对手",
    ready: "准备开始",
    active: "进行中",
    finished: "已完成",
    forfeited: "对手掉线",
  }[status];

  const winnerTrophy = display?.winnerId === myUserId;
  const isTie = display?.winnerId == null;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Swords className="w-6 h-6 text-accent" />
          <h1 className="text-xl font-bold">单挑</h1>
        </div>
        <span className="text-sm px-3 py-1 rounded-full bg-muted text-muted-foreground">
          {statusBadge}
        </span>
      </div>

      {/* Wordbook info */}
      <p className="text-sm text-muted-foreground">词库：{wordbookName}</p>

      {/* ---- PENDING ---- */}
      {status === "pending" && (
        <div className="space-y-6 text-center py-12">
          <h2 className="text-2xl font-bold">等待对手加入</h2>
          <p className="text-muted-foreground">
            分享链接给对手，对手加入后自动开始
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-lg text-sm font-mono">
            <span className="truncate max-w-[240px]">{pageUrl}</span>
            <button
              onClick={copyLink}
              className="p-1.5 rounded-md hover:bg-border transition-colors"
              title="复制链接"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          {copied && (
            <p className="text-sm text-success">链接已复制</p>
          )}
          {mode === "1" && (
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              速度赛 60 秒，倒计时归零自动结束
            </div>
          )}
          {mode === "2" && (
            <div className="text-sm text-muted-foreground">
              轮次赛 {display?.roundCount ?? initialWordIds.length} 轮，每轮双方比拼正确与速度
            </div>
          )}
        </div>
      )}

      {/* ---- READY ---- */}
      {status === "ready" && (
        <div className="space-y-6 text-center py-12">
          <div className="flex items-center justify-center gap-4 text-lg">
            <Users className="w-5 h-5 text-accent" />
            <span className="font-semibold">{challengerName}</span>
            <span className="text-muted-foreground">vs</span>
            <span className="font-semibold">{display?.opponent?.username ?? opponentName ?? "???"}</span>
          </div>
          {mode === "1" && (
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              速度赛 60 秒，倒计时归零自动结束
            </p>
          )}
          {mode === "2" && (
            <p className="text-sm text-muted-foreground">
              轮次赛 {display?.roundCount ?? initialWordIds.length} 轮，每轮双方比拼正确与速度
            </p>
          )}
          <button
            onClick={startDuel}
            className="px-8 py-3 bg-accent text-accent-foreground rounded-lg text-lg font-medium hover:bg-accent-hover transition-colors"
          >
            开始
          </button>
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
      )}

      {/* ---- ACTIVE ---- */}
      {isActive && (
        <>
          {/* Mode 1: countdown */}
          {mode === "1" && (
            <div
              className={`text-6xl font-mono font-bold text-center ${
                (display?.timeLeftSec ?? 0) < 10 ? "animate-pulse text-error" : "text-accent"
              }`}
            >
              {display?.timeLeftSec != null ? `${Math.ceil(display.timeLeftSec)}s` : "---"}
            </div>
          )}

          {/* Mode 2: round header */}
          {mode === "2" && (
            <div className="text-center">
              <span className="text-lg font-semibold text-accent">
                第 {(display?.currentRoundIndex ?? 0) + 1} / {display?.roundCount ?? initialWordIds.length} 轮
              </span>
            </div>
          )}

          {/* Word / Gloss display */}
          {hasWord ? (
            <div className="space-y-4">
              <div className="text-4xl font-mono font-bold text-center py-8">???</div>
              {display?.currentWordGlosses && display.currentWordGlosses.length > 0 && (
                <div className="text-center space-y-1">
                  {display.currentWordGlosses.map((g, i) => (
                    <p key={i} className="text-lg text-muted-foreground">
                      <span className="text-xs uppercase text-accent mr-2">{g.pos}</span>
                      {g.meaning}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-lg text-muted-foreground py-8">已完成所有题目</p>
          )}

          {/* Input area */}
          {hasWord && !waitingForOpponent && (
            <div>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入拼写..."
                className="w-full text-2xl text-center px-4 py-3 border-2 border-border rounded-lg bg-transparent focus:border-accent focus:outline-none transition-colors"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={submitAnswer}
                disabled={submitting || !input.trim()}
                className="w-full mt-4 py-3 bg-accent text-accent-foreground rounded-lg text-lg font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {submitting ? "提交中..." : "提交"}
              </button>
              {error && <p className="text-sm text-error mt-2">{error}</p>}
            </div>
          )}

          {/* Waiting for opponent (mode 2) */}
          {waitingForOpponent && (
            <div className="text-center py-8">
              <p className="text-lg text-muted-foreground animate-pulse">等待对手...</p>
            </div>
          )}

          {/* Feedback */}
          {result && (
            <div className={`text-center text-lg font-semibold ${result.correct ? "text-success" : "text-error"}`}>
              {result.correct ? "✓ 正确" : `✗ 错误`}
            </div>
          )}

          {/* Mode 2 opponent status */}
          {mode === "2" && display?.opponentStatus && display.opponentStatus !== "waiting" && (
            <div className="text-center text-sm text-muted-foreground">
              {display.opponentStatus === "submitted" && "对手已提交"}
              {display.opponentStatus === "disconnected" && "对手已断线"}
              {display.opponentStatus === "forfeited" && "对手已掉线"}
            </div>
          )}

          {/* Scores */}
          <div className="flex justify-center gap-8 pt-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{myUsername}</p>
              <p className="text-2xl font-bold">{display?.myScore ?? 0}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">对手</p>
              <p className="text-2xl font-bold">{display?.opponentScore ?? 0}</p>
            </div>
          </div>
        </>
      )}

      {/* ---- FINISHED ---- */}
      {status === "finished" && (
        <div className="space-y-6 text-center py-12">
          {winnerTrophy ? (
            <div className="flex flex-col items-center gap-2">
              <Trophy className="w-12 h-12 text-success" />
              <h2 className="text-3xl font-bold">你赢了！</h2>
            </div>
          ) : isTie ? (
            <h2 className="text-3xl font-bold">平局</h2>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <AlertTriangle className="w-12 h-12 text-warning" />
              <h2 className="text-3xl font-bold">输了</h2>
            </div>
          )}

          {mode === "1" && (
            <p className="text-lg text-muted-foreground">
              你答对 {display?.myScore ?? 0} 题，对手答对 {display?.opponentScore ?? 0} 题
            </p>
          )}
          {mode === "2" && (
            <p className="text-lg text-muted-foreground">
              轮次 {display?.roundCount ?? initialWordIds.length} 轮
            </p>
          )}

          <Link
            href="/duel"
            className="inline-block px-6 py-3 bg-accent text-accent-foreground rounded-lg text-lg font-medium hover:bg-accent-hover transition-colors"
          >
            再来一局
          </Link>
        </div>
      )}

      {/* ---- FORFEITED ---- */}
      {status === "forfeited" && (
        <div className="space-y-6 text-center py-12">
          <div className="flex flex-col items-center gap-2">
            <Trophy className="w-12 h-12 text-success" />
            <h2 className="text-3xl font-bold">对手已掉线，自动判胜</h2>
          </div>

          <p className="text-muted-foreground">
            你答对 {display?.myScore ?? 0} 题
          </p>

          <Link
            href="/duel"
            className="inline-block px-6 py-3 bg-accent text-accent-foreground rounded-lg text-lg font-medium hover:bg-accent-hover transition-colors"
          >
            再来一局
          </Link>
        </div>
      )}

      {/* Loading */}
      {!state && !isFinished && status !== "pending" && status !== "ready" && (
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      )}
    </div>
  );
}