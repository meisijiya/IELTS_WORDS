import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return (
    <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">设置</h1>
        <p className="text-sm text-muted-fg mt-1">个性化你的练习体验</p>
        <p className="text-xs text-muted-foreground mt-1">
          当前用户：<span className="font-medium">{user.username}</span>
          {user.role === "admin" && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-accent-soft text-accent text-[10px] font-semibold">ADMIN</span>
          )}
        </p>
      </header>
      <SettingsClient currentUsername={user.username} currentRole={user.role} />
    </main>
  );
}