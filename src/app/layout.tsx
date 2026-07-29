import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { TopBar } from "@/components/top-bar";

export const metadata: Metadata = {
  title: "Yasi Words — 雅思单词拼写训练",
  description: "通过闪现-拼写模式训练雅思词汇真实拼写能力",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background text-foreground">
        {user && (
          <TopBar username={user.username} isAdmin={user.role === "admin"} />
        )}
        {/* Spacer so page content sits below the fixed top bar (h-14).
            Login/register pages have no TopBar and need no spacer. */}
        <div className={user ? "pt-14" : ""}>{children}</div>
      </body>
    </html>
  );
}