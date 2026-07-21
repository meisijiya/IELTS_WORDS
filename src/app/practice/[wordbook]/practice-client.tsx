"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Word {
  id: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  level: number;
}

const FADE_MS = 300;
const FEEDBACK_CORRECT_MS = 700;
const SESSION_DEFAULT = 20;

function normalizeSpelling(spelling: string): string {
  return spelling
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function computeHintPositions(spelling: string, level: number): Set<number> {
  const hints = new Set<number>();
  const len = spelling.length;
  if (len <= 1) return hints;
  if (level === 0) {
    hints.add(0);
    const others = Array.from({ length: len }, (_, i) => i).filter((i) => i !== 0);
    hints.add(others[Math.floor(Math.random() * others.length)]);
  } else if (level <= 2) {
    hints.add(0);
  }
  return hints;
}

interface ActiveSessionResponse {
  session: {
    id: string;
    startedAt: string;
    totalWords: number;
    correctCount: number;
    wordIds: number[] | null;
  } | null;
}

export function PracticeClient({
  wordbookId,
  wordbookSlug,
  practiceWordIds,
}: {
  wordbookId: number;
  wordbookSlug: string;
  practiceWordIds: number[] | null;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resumedSession, setResumedSession] = useState<{ correctCount: number; totalWords: number } | null>(null);
  const [queue, setQueue] = useState<Word[]>([]);
  const [originalSize, setOriginalSize] = useState(0);
  const [current, setCurrent] = useState<Word | null>(null);
  const [hintPositions, setHintPositions] = useState<Set<number>>(new Set());
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; expected?: string; typed?: string } | null>(null);
  const [showSpelling, setShowSpelling] = useState(false);
  const [spellingOpacity, setSpellingOpacity] = useState(0);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flashMs, setFlashMs] = useState(800);
  const [enablePronunciation, setEnablePronunciation] = useState(true);
  const [accent, setAccent] = useState<"us" | "uk">("us");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [settingsRes, activeRes] = await Promise.all([
          fetch("/api/settings"),
          fetch(`/api/sessions/active?wordbookId=${wordbookId}`),
        ]);
        if (!settingsRes.ok) throw new Error("加载设置失败");
        if (!activeRes.ok) throw new Error("查询未完成会话失败");
        const settings: {
          flashMs: number;
          enablePronunciation: boolean;
          accent: "us" | "uk";
        } = await settingsRes.json();
        const active: ActiveSessionResponse = await activeRes.json();
        if (cancelled) return;
        setFlashMs(settings.flashMs);
        setEnablePronunciation(settings.enablePronunciation);
        setAccent(settings.accent);

        let sid: string;
        if (active.session) {
          sid = active.session.id;
          setResumedSession({
            correctCount: active.session.correctCount,
            totalWords: active.session.totalWords,
          });
        } else {
          const created = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wordbookId,
              wordIds: practiceWordIds ?? undefined,
            }),
          });
          if (created.status === 409) {
            const data = await created.json();
            setError(data.message ?? "已有未完成会话，请先在主页结束它");
            setLoading(false);
            return;
          }
          if (!created.ok) throw new Error("创建会话失败");
          const session = await created.json();
          sid = session.id;
        }
        if (cancelled) return;
        setSessionId(sid);

        const count = practiceWordIds?.length ?? SESSION_DEFAULT;
        const url = practiceWordIds
          ? `/api/words?wordbookId=${wordbookId}&ids=${practiceWordIds.join(",")}`
          : `/api/words?wordbookId=${wordbookId}&random=true&limit=${count}`;
        const wordsRes = await fetch(url);
        if (!wordsRes.ok) throw new Error("加载单词失败");
        const { words }: { words: Word[] } = await wordsRes.json();
        if (cancelled) return;

        setQueue(words);
        setOriginalSize(words.length);
        setCurrent(words[0] ?? null);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "未知错误");
        setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [wordbookId, practiceWordIds]);

  useEffect(() => {
    if (!current || feedback) return;
    setHintPositions(computeHintPositions(current.spelling, current.level));
    setUserInput("");
    setShowSpelling(true);
    setSpellingOpacity(1);
    if (enablePronunciation) {
      playPronunciation(current.spelling);
    }
    const fadeTimer = setTimeout(() => setSpellingOpacity(0), flashMs);
    const hideTimer = setTimeout(() => setShowSpelling(false), flashMs + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [current, feedback, flashMs, enablePronunciation, accent]);

  function playPronunciation(spelling: string) {
    try {
      const audio = new Audio(`/audio/${normalizeSpelling(spelling)}.${accent}.mp3`);
      audio.volume = 0.8;
      audio.play().catch(() => {});
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!showSpelling && !feedback) {
      inputRef.current?.focus();
    }
  }, [showSpelling, feedback]);

  async function postAttempt(word: Word, input: string, correct: boolean) {
    if (!sessionId) return;
    await fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, wordId: word.id, typed: input, correct }),
    });
  }

  async function endSession(finalStats: { correct: number; wrong: number }) {
    if (!sessionId) return;
    await fetch(`/api/sessions/${sessionId}/end`, { method: "DELETE" });
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endedAt: new Date().toISOString(),
        totalWords: originalSize,
        correctCount: finalStats.correct,
      }),
    });
  }

  function advance(word: Word, wasCorrect: boolean) {
    const rest = queue.slice(1);
    const newQueue = wasCorrect ? rest : [...rest, word];
    const newStats = {
      correct: stats.correct + (wasCorrect ? 1 : 0),
      wrong: stats.wrong + (wasCorrect ? 0 : 1),
    };
    setStats(newStats);
    setQueue(newQueue);
    setCurrent(newQueue[0] ?? null);
    setUserInput("");
    setFeedback(null);
    if (newQueue.length === 0) {
      setFinished(true);
      endSession(newStats);
    }
  }

  function checkAnswer(word: Word, input: string): boolean {
    const expected = word.spelling.toLowerCase();
    const user = input.toLowerCase();
    if (user.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i++) {
      if (hintPositions.has(i)) continue;
      if (expected[i] !== user[i]) return false;
    }
    return true;
  }

  function submit() {
    if (!current || feedback) return;
    const isCorrect = checkAnswer(current, userInput);
    setFeedback({
      correct: isCorrect,
      expected: isCorrect ? undefined : current.spelling,
      typed: isCorrect ? undefined : userInput,
    });
    postAttempt(current, userInput, isCorrect);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (feedback) {
        advance(current!, feedback.correct);
      } else {
        submit();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (feedback) return;
      setUserInput("");
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (feedback) return;
    const clean = e.target.value
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, current?.spelling.length ?? 0);
    setUserInput(clean);
  }

  async function handleEndSession() {
    if (!sessionId) return;
    if (!confirm("确定要结束当前会话吗？进度将保留。")) return;
    await fetch(`/api/sessions/${sessionId}/end`, { method: "DELETE" });
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endedAt: new Date().toISOString(),
        totalWords: stats.correct + stats.wrong,
        correctCount: stats.correct,
      }),
    });
    setFinished(true);
  }

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-12">加载中…</div>
    );
  }
  if (error) {
    return (
      <div className="text-center text-error py-12">
        <p className="mb-3">{error}</p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent-hover transition"
        >
          返回主页
        </Link>
      </div>
    );
  }
  if (finished) {
    return (
      <div className="text-center space-y-6 py-8 animate-fade-in">
        <h2 className="text-3xl font-bold tracking-tight">本轮完成 🎉</h2>
        <p className="text-lg text-muted-foreground">
          ✓ {stats.correct}　·　✗ {stats.wrong}　·　共 {originalSize} 词
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-block px-6 py-2.5 border border-border rounded-md font-medium hover:border-accent hover:text-accent transition"
          >
            返回主页
          </Link>
          <Link
            href={`/practice/${wordbookSlug}`}
            className="inline-block px-6 py-2.5 bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent-hover active:scale-[0.98] transition"
          >
            再练一轮
          </Link>
        </div>
      </div>
    );
  }
  if (!current) return <p className="text-muted-foreground">无单词数据</p>;

  const meaning = current.glosses.map((g) => g.meaning).join("; ");
  const len = current.spelling.length;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center text-sm">
        <Link
          href="/"
          className="text-muted-foreground hover:text-accent transition"
        >
          ← 返回主页
        </Link>
        <button
          onClick={handleEndSession}
          className="text-muted-foreground hover:text-error transition"
        >
          结束会话
        </button>
      </div>

      {resumedSession && resumedSession.totalWords > 0 && (
        <p className="text-xs text-center text-accent bg-accent-soft/60 rounded-full py-1.5 px-3 inline-block mx-auto block w-fit">
          📌 继续未完成会话 · 已练 {resumedSession.totalWords} 词
          {resumedSession.correctCount > 0 && `（${resumedSession.correctCount} 正确）`}
        </p>
      )}

      <div className="text-center min-h-[3.5rem] flex items-center justify-center">
        {showSpelling && !feedback ? (
          <div
            className="text-4xl font-bold tracking-wider transition-opacity"
            style={{ opacity: spellingOpacity, transitionDuration: `${FADE_MS}ms` }}
          >
            {current.spelling}
          </div>
        ) : null}
      </div>

      <div className="text-center text-lg text-muted-foreground min-h-[2rem]">
        {current.pos && <span className="mr-2 font-mono text-sm">{current.pos}</span>}
        <span>{meaning}</span>
      </div>

      <div className="space-y-5">
        <DiffRow
          expected={current.spelling}
          typed={userInput}
          hintPositions={hintPositions}
          showTyped={!!feedback && !feedback.correct}
          showExpected={!!feedback}
        />

        <input
          ref={inputRef}
          type="text"
          value={userInput}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={feedback ? "按 Enter 进入下一个" : "输入拼写…"}
          className="w-full px-4 py-3 text-lg bg-surface border-2 border-border rounded-lg focus:border-accent focus:outline-none transition"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          readOnly={!!feedback}
        />

        <div className="flex justify-center">
          {feedback ? (
            <button
              type="button"
              onClick={() => advance(current!, feedback.correct)}
              className="w-full md:w-auto px-8 py-3 text-lg bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent-hover active:scale-[0.98] transition"
            >
              下一个 →
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!userInput}
              className="w-full md:w-auto px-8 py-3 text-lg bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              提交 (Enter)
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          {feedback
            ? feedback.correct
              ? "✓ 正确 · 点击按钮或按 Enter 进入下一个"
              : "对比上方字母 · 点击按钮或按 Enter 进入下一个"
            : `点击提交或按 Enter · Esc 重置 · 提示字母：${hintPositions.size} 个`}
        </p>
      </div>

      <div className="flex justify-center gap-6 text-sm pt-2 border-t border-border">
        <span className="text-success font-medium tabular-nums">✓ {stats.correct}</span>
        <span className="text-error font-medium tabular-nums">✗ {stats.wrong}</span>
        <span className="text-muted-foreground tabular-nums">剩余 {queue.length}</span>
      </div>
    </div>
  );
}

