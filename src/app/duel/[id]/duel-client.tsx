"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, Swords, Clock, Trophy, AlertTriangle, Users, Copy, X, Volume2 } from "lucide-react";

const DUEL_WORD_FLASH_MS = 600;
const DUEL_FADE_MS = 200;

function normalizeSpelling(spelling: string): string {
  return spelling
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
  myReady: boolean;
  opponentReady: boolean;
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
  const [result, setResult] = useState<
    { correct: boolean; spelling: string; typed: string } | null
  >(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [togglingReady, setTogglingReady] = useState(false);
  const [accent, setAccent] = useState<"us" | "uk">("us");
  const [hintPos, setHintPos] = useState<number>(-1);
  const [showWord, setShowWord] = useState(false);
  const [wordOpacity, setWordOpacity] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRoundRef = useRef(false);
  const lastAudioWordIdRef = useRef<number | null>(null);
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

  // ponytail: pull accent once for audio file naming (falls back to "us").
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!cancelled && s && (s.accent === "uk" || s.accent === "us")) {
          setAccent(s.accent);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ponytail: on each new word → audio + random hint + brief reveal.
  useEffect(() => {
    if (!state || state.status !== "active") return;
    const wordId = state.currentWordId;
    const spelling = state.currentWordSpelling;
    if (wordId == null || !spelling) return;
    if (lastAudioWordIdRef.current === wordId) return;
    lastAudioWordIdRef.current = wordId;

    const len = spelling.length;
    setHintPos(len > 0 ? Math.floor(Math.random() * len) : -1);

    const normalized = normalizeSpelling(spelling);
    const primary = `/audio/${normalized}.${accent}.mp3`;
    const fallback = `/audio/${normalized}.${accent === "us" ? "uk" : "us"}.mp3`;
    try {
      const audio = new Audio(primary);
      audio.volume = 0.8;
      let tried = false;
      audio.onerror = () => {
        if (tried) return;
        tried = true;
        const fb = new Audio(fallback);
        fb.volume = 0.8;
        fb.play().catch(() => {});
      };
      audio.play().catch(() => {});
    } catch {
      // autoplay policy / pre-DOM
    }

    setShowWord(true);
    setWordOpacity(1);
    const fadeT = setTimeout(() => setWordOpacity(0), DUEL_WORD_FLASH_MS);
    const hideT = setTimeout(() => setShowWord(false), DUEL_WORD_FLASH_MS + DUEL_FADE_MS);
    return () => {
      clearTimeout(fadeT);
      clearTimeout(hideT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentWordId, state?.status, accent]);

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
      setResult({
        correct: data.correct,
        spelling: data.spelling ?? "",
        typed: input,
      });
      setInput("");
      submittedRoundRef.current = true;
      // ponytail: longer dwell on wrong so user can read the correct spelling.
      const dwell = data.correct ? 700 : 1400;
      setTimeout(() => setResult(null), dwell);
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
    setCopyError(false);
    // Modern path. Works on https:// and localhost (secure context).
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(pageUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch {
        // fall through to legacy fallback
      }
    }
    // Legacy fallback for http:// (non-secure context) where clipboard API is gated.
    try {
      const ta = document.createElement("textarea");
      ta.value = pageUrl;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, pageUrl.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setCopyError(true);
      }
    } catch {
      setCopyError(true);
    }
  }

  async function cancelDuel() {
    if (cancelling) return;
    if (!confirm("确认取消该挑战？取消后该 ID 将失效，对手将无法加入。")) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/duel/${duelId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "取消失败");
        return;
      }
      router.push("/duel");
    } catch {
      setError("网络错误");
    } finally {
      setCancelling(false);
    }
  }

  async function markReady() {
    setTogglingReady(true);
    setError(null);
    try {
      const res = await fetch(`/api/duel/${duelId}/start`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "操作失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setTogglingReady(false);
    }
  }

  async function unmarkReady() {
    setTogglingReady(true);
    setError(null);
    try {
      const res = await fetch(`/api/duel/${duelId}/start`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "撤销失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setTogglingReady(false);
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/duel"
            className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="返回单挑列表"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Swords className="w-6 h-6 text-accent shrink-0" />
          <h1 className="text-xl font-bold shrink-0">单挑</h1>
        </div>
        <span className="text-xs sm:text-sm px-3 py-1 rounded-full bg-muted text-muted-foreground shrink-0">
          {statusBadge}
        </span>
      </div>

      {/* Wordbook info */}
      <p className="text-sm text-muted-foreground">词库：{wordbookName}</p>

      {/* ---- PENDING ---- */}
      {status === "pending" && (
        <div className="space-y-6 text-center py-8 sm:py-12">
          <h2 className="text-2xl font-bold">等待对手加入</h2>
          <p className="text-muted-foreground">
            分享链接给对手，对手加入后自动开始
          </p>
          <div className="flex items-stretch gap-1 max-w-md mx-auto">
            <input
              type="text"
              readOnly
              value={pageUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 px-3 py-2 bg-muted rounded-l-lg text-xs sm:text-sm font-mono border border-border border-r-0 focus:outline-none"
              onClick={(e) => e.currentTarget.select()}
              aria-label="分享链接"
            />
            <button
              onClick={copyLink}
              className="px-3 py-2 bg-accent text-accent-foreground rounded-r-lg text-sm font-medium hover:bg-accent-hover transition-colors inline-flex items-center gap-1.5"
              title="复制链接"
            >
              <Copy className="w-4 h-4" />
              {copied ? "已复制" : "复制"}
            </button>
          </div>
          {copyError && (
            <p className="text-xs text-warning">
              浏览器拦截了自动复制。长按上方输入框 → 全选 → 复制即可。
            </p>
          )}
          {copied && !copyError && (
            <p className="text-sm text-success">链接已复制 ✓</p>
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
          {isChallenger && (
            <div className="pt-4 border-t border-border/60 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={cancelDuel}
                disabled={cancelling}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2 border border-error/40 text-error hover:bg-error/10 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                {cancelling ? "取消中..." : "取消挑战"}
              </button>
            </div>
          )}
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
      )}

      {/* ---- READY (双方就绪握手) ---- */}
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

          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-sm">
            <div
              className={`p-3 rounded-md border ${
                (display?.myReady ?? false)
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              <div className="font-medium flex items-center justify-center gap-1.5">
                {(display?.myReady ?? false) ? "✓ 已就绪" : "未就绪"}
              </div>
              <div className="text-xs mt-0.5">你 ({myUsername})</div>
            </div>
            <div
              className={`p-3 rounded-md border ${
                (display?.opponentReady ?? false)
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              <div className="font-medium flex items-center justify-center gap-1.5">
                {(display?.opponentReady ?? false) ? "✓ 已就绪" : "等待中…"}
              </div>
              <div className="text-xs mt-0.5">
                对手 (
                {display?.opponent?.username ?? opponentName ?? "???"}
                )
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            双方都点击「开始」后比赛正式生效。
          </p>

          {display?.myReady ? (
            <>
              <button
                disabled
                className="px-8 py-3 bg-success/15 text-success rounded-lg text-lg font-medium cursor-default"
              >
                ✓ 已就绪，等待对手…
              </button>
              <button
                onClick={unmarkReady}
                disabled={togglingReady}
                className="block mx-auto text-xs text-muted-foreground hover:text-foreground underline"
              >
                {togglingReady ? "撤销中..." : "撤销就绪"}
              </button>
            </>
          ) : (
            <button
              onClick={markReady}
              disabled={togglingReady}
              className="px-8 py-3 bg-accent text-accent-foreground rounded-lg text-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {togglingReady ? "提交中..." : "开始"}
            </button>
          )}
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

          {/* Word / Hint display */}
          {hasWord ? (
            <div className="space-y-4">
              <div className="flex justify-center items-center gap-1.5 text-4xl font-mono font-bold min-h-[4rem] tracking-wider">
                {display!.currentWordSpelling!.split("").map((ch, i) => (
                  <span
                    key={i}
                    className={
                      i === hintPos
                        ? "text-accent border-b-2 border-accent px-1.5"
                        : showWord
                          ? "text-foreground border-b-2 border-border px-1.5 transition-opacity"
                          : "text-muted-foreground/40 border-b-2 border-border px-1.5"
                    }
                    style={
                      !showWord && i !== hintPos
                        ? undefined
                        : { opacity: i === hintPos ? 1 : wordOpacity }
                    }
                    aria-hidden={!showWord && i !== hintPos}
                  >
                    {i === hintPos ? ch : showWord ? ch : "_"}
                  </span>
                ))}
              </div>
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
              <p className="text-xs text-center text-muted-foreground">
                <button
                  type="button"
                  onClick={() => {
                    if (!display?.currentWordSpelling) return;
                    const normalized = normalizeSpelling(display.currentWordSpelling);
                    const a = new Audio(`/audio/${normalized}.${accent}.mp3`);
                    a.volume = 0.8;
                    a.play().catch(() => {});
                  }}
                  className="hover:text-accent transition inline-flex items-center gap-1"
                  title="重播发音"
                >
                  <Volume2 className="h-3.5 w-3.5" /> 重播
                </button>
              </p>
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
            <div className="text-center space-y-3 animate-fade-in">
              <div className={`text-xl font-semibold ${result.correct ? "text-success" : "text-error"}`}>
                {result.correct ? "✓ 正确" : "✗ 答错"}
              </div>
              <div className="text-3xl font-mono font-bold tracking-wider text-foreground">
                {result.spelling}
              </div>
              {!result.correct && result.typed && (
                <div className="text-sm text-muted-foreground">
                  你输入的：<span className="font-mono text-error line-through">{result.typed}</span>
                </div>
              )}
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

      {/* Footer nav: home + back to list (always visible) */}
      <div className="pt-6 mt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <Home className="w-3.5 h-3.5" />
          返回主页
        </Link>
        <Link
          href="/duel"
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition"
        >
          ← 单挑列表
        </Link>
      </div>
    </div>
  );
}