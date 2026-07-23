"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegisterForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [displayName] = useState(""); // legacy field — no longer used
  void displayName;
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Frontend validation: passwords must match.
    if (password !== passwordConfirm) {
      setError("两次输入的密码不一致");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 个字符");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "注册失败");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 p-8 border border-gray-200 dark:border-gray-800 rounded-lg"
      >
        <h1 className="text-2xl font-bold">注册账户</h1>
        <p className="text-sm text-muted-foreground">Yasi Words · 雅思单词拼写训练</p>

        <div>
          <label htmlFor="code" className="block text-sm font-medium mb-2">
            邀请码
          </label>
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoFocus
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent font-mono"
            placeholder="向 admin 获取"
          />
        </div>

        <div>
          <label htmlFor="username" className="block text-sm font-medium mb-2">
            用户名
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            pattern="[a-zA-Z0-9_]+"
            minLength={3}
            maxLength={32}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-2">
            密码
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent"
          />
        </div>

        <div>
          <label htmlFor="passwordConfirm" className="block text-sm font-medium mb-2">
            再次输入密码
          </label>
          <input
            id="passwordConfirm"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent"
          />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-accent text-accent-foreground rounded font-medium disabled:opacity-50"
        >
          {loading ? "注册中..." : "注册"}
        </button>

        <p className="text-sm text-muted-foreground text-center pt-2 border-t border-gray-200 dark:border-gray-800">
          已有账户？
          <a
            href="/login"
            className="ml-1 text-accent hover:text-accent-hover font-medium"
          >
            去登录
          </a>
        </p>
      </form>
    </main>
  );
}
