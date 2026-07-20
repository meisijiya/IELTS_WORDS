import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return (
    <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">设置</h1>
        <p className="text-sm text-muted-fg mt-1">个性化你的练习体验</p>
      </header>
      <SettingsClient />
    </main>
  );
}