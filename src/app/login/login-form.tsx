"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function sanitizeNext(raw: string | null): string {
  if (!raw) return "/";
  // Block protocol-relative URLs ("//evil.com") to prevent open redirect.
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeNext(searchParams.get("next"));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "登录失败");
        return;
      }
      router.push(nextPath);
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
        <h1 className="text-2xl font-bold">登录</h1>
        <p className="text-sm text-muted-fg">Yasi Words · 雅思单词拼写训练</p>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-2">
            密码
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent"
          />
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-accent text-accent-fg rounded font-medium disabled:opacity-50"
        >
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </main>
  );
}