"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ActiveSession {
  id: string;
  wordbookId: number;
  wordbookSlug: string;
  wordbookName: string;
  wordIds: number[] | null;
  mode: string;
  totalWords: number;
  correctCount: number;
  startedAt: string;
}

export function ActiveSessionCard({ session }: { session: ActiveSession }) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);
  const isTargeted = session.wordIds !== null;
  const isReview = session.mode === "review";

  async function handleEnd() {
    if (!confirm(`结束"${session.wordbookName}"的未完成会话？\n进度会保留为已完成状态。`)) return;
    setEnding(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/end`, { method: "DELETE" });
      if (!res.ok) {
        alert("结束失败");
        setEnding(false);
        return;
      }
      router.refresh();
    } catch {
      alert("网络错误");
      setEnding(false);
    }
  }

  const continueHref = isTargeted
    ? `/practice/${session.wordbookSlug}?ids=${session.wordIds!.join(",")}`
    : `/practice/${session.wordbookSlug}`;

  return (
    <div className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg shadow-soft-sm gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium flex items-center gap-2 flex-wrap">
          <span>{session.wordbookName}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isTargeted
                ? "bg-warning/15 text-warning"
                : "bg-accent-soft text-accent"
            }`}
          >
            {isTargeted ? `精选 ${session.wordIds!.length} 词` : "常规"}
          </span>
          {isReview && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-success/15 text-success">
              错题复习
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          开始于 {new Date(session.startedAt).toLocaleString("zh-CN")}
          {session.totalWords > 0 && (
            <span className="ml-2 text-success">
              · 已练 {session.totalWords} 词（{session.correctCount} 正确）
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={continueHref}
          className="text-sm px-4 py-1.5 bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent-hover active:scale-[0.97] transition"
        >
          继续
        </Link>
        <button
          onClick={handleEnd}
          disabled={ending}
          className="text-sm px-3 py-1.5 border border-border rounded-md text-muted-foreground hover:text-error hover:border-error transition disabled:opacity-50"
        >
          {ending ? "结束中…" : "结束"}
        </button>
      </div>
    </div>
  );
}