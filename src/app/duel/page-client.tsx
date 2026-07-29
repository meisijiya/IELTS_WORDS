"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, LogIn, Plus, Swords, Trophy, Trash2 } from "lucide-react";

export type DuelStatus =
  | "pending"
  | "ready"
  | "active"
  | "finished"
  | "forfeited";

export interface DuelListItem {
  id: string;
  mode: "1" | "2";
  status: DuelStatus;
  wordbook: { id: number; name: string; slug: string };
  challenger: { id: number; username: string };
  opponent: { id: number; username: string } | null;
  durationSec: number;
  roundCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  winnerId: number | null;
  myRole: "challenger" | "opponent";
}

const STATUS_BADGE: Record<
  DuelStatus,
  { label: string; cls: string }
> = {
  pending: { label: "等待对手", cls: "bg-accent-soft text-accent" },
  ready: { label: "准备开始", cls: "bg-muted text-muted-foreground" },
  active: { label: "进行中", cls: "bg-success/15 text-success" },
  finished: { label: "已完成", cls: "bg-muted text-muted-foreground" },
  forfeited: { label: "对手掉线", cls: "bg-error/15 text-error" },
};

export function DuelListClient({
  currentUser,
  wordbooks,
  duels: initialDuels,
}: {
  currentUser: { id: number; username: string };
  wordbooks: Array<{ id: number; name: string; slug: string }>;
  duels: DuelListItem[];
}) {
  const router = useRouter();
  const [duels, setDuels] = useState<DuelListItem[]>(initialDuels);

  const [mode, setMode] = useState<"1" | "2">("1");
  const [wordbookId, setWordbookId] = useState<number>(
    wordbooks[0]?.id ?? 0,
  );
  const [roundCount, setRoundCount] = useState<10 | 20 | 30 | 50>(20);
  const [joinId, setJoinId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/duel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: Number(mode),
          wordbookId,
          ...(mode === "2" ? { roundCount } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "创建失败");
        return;
      }
      const data = await res.json();
      router.push(`/duel/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setCreating(false);
    }
  }

  function handleJoin() {
    const id = joinId.trim();
    if (!id) {
      setError("请输入对决 ID");
      return;
    }
    router.push(`/duel/${id}`);
  }

  const activeDuels = duels.filter((d) =>
    ["pending", "ready", "active"].includes(d.status),
  );
  const finishedDuels = duels.filter((d) =>
    ["finished", "forfeited"].includes(d.status),
  );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Swords className="h-7 w-7 text-accent" />
          单挑
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          向对手发起 1v1 单挑，比拼单词拼写速度与准确度。
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">创建挑战</h2>
        <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">模式</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "1" | "2")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent"
              >
                <option value="1">速度赛 60 秒</option>
                <option value="2">轮次赛</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">词库</label>
              <select
                value={wordbookId}
                onChange={(e) => setWordbookId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent"
              >
                {wordbooks.map((wb) => (
                  <option key={wb.id} value={wb.id}>
                    {wb.name}
                  </option>
                ))}
              </select>
            </div>
            {mode === "2" && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">
                  轮数
                </label>
                <select
                  value={roundCount}
                  onChange={(e) =>
                    setRoundCount(Number(e.target.value) as 10 | 20 | 30 | 50)
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent"
                >
                  <option value={10}>10 轮</option>
                  <option value={20}>20 轮</option>
                  <option value={30}>30 轮</option>
                  <option value={50}>50 轮</option>
                </select>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={creating || !wordbookId}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground rounded-md text-sm font-medium hover:bg-accent-hover transition disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? "创建中..." : "创建挑战"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">加入挑战</h2>
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="对决 ID 或链接"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJoin();
            }}
          />
          <button
            onClick={handleJoin}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-border text-muted-foreground hover:text-foreground rounded-md transition"
          >
            <LogIn className="h-4 w-4" />
            加入
          </button>
        </div>
      </section>

      {activeDuels.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">进行中</h2>
          <div className="space-y-2">
            {activeDuels.map((d) => (
              <DuelRow
                key={d.id}
                d={d}
                currentUserId={currentUser.id}
                onCanceled={(id) => setDuels((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        </section>
      )}

      {finishedDuels.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">历史单挑</h2>
          <div className="space-y-2">
            {finishedDuels.map((d) => (
              <DuelRow
                key={d.id}
                d={d}
                currentUserId={currentUser.id}
                onCanceled={() => {}}
              />
            ))}
          </div>
        </section>
      )}

      {duels.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          还没有对决。点击上方创建挑战，或输入 ID 加入对手的挑战。
        </p>
      )}
    </div>
  );
}

function DuelRow({
  d,
  currentUserId,
  onCanceled,
}: {
  d: DuelListItem;
  currentUserId: number;
  onCanceled: (id: string) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const badge = STATUS_BADGE[d.status];
  const isFinished =
    d.status === "finished" || d.status === "forfeited";
  const opponentName =
    d.myRole === "challenger"
      ? d.opponent?.username ?? "等待加入"
      : d.challenger.username;
  const opponentPrefix = d.myRole === "challenger" ? "vs" : "由";
  const canCancel =
    d.myRole === "challenger" &&
    (d.status === "pending" || d.status === "ready");
  // ponytail: either side may hide a finished/forfeited record from
  // their own list; server decides soft vs hard delete.
  const canDelete = isFinished;

  let resultLabel: string | null = null;
  if (isFinished) {
    if (d.winnerId === null) resultLabel = "平局";
    else if (d.winnerId === currentUserId) resultLabel = "你胜";
    else resultLabel = "你负";
  }

  async function handleRemove(e: React.MouseEvent, confirmMsg: string) {
    e.preventDefault();
    e.stopPropagation();
    if (cancelling) return;
    if (!confirm(confirmMsg)) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/duel/${d.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "操作失败");
        return;
      }
      onCanceled(d.id);
    } catch {
      alert("网络错误");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3 hover:border-accent/40 transition flex-wrap">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-2">
          {d.mode === "1" ? (
            <>
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              速度赛 60s
            </>
          ) : (
            <>
              <Swords className="h-3.5 w-3.5 text-muted-foreground" />
              轮次赛 {d.roundCount} 轮
            </>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{d.wordbook.name}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 truncate">
          {opponentPrefix} {opponentName}
          <span className="mx-1">·</span>
          {new Date(d.createdAt).toLocaleString("zh-CN")}
          {resultLabel && (
            <span
              className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                resultLabel === "你胜"
                  ? "bg-success/15 text-success"
                  : resultLabel === "你负"
                    ? "bg-error/15 text-error"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {resultLabel}
            </span>
          )}
        </div>
      </div>
      <span
        className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${badge.cls}`}
      >
        {badge.label}
      </span>
      {d.status === "finished" && d.winnerId === currentUserId && (
        <Trophy className="h-4 w-4 text-success" />
      )}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {canCancel && (
          <button
            onClick={(e) =>
              handleRemove(e, "确认取消该挑战？取消后该 ID 将失效。")
            }
            disabled={cancelling}
            className="px-3 py-1.5 border border-error/40 text-error hover:bg-error/10 rounded-md text-sm font-medium transition disabled:opacity-50"
            title="取消该挑战"
          >
            {cancelling ? "取消中..." : "取消"}
          </button>
        )}
        {canDelete && !canCancel && (
          <button
            onClick={(e) =>
              handleRemove(e, "从历史记录中删除？仅从你的视角隐藏。")
            }
            disabled={cancelling}
            className="px-3 py-1.5 border border-border text-muted-foreground hover:text-error hover:border-error/40 rounded-md text-sm font-medium transition disabled:opacity-50 inline-flex items-center gap-1"
            title="从历史记录中删除"
            aria-label="删除该历史记录"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
        )}
        <Link
          href={`/duel/${d.id}`}
          className="px-3 py-1.5 bg-accent text-accent-foreground rounded-md text-sm font-medium hover:bg-accent-hover transition"
        >
          进入
        </Link>
      </div>
    </div>
  );
}