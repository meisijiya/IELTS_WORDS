"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Word {
  id: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  level: number;
  attempts: number;
  correct: number;
  masteredAt: string | null;
}

const FADE_MS = 300;
const FEEDBACK_CORRECT_MS = 700;
const QUEUE_BATCH = 20;
const REFILL_THRESHOLD = 5;
const QUEUE_HARD_CAP = 60;
const MAX_LEVEL = 5;

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
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resumedSession, setResumedSession] = useState<{ correctCount: number; totalWords: number } | null>(null);
  const [queue, setQueue] = useState<Word[]>([]);
  const [answered, setAnswered] = useState(0);
  const [refilling, setRefilling] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const endingRef = useRef(false);
  const current = queue[0] ?? null;
  const originalSize = answered;
  const [hintPositions, setHintPositions] = useState<Set<number>>(new Set());
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; expected?: string; typed?: string } | null>(null);
  const [showSpelling, setShowSpelling] = useState(false);
  const [spellingOpacity, setSpellingOpacity] = useState(0);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, streak: 0 });
  const [streakFlash, setStreakFlash] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flashMs, setFlashMs] = useState(800);
  const [pronunciationMode, setPronunciationMode] = useState<"both" | "flash" | "feedback" | "off">("both");
  const [pullPriority, setPullPriority] = useState<"review" | "balanced" | "new">("review");
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
          pronunciationMode: "both" | "flash" | "feedback" | "off";
          pullPriority: "review" | "balanced" | "new";
          accent: "us" | "uk";
        } = await settingsRes.json();
        const active: ActiveSessionResponse = await activeRes.json();
        if (cancelled) return;
        setFlashMs(settings.flashMs);
        setPronunciationMode(settings.pronunciationMode);
        setPullPriority(settings.pullPriority);
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
              mode: practiceWordIds ? "review" : "drill",
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

        const url = practiceWordIds
          ? `/api/words?wordbookId=${wordbookId}&ids=${practiceWordIds.join(",")}`
          : `/api/words?wordbookId=${wordbookId}&random=true&limit=${QUEUE_BATCH}&priority=${pullPriority}`;
        const wordsRes = await fetch(url);
        if (!wordsRes.ok) throw new Error("加载单词失败");
        const { words }: { words: Word[] } = await wordsRes.json();
        if (cancelled) return;

        if (words.length === 0) {
          setError("🎉 已无可练单词（全部 level=5 已掌握）");
          setLoading(false);
          return;
        }
        setQueue(words);
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
    if (pronunciationMode === "both" || pronunciationMode === "flash") {
      playPronunciation(current.spelling);
    }
    const fadeTimer = setTimeout(() => setSpellingOpacity(0), flashMs);
    const hideTimer = setTimeout(() => setShowSpelling(false), flashMs + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [current, feedback, flashMs, pronunciationMode, accent]);

  function playPronunciation(spelling: string) {
    playAudioWithFallback(`/audio/${normalizeSpelling(spelling)}.${accent}.mp3`);
  }

  function playAudioWithFallback(primaryUrl: string) {
    try {
      const audio = new Audio(primaryUrl);
      audio.volume = 0.8;
      audio.onerror = () => {
        // Fall back to the other accent if the primary isn't on disk.
        const other = primaryUrl.replace(/\.(us|uk)\.mp3$/, (_, a) => (a === "us" ? ".uk.mp3" : ".us.mp3"));
        if (other === primaryUrl) return;
        const fb = new Audio(other);
        fb.volume = 0.8;
        fb.play().catch(() => {});
      };
      audio.play().catch(() => {
        audio.dispatchEvent(new Event("error"));
      });
    } catch {
      // ignore
    }
  }

  function playTone(freq: number, ms: number, type: OscillatorType = "sine", vol = 0.18) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = type;
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
      osc.start(t0);
      osc.stop(t0 + ms / 1000 + 0.02);
      osc.onended = () => ctx.close();
    } catch {
      // ignore
    }
  }

  function playCorrectChime() {
    playTone(1046, 110, "sine");
    window.setTimeout(() => playTone(1568, 140, "sine"), 90);
  }

  function playStreakChime(streak: number) {
    const tier =
      streak >= 15 ? 4 :
      streak >= 12 ? 3 :
      streak >= 9  ? 2 :
      streak >= 6  ? 1 :
      0;
    const baseFreq = 1320 + Math.min(streak, 12) * 80;
    if (tier === 0) {
      playTone(baseFreq, 120, "triangle");
      window.setTimeout(() => playTone(baseFreq * 1.5, 140, "triangle"), 60);
      window.setTimeout(() => playTone(baseFreq * 2, 180, "sine"), 130);
    } else if (tier === 1) {
      [1, 1.25, 1.5, 2].forEach((m, i) =>
        window.setTimeout(() => playTone(baseFreq * m, 130, "triangle"), i * 70));
    } else if (tier === 2) {
      for (let i = 0; i < 8; i++) {
        const f = baseFreq * (1 + i * 0.2);
        window.setTimeout(() => playTone(f, 80, "triangle", 0.12), i * 40);
      }
    } else {
      [1, 1.25, 1.5, 1.75, 2, 2.5].forEach((m, i) =>
        window.setTimeout(() => playTone(baseFreq * m, 200, "sine", 0.2), i * 60));
      setTimeout(() => {
        playTone(baseFreq * 2,   600, "sine",     0.18);
        playTone(baseFreq * 2.5, 600, "triangle", 0.15);
        playTone(baseFreq * 3,   600, "sine",     0.12);
      }, 350);
    }
  }

  function triggerMilestoneFx(streak: number) {
    if (typeof document === "undefined") return;
    const root = document.body;
    if (streak % 3 === 0 && streak > 0) {
      root.animate(
        [
          { transform: "translate(0,0)" },
          { transform: "translate(-1px,1px)" },
          { transform: "translate(1px,-1px)" },
          { transform: "translate(0,0)" },
        ],
        { duration: 90, iterations: 1, easing: "ease-out" },
      );
    }
    if (streak === 6 || streak === 9 || streak === 12 || streak === 15) {
      const intensity = streak === 15 ? 4 : streak === 12 ? 3 : streak === 9 ? 2 : 1;
      root.animate(
        Array.from({ length: 5 }, (_, i) => ({
          transform: `translate(${(i % 2 === 0 ? -1 : 1) * intensity}px, ${(i % 2 === 0 ? 1 : -1) * intensity}px)`,
        })).concat([{ transform: "translate(0,0)" }]),
        { duration: 120, easing: "ease-out" },
      );
    }
    if (streak % 3 === 0) {
      const el = document.getElementById("streak-banner");
      if (el) {
        el.classList.remove("streak-flash");
        // force reflow so the keyframe restart on each milestone
        void el.offsetWidth;
        el.classList.add("streak-flash");
      }
    }
  }

  function playWrongBuzz() {
    playTone(440, 130, "sawtooth");
    window.setTimeout(() => playTone(330, 180, "sawtooth"), 100);
  }

  useEffect(() => {
    if (!showSpelling && !feedback) {
      inputRef.current?.focus();
    }
  }, [showSpelling, feedback]);

  // Play pronunciation a second time when answer submitted (correct or wrong).
  useEffect(() => {
    if (feedback && current && (pronunciationMode === "both" || pronunciationMode === "feedback")) {
      const id = window.setTimeout(() => playPronunciation(current.spelling), 80);
      return () => window.clearTimeout(id);
    }
  }, [feedback, pronunciationMode]);

  async function postAttempt(word: Word, input: string, correct: boolean) {
    if (!sessionId) return;
    const ac = new AbortController();
    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, wordId: word.id, typed: input, correct }),
        signal: ac.signal,
      });
      if (!res.ok) return;
      const data: {
        wordLevel: number;
        masteredAt: string | null;
        newlyMastered: boolean;
        deMastered: boolean;
      } = await res.json();
      // Search the whole queue — if the word was advanced off the front or
      // pushed back on a wrong answer, it may not be queue[0] anymore.
      setQueue((prev) =>
        prev.map((w) =>
          w.id !== word.id
            ? w
            : {
                ...w,
                level: data.wordLevel,
                attempts: w.attempts + 1,
                correct: w.correct + (correct ? 1 : 0),
                masteredAt: data.newlyMastered
                  ? data.masteredAt
                  : data.deMastered
                    ? null
                    : w.masteredAt,
              },
        ),
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      // eslint-disable-next-line no-console
      console.warn("[attempts] submit failed:", e);
    } finally {
      ac.abort();
    }
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
    setQueue((prev) => {
      const next = prev.slice(1);
      if (!wasCorrect) next.push(word);
      if (next.length > QUEUE_HARD_CAP) next.splice(0, next.length - QUEUE_HARD_CAP);
      return next;
    });
    setAnswered((a) => a + 1);
    setUserInput("");
    setFeedback(null);
    refillQueue();
  }

  async function refillQueue() {
    if (practiceWordIds) return;
    if (refilling) return;
    if (queue.length >= REFILL_THRESHOLD) return;
    setRefilling(true);
    try {
      const res = await fetch(
        `/api/words?wordbookId=${wordbookId}&random=true&limit=${QUEUE_BATCH}&priority=${pullPriority}`,
      );
      if (!res.ok) return;
      const { words }: { words: Word[] } = await res.json();
      if (words.length === 0) {
        setRefilling(false);
        return;
      }
      setQueue((prev) => {
        const merged = [...prev, ...words];
        if (merged.length > QUEUE_HARD_CAP) merged.splice(0, merged.length - QUEUE_HARD_CAP);
        return merged;
      });
    } finally {
      setRefilling(false);
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
    if (isCorrect) {
      playCorrectChime();
      const next = stats.streak + 1;
      setStats({ ...stats, streak: next, correct: stats.correct + 1, wrong: stats.wrong });
      if (next > 0 && next % 3 === 0) {
        playStreakChime(next);
        triggerMilestoneFx(next);
      }
    } else {
      playWrongBuzz();
      if (stats.streak > 0) setStats({ ...stats, streak: 0, wrong: stats.wrong + 1 });
      else setStats({ ...stats, wrong: stats.wrong + 1 });
    }
    // Optimistic local update — apply BEFORE advance can pop the word off queue[0]
    // so the badge updates the moment user submits (no waiting for /api/attempts round-trip).
    setQueue((prev) =>
      prev.map((w) =>
        w.id !== current.id
          ? w
          : {
              ...w,
              level: isCorrect
                ? Math.min(MAX_LEVEL, w.level + 1)
                : Math.max(0, w.level - 1),
              attempts: w.attempts + 1,
              correct: w.correct + (isCorrect ? 1 : 0),
            },
      ),
    );
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

  async function handleEndSessionFinal() {
    if (!sessionId || endingRef.current) return;
    endingRef.current = true;
    try {
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
      setShowEndDialog(false);
      router.push("/");
    } finally {
      endingRef.current = false;
    }
  }

  async function handleSaveProgress() {
    setShowEndDialog(false);
    router.push("/");
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
          {stats.streak > 1 && (
            <span className="ml-3 text-accent">🔥 {stats.streak} 连击中</span>
          )}
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
  if (!current) {
    if (answered === 0) {
      return (
        <div className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
          <p className="text-muted-foreground">无单词数据</p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-accent text-accent-fg rounded-md font-medium hover:bg-accent-hover transition"
          >
            ← 返回主页
          </Link>
        </div>
      );
    }
    // Empty queue but user has answered — show summary so they can leave.
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center space-y-6 animate-fade-in">
        <h2 className="text-3xl font-bold tracking-tight">🎉 本轮完成</h2>
        <p className="text-lg text-muted-foreground">
          ✓ {stats.correct}　·　✗ {stats.wrong}　·　共 {answered} 词
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-block px-6 py-2.5 bg-accent text-accent-fg rounded-md font-medium hover:bg-accent-hover transition"
          >
            返回主页
          </Link>
          <Link
            href={practiceWordIds ? `/wrong-words/${wordbookSlug}` : "/analytics"}
            className="inline-block px-6 py-2.5 border border-border rounded-md font-medium hover:border-accent hover:text-accent transition"
          >
            {practiceWordIds ? "查看错词榜" : "查看分析"}
          </Link>
        </div>
      </div>
    );
  }

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
          onClick={() => setShowEndDialog(true)}
          className="text-muted-foreground hover:text-error transition"
        >
          结束训练
        </button>
      </div>

      {showEndDialog && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEndDialog(false);
          }}
        >
          <div className="bg-surface border border-border rounded-xl shadow-soft-lg p-6 max-w-sm w-full space-y-4">
            <h3 className="text-lg font-bold">结束本次会话？</h3>
            <p className="text-sm text-muted-foreground">
              本会话已练 <span className="font-semibold text-foreground">{answered}</span> 词，
              答对 <span className="font-semibold text-success">{stats.correct}</span>，
              答错 <span className="font-semibold text-error">{stats.wrong}</span>。
            </p>
            <div className="space-y-2">
              <button
                onClick={handleSaveProgress}
                className="w-full px-4 py-2.5 bg-accent text-accent-fg rounded-md font-medium hover:bg-accent-hover transition"
              >
                保存进度（稍后继续）
              </button>
              <button
                onClick={handleEndSessionFinal}
                className="w-full px-4 py-2.5 border border-error text-error rounded-md font-medium hover:bg-error/5 transition"
              >
                结束会话（不再继续）
              </button>
              <button
                onClick={() => setShowEndDialog(false)}
                className="w-full px-4 py-2 text-muted-foreground hover:text-foreground transition"
              >
                取消，继续学习
              </button>
            </div>
          </div>
        </div>
      )}

      {resumedSession && resumedSession.totalWords > 0 && (
        <p className="text-xs text-center text-accent bg-accent-soft/60 rounded-full py-1.5 px-3 inline-block mx-auto block w-fit">
          📌 继续未完成会话 · 已练 {resumedSession.totalWords} 词
          {resumedSession.correctCount > 0 && `（${resumedSession.correctCount} 正确）`}
        </p>
      )}

      <div className="text-center min-h-[3.5rem] flex items-center justify-center">
        {showSpelling && !feedback ? (
          <button
            type="button"
            onClick={() => playPronunciation(current.spelling)}
            className="group relative text-4xl font-bold tracking-wider transition-opacity cursor-pointer hover:text-accent"
            style={{ opacity: spellingOpacity, transitionDuration: `${FADE_MS}ms` }}
            title="点击重播发音"
          >
            {current.spelling}
            <span className="absolute -right-7 top-1/2 -translate-y-1/2 text-base opacity-0 group-hover:opacity-100 transition-opacity select-none" aria-hidden>
              🔊
            </span>
          </button>
        ) : null}
        {feedback && feedback.correct && (
          <button
            type="button"
            key={`ok-${current.id}-${stats.correct}`}
            onClick={() => playPronunciation(current.spelling)}
            className="group relative text-3xl font-bold text-success animate-pop-in cursor-pointer hover:text-success/70"
            title="点击重播发音"
          >
            {current.spelling}
            <span className="absolute -right-7 top-1/2 -translate-y-1/2 text-base opacity-50 group-hover:opacity-100 transition-opacity select-none" aria-hidden>
              🔊
            </span>
          </button>
        )}
        {feedback && !feedback.correct && (
          <button
            type="button"
            key={`wrong-${current.id}-${stats.wrong}`}
            onClick={() => playPronunciation(current.spelling)}
            className="group relative text-3xl font-bold text-error animate-shake cursor-pointer hover:text-error/70"
            title="点击重播发音"
          >
            {current.spelling}
            <span className="absolute -right-7 top-1/2 -translate-y-1/2 text-base opacity-50 group-hover:opacity-100 transition-opacity select-none" aria-hidden>
              🔊
            </span>
          </button>
        )}
      </div>

      <div className="text-center text-lg text-muted-foreground min-h-[2rem]">
        {current.pos && <span className="mr-2 font-mono text-sm">{current.pos}</span>}
        <span>{meaning}</span>
      </div>

      <div className="flex items-center justify-center gap-3 text-xs flex-wrap">
        {current.masteredAt ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-success/15 text-success rounded-full font-medium">
            ✦ 已熟练
            <span className="text-success/70">· 第 {current.attempts} 次（答对 {current.correct} 次）</span>
            <span className="text-success/70">· 复习中</span>
          </span>
        ) : current.attempts > 0 ? (
          <>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-soft text-accent rounded-full font-medium">
              等级 {current.level} / 5
            </span>
            <span className="text-muted-foreground">
              已答对 {current.correct} 次 · 总尝试 {current.attempts}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-muted text-muted-foreground rounded-full">
            ✧ 新词
          </span>
        )}
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

      <div
        id="streak-banner"
        className={`flex justify-center gap-6 text-sm pt-2 border-t border-border transition-colors ${
          stats.streak > 0 ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <span className="text-success font-medium tabular-nums">✓ {stats.correct}</span>
        <span className="text-error font-medium tabular-nums">✗ {stats.wrong}</span>
        <span className="text-muted-foreground tabular-nums">剩余 {queue.length}</span>
        {stats.streak >= 3 && (
          <span
            className={`font-bold tabular-nums ${
              stats.streak >= 12 ? "text-success" : stats.streak >= 6 ? "text-warning" : "text-accent"
            }`}
          >
            🔥 {stats.streak} 连击中
          </span>
        )}
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