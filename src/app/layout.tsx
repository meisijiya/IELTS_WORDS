import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TopBar } from "@/components/top-bar";
import { ThemeProvider, type ThemeMode } from "@/components/theme-provider";
import { ThemeScript } from "@/components/theme-script";

export const metadata: Metadata = {
  title: "Yasi Words — 雅思单词拼写训练",
  description: "通过闪现-拼写模式训练雅思词汇真实拼写能力",
};

const THEME_MODES = new Set<ThemeMode>(["light", "dark", "system"]);

function readTheme(value: unknown): ThemeMode {
  return typeof value === "string" && THEME_MODES.has(value as ThemeMode)
    ? (value as ThemeMode)
    : "system";
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  // ponytail: SSR-read the stored theme so the first paint applies the
  // right .dark class without FOUC. Unauthed pages fall back to "system".
  const settings = user
    ? await prisma.userSettings.findUnique({
        where: { userId: user.id },
        select: { theme: true, pullPriority: true, sentenceMode: true },
      })
    : null;
  const initialMode = readTheme(settings?.theme);
  const initialPullPriority =
    settings?.pullPriority === "balanced" || settings?.pullPriority === "new"
      ? settings.pullPriority
      : "review";
  const initialSentenceMode =
    settings?.sentenceMode === "always" || settings?.sentenceMode === "off"
      ? settings.sentenceMode
      : "always";

  return (
    // ponytail: suppressHydrationWarning is required because ThemeScript mutates
    // <html class="dark"> before React hydrates. Without it React would warn
    // on every full reload. This only suppresses the attribute warning, not
    // any actual mismatch in our own markup.
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <ThemeScript initialMode={initialMode} />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider initialMode={initialMode}>
          {user && (
            <TopBar
              username={user.username}
              isAdmin={user.role === "admin"}
              initialPullPriority={initialPullPriority}
              initialSentenceMode={initialSentenceMode}
            />
          )}
          {/* Spacer so page content sits below the fixed top bar (h-14).
              Login/register pages have no TopBar and need no spacer. */}
          <div className={user ? "pt-14" : ""}>{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}