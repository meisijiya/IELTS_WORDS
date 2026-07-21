"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";

type PronMode = "both" | "flash" | "feedback" | "off";
type PullMode = "review" | "balanced" | "new";

interface Settings {
  flashMs: number;
  fadeMs: number;
  pronunciationMode: PronMode;
  pullPriority: PullMode;
  enablePronunciation: boolean;
  accent: "us" | "uk";
}

const PRON_OPTIONS: { value: PronMode; label: string; hint: string }[] = [
  { value: "both", label: "都开", hint: "闪现阶段 + 反馈时各播一次（推荐）" },
  { value: "flash", label: "仅闪现", hint: "只在单词闪现阶段播发音" },
  { value: "feedback", label: "仅反馈", hint: "只在答对/答错反馈时播发音" },
  { value: "off", label: "静音", hint: "完全不播放发音" },
];

const PULL_OPTIONS: { value: PullMode; label: string; ratio: string }[] = [
  { value: "review",   label: "复习优先", ratio: "4 新 + 8 学过 + 8 已熟练" },
  { value: "balanced", label: "均衡",    ratio: "14 新 + 5 学过 + 1 已熟练" },
  { value: "new",      label: "新词优先", ratio: "18 新 + 2 学过 + 0 已熟练" },
];

export function SettingsClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "加载失败");
        setLoading(false);
      });
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("保存失败");
      const updated = await res.json();
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted-fg">加载中…</p>;
  if (!settings) return <p className="text-error">{error || "未知错误"}</p>;

  return (
    <div className="space-y-8">
      <Link href="/" className="text-sm text-muted-fg hover:text-accent">
        ← 返回主页
      </Link>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">闪现时长（毫秒）</h2>
        <p className="text-sm text-muted-fg">
          单词完全显示的时间，之后开始渐变消失
        </p>
        <div className="flex flex-wrap gap-2">
          {[400, 600, 800, 1000, 1500].map((n) => (
            <button
              key={n}
              onClick={() => setSettings({ ...settings, flashMs: n })}
              className={`px-4 py-2 rounded border ${
                settings.flashMs === n
                  ? "bg-accent text-accent-fg border-accent"
                  : "border-gray-300 dark:border-gray-700 hover:border-accent"
              }`}
            >
              {n} ms
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">单词发音</h2>
        <p className="text-sm text-muted-foreground">
          选择在哪个阶段播放真人发音（雅思听力训练）
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium">播放时机</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRON_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() =>
                  setSettings({
                    ...settings,
                    pronunciationMode: opt.value,
                    enablePronunciation: opt.value !== "off",
                  })
                }
                title={opt.hint}
                className={`px-3 py-2 rounded-md border text-sm font-medium transition ${
                  settings.pronunciationMode === opt.value
                    ? "bg-accent text-accent-fg border-accent"
                    : "border-border hover:border-accent/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {PRON_OPTIONS.find((o) => o.value === settings.pronunciationMode)?.hint}
          </p>
        </div>

        {settings.pronunciationMode !== "off" && (
          <div className="space-y-2">
            <p className="text-sm font-medium">口音</p>
            <div className="flex gap-2">
              {(["us", "uk"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setSettings({ ...settings, accent: a })}
                  className={`px-4 py-2 rounded border ${
                    settings.accent === a
                      ? "bg-accent text-accent-fg border-accent"
                      : "border-gray-300 dark:border-gray-700 hover:border-accent"
                  }`}
                >
                  {a === "us" ? "美音" : "英音"}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">拉取优先级</h2>
        <p className="text-sm text-muted-fg">
          决定一批拉取中新词、学过、已熟练的比例（默认复习优先）
        </p>
        <div className="space-y-2">
          {PULL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSettings({ ...settings, pullPriority: opt.value })}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-md border transition text-left ${
                settings.pullPriority === opt.value
                  ? "bg-accent text-accent-fg border-accent"
                  : "border-border hover:border-accent/50"
              }`}
            >
              <span className="font-medium">{opt.label}</span>
              <span
                className={`text-xs font-mono ${
                  settings.pullPriority === opt.value
                    ? "text-accent-fg/70"
                    : "text-muted-foreground"
                }`}
              >
                {opt.ratio}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2 bg-accent text-accent-fg rounded font-medium disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存设置"}
        </button>
        {saved && <span className="text-sm text-success inline-flex items-center gap-1"><Check className="h-4 w-4" /> 已保存</span>}
        {error && <span className="text-sm text-error">{error}</span>}
      </div>

      <section className="pt-8 border-t border-gray-200 dark:border-gray-800 space-y-3">
        <h2 className="text-lg font-semibold text-error">危险区域</h2>
        <p className="text-sm text-muted-fg">
          重置会清空所有学习记录（attempts / sessions / 词的 level），
          <br />
          词库本身不受影响。
        </p>
        <ResetButton />
      </section>
    </div>
  );
}

function ResetButton() {
  const CONFIRM_PHRASE = "RESET PROGRESS";
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doReset() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "progress", confirm: CONFIRM_PHRASE }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? data?.error ?? "重置失败");
      }
      setDone(true);
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "重置失败");
      setWorking(false);
    }
  }

  if (done) return <p className="text-success text-sm inline-flex items-center gap-1"><Check className="h-4 w-4" /> 重置完成，页面即将刷新</p>;

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="px-4 py-2 border border-error text-error rounded hover:bg-error hover:text-white transition"
      >
        重置所有学习记录
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        将清除所有 sessions / attempts / 单词进度（词汇本身保留）。
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono">输入 <code>{CONFIRM_PHRASE}</code>：</span>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          className="border border-border rounded px-2 py-1 font-mono text-sm bg-background"
          placeholder={CONFIRM_PHRASE}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={doReset}
          disabled={working || phrase !== CONFIRM_PHRASE}
          className="px-4 py-2 bg-error text-white rounded font-medium disabled:opacity-50"
        >
          {working ? "重置中…" : "确认重置"}
        </button>
        <button
          onClick={() => { setConfirming(false); setPhrase(""); setError(null); }}
          disabled={working}
          className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded"
        >
          取消
        </button>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}