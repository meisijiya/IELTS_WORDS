"use client";

import Link from "next/link";
import { NavMenu } from "@/app/nav-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { PracticeQuickSwitch } from "@/components/practice-quick-switch";

interface TopBarProps {
  username: string;
  isAdmin: boolean;
  initialPullPriority: "review" | "balanced" | "new";
  initialSentenceMode: "always" | "off";
}

/**
 * Persistent top bar rendered by the root layout for every authenticated
 * page. Narrow viewport: a small hamburger button on the right that opens
 * the same dropdown panel used by the home page. Wide viewport: inline
 * inline links. Position: fixed so it follows scroll, and the page
 * content gets a top padding via the root layout's <main> wrapper.
 */
export function TopBar({
  username,
  isAdmin,
  initialPullPriority,
  initialSentenceMode,
}: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-surface/85 backdrop-blur border-b border-border/60">
      <div className="max-w-5xl mx-auto h-full px-4 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground hover:text-accent transition inline-flex items-center gap-1.5"
          title="返回主页"
        >
          <span className="text-accent">Y</span>
          <span className="hidden sm:inline">Yasi Words</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <PracticeQuickSwitch
            initialPullPriority={initialPullPriority}
            initialSentenceMode={initialSentenceMode}
          />
          <NavMenu username={username} isAdmin={isAdmin} />
        </div>
      </div>
    </header>
  );
}