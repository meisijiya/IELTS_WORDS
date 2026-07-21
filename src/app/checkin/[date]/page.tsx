import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { CheckinClient } from "./checkin-client";

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  const { date } = await params;

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-accent transition"
          >
            ← 返回主页
          </Link>
          <Link
            href="/analytics"
            className="text-sm text-muted-foreground hover:text-accent transition inline-flex items-center gap-1.5"
          >
            <BarChart3 className="h-4 w-4" /> 分析
          </Link>
        </div>

        <CheckinClient date={date} />
      </div>
    </main>
  );
}