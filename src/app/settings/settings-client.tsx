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
  checkinRetentionDays: number | null;
  masteryThreshold: number;
  flashSkipMinLevel: number | null;
  soundEnabled: boolean;
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

const RETENTION_PRESETS: { value: number | null; label: string }[] = [
  { value: null,   label: "无限" },
  { value: 7,      label: "7 天" },
  { value: 30,     label: "30 天" },
  { value: 90,     label: "90 天" },
  { value: 365,    label: "1 年" },
];

const MASTERY_THRESHOLD_OPTIONS: { value: number; label: string }[] = [
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 7, label: "7" },
  { value: 8, label: "8" },
  { value: 10, label: "10" },
  { value: 15, label: "15" },
  { value: 20, label: "20" },
];

const FLASH_SKIP_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "关" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
];

export function SettingsClient({
  currentUsername,
  currentRole,
}: {
  currentUsername: string;
  currentRole: string;
}) {
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

      {currentRole === "admin" && (
        <p className="text-xs text-muted-foreground">
          修改其他用户用户名请去 <Link href="/admin/invites" className="text-accent hover:underline">管理</Link> 页面。
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">修改用户名</h2>
        <p className="text-sm text-muted-foreground">
          当前：<span className="font-mono font-medium">{currentUsername}</span>
          （下次登录用新名字。需要当前密码确认）
        </p>
        <RenameUsernameForm currentUsername={currentUsername} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">修改密码</h2>
        <p className="text-sm text-muted-foreground">
          需要当前密码确认，新密码至少 6 位。修改后其他设备的 session 不会被踢出。
        </p>
        <ChangePasswordForm />
      </section>

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
        <h2 className="text-lg font-semibold">练习音效</h2>
        <p className="text-sm text-muted-foreground">
          答对/答错的合成 chime、连击升级音、屏幕震动等即时反馈。
          关闭后只静音合成音效，不影响上方真人发音设置。
        </p>
        <div className="flex gap-2">
          {([
            { value: true, label: "开启" },
            { value: false, label: "关闭" },
          ] as const).map((opt) => (
            <button
              key={opt.label}
              onClick={() => setSettings({ ...settings, soundEnabled: opt.value })}
              className={`px-4 py-2 rounded border ${
                settings.soundEnabled === opt.value
                  ? "bg-accent text-accent-fg border-accent"
                  : "border-gray-300 dark:border-gray-700 hover:border-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">熟练阈值</h2>
        <p className="text-sm text-muted-foreground">
          答对多少题算「已熟练」。默认 5。降低时会立即把已积累到该连对数的词标记为熟练
          （不影响其他词；不影响已熟练词）。
        </p>
        <div className="flex flex-wrap gap-2">
          {MASTERY_THRESHOLD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSettings({ ...settings, masteryThreshold: opt.value })}
              className={`w-12 py-2 rounded border text-sm font-medium transition ${
                settings.masteryThreshold === opt.value
                  ? "bg-accent text-accent-fg border-accent"
                  : "border-gray-300 dark:border-gray-700 hover:border-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">跳过闪现</h2>
        <p className="text-sm text-muted-foreground">
          达到该连对数的词将不显示单词文字（仍播放发音），靠听写而非看写。
          设为「关」则所有词都正常闪现。建议设小于「熟练阈值」。
        </p>
        <div className="flex flex-wrap gap-2">
          {FLASH_SKIP_OPTIONS.map((opt) => {
            const selected = settings.flashSkipMinLevel === opt.value;
            return (
              <button
                key={opt.label}
                onClick={() => setSettings({ ...settings, flashSkipMinLevel: opt.value })}
                className={`w-12 py-2 rounded border text-sm font-medium transition ${
                  selected
                    ? "bg-accent text-accent-fg border-accent"
                    : "border-gray-300 dark:border-gray-700 hover:border-accent"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">打卡保留</h2>
        <p className="text-sm text-muted-fg">
          限制「今日打卡」历史最多保留多少天。「无限」会保留所有 Checkin 快照。
          重置 attempts 仍会保留当天快照（不变量），此设置只决定上限。
        </p>
        <div className="flex flex-wrap gap-2">
          {RETENTION_PRESETS.map((opt) => {
            const selected = settings.checkinRetentionDays === opt.value;
            return (
              <button
                key={opt.label}
                onClick={() => setSettings({ ...settings, checkinRetentionDays: opt.value })}
                className={`px-4 py-2 rounded border ${
                  selected
                    ? "bg-accent text-accent-fg border-accent"
                    : "border-gray-300 dark:border-gray-700 hover:border-accent"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <CheckinCleanupButton currentRetention={settings.checkinRetentionDays} />
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
        <h2 className="text-lg font-semibold">打卡记录</h2>
        <p className="text-sm text-muted-foreground">
          删除你所有打卡快照（Checkin 表行），用于从备份/导入等场景清空聚合。
          <br />
          <strong className="font-medium">不影响</strong> attempts / sessions / 词的学习进度 —— 重置后下次访问 /checkin 会按当前 attempts 重新生成快照。
        </p>
        <ResetCheckinsButton />
      </section>

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

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword.length < 6) {
      setError("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (!currentPassword) {
      setError("请输入当前密码");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "修改失败");
        return;
      }
      setDone(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setTimeout(() => setDone(false), 3000);
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-success inline-flex items-center gap-1 p-3 border border-success/40 rounded-md bg-success/5">
        <Check className="h-4 w-4" /> 密码已更新，下次登录请用新密码
      </p>
    );
  }

  return (
    <div className="space-y-3 p-3 border border-border rounded-md bg-background">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">当前密码</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-border rounded text-sm bg-surface"
          />
        </div>
        <div />
        <div>
          <label className="block text-xs font-medium mb-1">新密码（≥ 6 位）</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            className="w-full px-3 py-2 border border-border rounded text-sm bg-surface"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">确认新密码</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-border rounded text-sm bg-surface"
          />
        </div>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={saving || !currentPassword || !newPassword || !confirm}
        className="px-4 py-2 bg-accent text-accent-foreground rounded text-sm font-medium hover:bg-accent-hover transition disabled:opacity-50"
      >
        {saving ? "修改中…" : "修改密码"}
      </button>
    </div>
  );
}

function RenameUsernameForm({ currentUsername }: { currentUsername: string }) {
  const [username, setUsername] = useState(currentUsername);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    if (username === currentUsername) {
      setError("新用户名需与当前不同");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "修改失败");
        return;
      }
      setDone(true);
      setTimeout(() => location.reload(), 800);
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-success inline-flex items-center gap-1">
        <Check className="h-4 w-4" /> 已修改，页面即将刷新
      </p>
    );
  }

  return (
    <div className="space-y-3 p-3 border border-border rounded-md bg-background">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">新用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            pattern="[a-zA-Z0-9_]+"
            minLength={3}
            maxLength={32}
            className="w-full px-3 py-2 border border-border rounded text-sm bg-surface font-mono"
            placeholder={currentUsername}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">当前密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-border rounded text-sm bg-surface"
          />
        </div>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={saving || !username || !password}
        className="px-4 py-2 bg-accent text-accent-foreground rounded text-sm font-medium hover:bg-accent-hover transition disabled:opacity-50"
      >
        {saving ? "修改中…" : "修改用户名"}
      </button>
    </div>
  );
}

function ResetCheckinsButton() {
  const CONFIRM = "CLEAN ALL CHECKINS";
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState<{ deleted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doReset() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/checkin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? "删除失败");
      }
      setDone({ deleted: data.deleted });
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setWorking(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-success inline-flex items-center gap-1">
        <Check className="h-4 w-4" /> 已删除 {done.deleted} 条打卡快照
      </p>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="px-4 py-2 border border-warning text-warning rounded text-sm font-medium hover:bg-warning hover:text-white transition"
      >
        删除所有打卡快照
      </button>
    );
  }

  return (
    <div className="space-y-3 p-3 border border-warning/40 rounded bg-warning/5">
      <p className="text-sm">
        将删除 <strong>你的</strong>所有 Checkin 行（每个日期的快照聚合）。attempts / sessions / 词的 learning state 保持不变。
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono">
          输入 <code>{CONFIRM}</code>：
        </span>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          className="flex-1 border border-border rounded px-2 py-1 font-mono text-xs bg-surface"
          placeholder={CONFIRM}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={doReset}
          disabled={working || phrase !== CONFIRM}
          className="px-4 py-2 bg-warning text-white rounded text-sm font-medium disabled:opacity-50"
        >
          {working ? "删除中…" : "确认删除"}
        </button>
        <button
          onClick={() => { setConfirming(false); setPhrase(""); setError(null); }}
          disabled={working}
          className="px-4 py-2 border border-border rounded text-sm"
        >
          取消
        </button>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
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

function CheckinCleanupButton({ currentRetention }: { currentRetention: number | null }) {
  const [confirming, setConfirming] = useState(false);
  const [days, setDays] = useState<number>(currentRetention ?? 30);
  const [phrase, setPhrase] = useState("");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState<{ days: number; deleted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveDays = currentRetention ?? days;

  async function doCleanup() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/checkin/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: effectiveDays, confirm: `CLEAN ${effectiveDays} DAYS` }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? "清理失败");
      }
      setDone({ days: effectiveDays, deleted: data.deleted });
    } catch (e) {
      setError(e instanceof Error ? e.message : "清理失败");
    } finally {
      setWorking(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-success inline-flex items-center gap-1">
        <Check className="h-4 w-4" /> 已清理 {done.deleted} 条 {done.days} 天前的打卡
      </p>
    );
  }

  if (!confirming) {
    if (currentRetention === null) {
      return (
        <p className="text-xs text-muted-foreground">
          当前保留「无限」，无需清理按钮。如需限制，先在上方选择天数。
        </p>
      );
    }
    return (
      <button
        onClick={() => { setConfirming(true); setDays(currentRetention); setPhrase(""); }}
        className="px-4 py-2 border border-warning text-warning rounded hover:bg-warning hover:text-white transition"
      >
        立即清理 {currentRetention} 天前的打卡
      </button>
    );
  }

  return (
    <div className="space-y-3 p-3 border border-warning/40 rounded bg-warning/5">
      <p className="text-sm">
        将删除 {effectiveDays} 天前（含）的所有 Checkin 快照。今天及近 {effectiveDays} 天的数据保留。
      </p>
      <div className="flex items-center gap-2">
        <label className="text-sm font-mono">清理天数（1–3650）：</label>
        <input
          type="number"
          min={1}
          max={3650}
          value={days}
          onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
          className="w-24 border border-border rounded px-2 py-1 font-mono text-sm bg-background"
        />
        <span className="text-xs text-muted-foreground">
          会用「{`CLEAN ${days} DAYS`}」
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono">输入 <code>{`CLEAN ${days} DAYS`}</code>：</span>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          className="border border-border rounded px-2 py-1 font-mono text-sm bg-background"
          placeholder={`CLEAN ${days} DAYS`}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={doCleanup}
          disabled={working || phrase !== `CLEAN ${days} DAYS`}
          className="px-4 py-2 bg-warning text-white rounded font-medium disabled:opacity-50"
        >
          {working ? "清理中…" : "确认清理"}
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