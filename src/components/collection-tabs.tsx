"use client";

import Link from "next/link";

export type CollectionKey = "wrong" | "learning" | "mastered";

interface Props {
  wordbookSlug: string;
  current: CollectionKey;
  range?: string;
}

const TABS: { key: CollectionKey; suffix: string; label: string }[] = [
  { key: "wrong", suffix: "wrong-words", label: "错词榜" },
  { key: "learning", suffix: "learning", label: "学习中" },
  { key: "mastered", suffix: "mastered", label: "已掌握" },
];

export function CollectionTabs({ wordbookSlug, current, range }: Props) {
  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = t.key === current;
        const href = range
          ? `/${t.suffix}/${wordbookSlug}?range=${range}`
          : `/${t.suffix}/${wordbookSlug}`;
        return (
          <Link
            key={t.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              active
                ? "border-accent text-accent"
                : "border-transparent text-muted-fg hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}