"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Plus, Trash2, Check, KeyRound, AlertTriangle } from "lucide-react";

interface User {
  id: number;
  username: string;
  role: string;
  createdAt: string;
}

interface Invitation {
  id: string;
  code: string;
  inviter: { id: number; username: string };
  invitee: { id: number; username: string } | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export function InvitesClient({
  invitations: initialInvitations,
  users: initialUsers,
  currentUserId,
}: {
  invitations: Invitation[];
  users: User[];
  currentUserId: number;
}) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [users, setUsers] = useState(initialUsers);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttlDays: 7 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "创建邀请码失败");
        return;
      }
      const inv = await res.json();
      setInvitations((prev) => [
        {
          id: inv.id,
          code: inv.code,
          inviter: { id: 0, username: "you" },
          invitee: null,
          expiresAt: inv.expiresAt,
          usedAt: null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(inv: Invitation) {
    const expired = new Date(inv.expiresAt) < new Date();
    const used = !!inv.usedAt;
    let msg: string;
    if (used) {
      msg = `邀请码 ${inv.code} 已被 ${inv.invitee?.username ?? "某用户"} 使用。删除将移除该邀请记录（不影响已注册用户）。继续？`;
    } else if (expired) {
      msg = `邀请码 ${inv.code} 已过期。删除该记录？`;
    } else {
      msg = `确定撤销邀请码 ${inv.code}？撤销后无法恢复。`;
    }
    if (!confirm(msg)) return;
    const res = await fetch("/api/admin/invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: inv.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "删除失败");
      return;
    }
    setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
  }

  async function copyCode(code: string) {
    setCopyError(false);
    // ponytail: HTTPS/localhost path.
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 1500);
        return;
      } catch {
        // fall through
      }
    }
    // ponytail: HTTP fallback — clipboard API is gated without secure context.
    try {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, code.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 1500);
      } else {
        setCopyError(true);
      }
    } catch {
      setCopyError(true);
    }
  }

  function openEditUser(u: User) {
    setEditingUser(u);
    setEditUsername(u.username);
    setEditError(null);
  }

  async function saveUserEdit() {
    if (!editingUser) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: editUsername }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.error || "保存失败");
        return;
      }
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? { ...u, username: updated.username } : u)));
      setEditingUser(null);
    } finally {
      setEditSaving(false);
    }
  }

  function openDelete(u: User) {
    setDeletingUser(u);
    setDeleteConfirm("");
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deletingUser) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/users/${deletingUser.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: deleteConfirm.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "删除失败");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
      setDeletingUser(null);
    } finally {
      setDeleteSaving(false);
    }
  }

  function openReset(u: User) {
    setResettingUser(u);
    setResetPassword("");
    setResetConfirm("");
    setResetError(null);
    setResetSuccess(null);
  }

  async function confirmReset() {
    if (!resettingUser) return;
    setResetSaving(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/admin/users/${resettingUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: resetConfirm.trim(),
          newPassword: resetPassword,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setResetError(data.error || "重置失败");
        return;
      }
      setResetSuccess(`已为 ${resettingUser.username} 设置新密码`);
      setResetPassword("");
      setResetConfirm("");
    } finally {
      setResetSaving(false);
    }
  }

  return (
    <div className="space-y-8">

      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">邀请码</h2>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-md text-sm font-medium hover:bg-accent-hover transition disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> 生成新邀请码
          </button>
        </div>
        {copyError && (
          <p className="text-xs text-warning mb-2">
            浏览器拦截了自动复制。长按对应邀请码 → 全选 → 复制即可。
          </p>
        )}
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">还没有邀请码。点击右上方生成。</p>
        ) : (
          <div className="space-y-2">
            {invitations.map((inv) => {
              const expired = new Date(inv.expiresAt) < new Date();
              const status = inv.usedAt
                ? { label: "已使用", cls: "bg-success/15 text-success" }
                : expired
                  ? { label: "已过期", cls: "bg-muted text-muted-foreground" }
                  : { label: "可用", cls: "bg-accent-soft text-accent" };
              return (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg"
                >
                  <code className="font-mono text-sm flex-1 truncate">{inv.code}</code>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>
                    {status.label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    到期 {new Date(inv.expiresAt).toLocaleDateString()}
                  </span>
                  {inv.invitee && (
                    <span className="text-xs text-muted-foreground">
                      → {inv.invitee.username}
                    </span>
                  )}
                  {!expired && (
                    <button
                      onClick={() => copyCode(inv.code)}
                      className="text-xs text-accent hover:text-accent-hover inline-flex items-center gap-1"
                      title="复制邀请码"
                    >
                      {copiedCode === inv.code ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleRevoke(inv)}
                    className="text-xs text-error hover:text-error/70 inline-flex items-center gap-1"
                    title={
                      inv.usedAt
                        ? "删除已使用邀请记录（不影响已注册用户）"
                        : expired
                          ? "删除过期邀请码"
                          : "撤销邀请码"
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">已注册用户</h2>
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg"
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{u.username}</div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  u.role === "admin"
                    ? "bg-accent-soft text-accent"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {u.role}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                注册 {new Date(u.createdAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => openEditUser(u)}
                className="text-xs text-accent hover:text-accent-hover px-2 py-1 rounded border border-transparent hover:border-accent/40 transition"
                title="修改用户名"
              >
                编辑
              </button>
              {u.id !== currentUserId && (
                <>
                  <button
                    onClick={() => openReset(u)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-transparent hover:border-border transition inline-flex items-center gap-1"
                    title="重置该用户的密码"
                  >
                    <KeyRound className="h-3 w-3" />
                    重置密码
                  </button>
                  <button
                    onClick={() => openDelete(u)}
                    className="text-xs text-error hover:text-error/70 px-2 py-1 rounded border border-transparent hover:border-error/30 transition inline-flex items-center gap-1"
                    title="删除该用户（含其所有数据）"
                  >
                    <Trash2 className="h-3 w-3" />
                    删除
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {editingUser && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingUser(null);
          }}
        >
          <div className="bg-surface border border-border rounded-xl shadow-soft-lg p-6 max-w-sm w-full space-y-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-bold">修改用户名</h3>
              <span className="text-xs text-muted-foreground">{editingUser.role}</span>
            </div>
            <div>
              <label htmlFor="edit-username" className="block text-sm font-medium mb-2">
                新用户名
              </label>
              <input
                id="edit-username"
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                pattern="[a-zA-Z0-9_]+"
                minLength={3}
                maxLength={32}
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent"
              />
            </div>
            {editError && <p className="text-sm text-error">{editError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveUserEdit}
                disabled={editSaving || !editUsername}
                className="flex-1 px-4 py-2 bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent-hover transition disabled:opacity-50"
              >
                {editSaving ? "保存中..." : "保存"}
              </button>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 border border-border rounded-md text-muted-foreground hover:text-foreground transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingUser && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeletingUser(null);
          }}
        >
          <div className="bg-surface border border-error/40 rounded-xl shadow-soft-lg p-6 max-w-md w-full space-y-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-bold text-error flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                删除用户
              </h3>
              <span className="text-xs text-muted-foreground">{deletingUser.role}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              将永久删除 <strong>{deletingUser.username}</strong> 的账号及其所有数据（Session / Attempt / Checkin / UserWord / UserSettings / 邀请记录）。
              <br />
              该操作不可恢复。
            </p>
            <div>
              <label htmlFor="delete-confirm" className="block text-sm font-medium mb-2">
                输入确认短语 <code className="px-1.5 py-0.5 bg-error/15 text-error rounded font-mono">DELETE USER</code>：
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent font-mono"
              />
            </div>
            {deleteError && <p className="text-sm text-error">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteSaving || deleteConfirm !== "DELETE USER"}
                className="flex-1 px-4 py-2 bg-error text-error-foreground rounded-md font-medium hover:bg-error/90 transition disabled:opacity-50"
              >
                {deleteSaving ? "删除中..." : "确认删除"}
              </button>
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 border border-border rounded-md text-muted-foreground hover:text-foreground transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {resettingUser && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setResettingUser(null);
          }}
        >
          <div className="bg-surface border border-border rounded-xl shadow-soft-lg p-6 max-w-md w-full space-y-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                重置密码
              </h3>
              <span className="text-xs text-muted-foreground">{resettingUser.username}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              为 <strong>{resettingUser.username}</strong> 设置一个新密码。设置后请通过安全渠道告知该用户。
            </p>
            <div>
              <label htmlFor="reset-pw" className="block text-sm font-medium mb-2">
                新密码（≥ 6 字符）
              </label>
              <input
                id="reset-pw"
                type="text"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                autoFocus
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent font-mono"
              />
            </div>
            <div>
              <label htmlFor="reset-confirm" className="block text-sm font-medium mb-2">
                输入确认短语 <code className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-mono">RESET PASSWORD</code>：
              </label>
              <input
                id="reset-confirm"
                type="text"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent font-mono"
              />
            </div>
            {resetError && <p className="text-sm text-error">{resetError}</p>}
            {resetSuccess && <p className="text-sm text-success">{resetSuccess}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmReset}
                disabled={
                  resetSaving ||
                  resetConfirm !== "RESET PASSWORD" ||
                  resetPassword.length < 6
                }
                className="flex-1 px-4 py-2 bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent-hover transition disabled:opacity-50"
              >
                {resetSaving ? "重置中..." : "确认重置"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResettingUser(null);
                  setResetSuccess(null);
                }}
                className="px-4 py-2 border border-border rounded-md text-muted-foreground hover:text-foreground transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
