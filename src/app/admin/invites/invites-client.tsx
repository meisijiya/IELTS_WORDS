"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Plus, Trash2, Check } from "lucide-react";

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
}: {
  invitations: Invitation[];
  users: User[];
}) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [users, setUsers] = useState(initialUsers);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

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

  async function handleRevoke(id: string) {
    if (!confirm("确定撤销该邀请码？撤销后无法恢复。")) return;
    const res = await fetch("/api/admin/invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "撤销失败");
      return;
    }
    setInvitations((prev) => prev.filter((i) => i.id !== id));
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    });
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
                  {!inv.usedAt && !expired && (
                    <>
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
                      <button
                        onClick={() => handleRevoke(inv.id)}
                        className="text-xs text-error hover:text-error/70 inline-flex items-center gap-1"
                        title="撤销邀请码"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
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
    </div>
  );
}