function DiffRow({
  expected,
  typed,
  hintPositions,
  showTyped,
  showExpected,
}: {
  expected: string;
  typed: string;
  hintPositions: Set<number>;
  showTyped: boolean;
  showExpected: boolean;
}) {
  const expLower = expected.toLowerCase();
  const usrLower = typed.toLowerCase();
  const len = expected.length;

  return (
    <div className="flex justify-center gap-1 text-4xl font-mono font-bold min-h-[3rem]">
      {Array.from({ length: len }).map((_, i) => {
        const expChar = expected[i];
        const usrChar = typed[i] ?? "";
        const isHint = hintPositions.has(i);

        let display: string;
        let className: string;

        if (showExpected && showTyped) {
          if (isHint) {
            display = expChar;
            className = "text-accent border-b-2 border-accent px-1.5";
          } else if (!usrChar) {
            display = expChar;
            className = "text-error border-b-2 border-error px-1.5 bg-error/10";
          } else if (expLower[i] === usrLower[i]) {
            display = expChar;
            className = "text-success border-b-2 border-success px-1.5";
          } else {
            display = expChar;
            className = "text-error border-b-2 border-error px-1.5 bg-error/10 line-through";
          }
        } else if (showExpected) {
          display = expChar;
          className = isHint
            ? "text-accent border-b-2 border-accent px-1.5"
            : "text-foreground border-b-2 border-accent px-1.5";
        } else {
          display = isHint ? expChar : usrChar || "_";
          className = isHint
            ? "text-accent border-b-2 border-accent px-1.5"
            : usrChar
            ? "text-foreground border-b-2 border-accent px-1.5"
            : "text-muted-foreground/50 border-b-2 border-border px-1.5";
        }

        return (
          <span
            key={i}
            className={`${className} rounded transition-colors`}
            title={usrChar ? `你打的：${usrChar}` : "未输入"}
          >
            {display}
          </span>
        );
      })}
      {showExpected && typed.length > expected.length && (
        <span className="text-error border-b-2 border-error px-1.5 bg-error/10 rounded">
          +{typed.length - expected.length}
        </span>
      )}
    </div>
  );
}