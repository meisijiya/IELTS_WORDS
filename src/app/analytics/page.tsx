import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AnalyticsClient } from "./analytics-client";

export default async function AnalyticsPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  const wordbooks = await prisma.wordbook.findMany({
    orderBy: { id: "asc" },
    select: { id: true, slug: true, name: true, _count: { select: { words: true } } },
  });

  return (
    <main className="min-h-screen px-6 py-12 max-w-4xl mx-auto">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-bold">学习分析</h1>
          <p className="text-sm text-muted-fg mt-1">薄弱词 / 错误模式 / 进度</p>
        </div>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← 返回主页
        </Link>
      </header>
      <AnalyticsClient wordbooks={wordbooks} />
    </main>
  );
}