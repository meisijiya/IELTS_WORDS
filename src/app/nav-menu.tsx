"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  BarChart3,
  Settings,
  Trophy,
  Users,
  Menu,
  X,
  Swords,
  Home,
} from "lucide-react";

interface NavMenuProps {
  username: string;
  isAdmin: boolean;
}

const BASE_LINKS = [
  { href: "/", icon: Home, label: "主页", primary: true },
  { href: "/analytics", icon: BarChart3, label: "分析" },
  { href: "/leaderboard", icon: Trophy, label: "排行榜" },
  { href: "/duel", icon: Swords, label: "单挑" },
] as const;

export function NavMenu({ username, isAdmin }: NavMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = isAdmin
    ? [
        ...BASE_LINKS,
        { href: "/admin/invites", icon: Users, label: "管理" },
        { href: "/settings", icon: Settings, label: "设置" },
      ]
    : [...BASE_LINKS, { href: "/settings", icon: Settings, label: "设置" }];

  return (
    <div ref={ref} className="relative">
      {/* Wide: inline list. Narrow: collapsed into a hamburger that opens a panel. */}
      <nav className="hidden md:flex items-baseline gap-4 text-sm flex-wrap">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-accent hover:text-accent-hover transition inline-flex items-center gap-1.5"
          >
            <l.icon className="h-4 w-4" />
            {l.label}
          </Link>
        ))}
      </nav>

      {/* Narrow viewport: hamburger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "关闭菜单" : "打开菜单"}
        aria-expanded={open}
        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md border border-border text-foreground hover:bg-muted transition"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Narrow viewport: dropdown panel when open.
          Wide viewport (md+): always show full list as a side panel
          via sticky right column for ≥md screens. */}
      {open && (
        <div
          className="md:hidden absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-xl shadow-soft-lg p-2 z-30"
          role="menu"
        >
          <div className="px-3 py-2 mb-1 border-b border-border">
            <p className="text-xs text-muted-foreground">当前用户</p>
            <p className="text-sm font-medium flex items-center gap-1.5">
              {username}
              {isAdmin && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-accent font-semibold">
                  ADMIN
                </span>
              )}
            </p>
          </div>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted text-foreground transition"
              role="menuitem"
            >
              <l.icon className="h-4 w-4 text-accent" />
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export the icons the parent RSC still needs so callers don't need to
// import from lucide-react themselves if they only need labels.
export { CalendarDays };
