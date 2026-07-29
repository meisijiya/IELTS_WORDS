import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PracticeClient } from "./practice-client";

export const dynamic = "force-dynamic";

const DEFAULT_PULL_PRIORITY = "review" as const;
const DEFAULT_PRONUNCIATION_MODE = "both" as const;
const DEFAULT_ACCENT = "us" as const;
const DEFAULT_FALLBACK_PRIORITY: "review" | "balanced" | "new" = DEFAULT_PULL_PRIORITY;
const DEFAULT_FALLBACK_PRONUNCIATION: "both" | "flash" | "feedback" | "off" = DEFAULT_PRONUNCIATION_MODE;
const DEFAULT_FALLBACK_ACCENT: "us" | "uk" = DEFAULT_ACCENT;

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ wordbook: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { wordbook: slug } = await params;
  const { ids } = await searchParams;

  const wb = await prisma.wordbook.findUnique({
    where: { slug },
    include: { _count: { select: { words: true } } },
  });

  if (!wb) {
    return (
      <main className="min-h-screen px-6 py-12 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">词库不存在</h1>
        <p className="text-muted-foreground mt-2">slug: {slug}</p>
      </main>
    );
  }

  let practiceWordIds: number[] | null = null;
  if (ids) {
    practiceWordIds = ids
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (practiceWordIds.length === 0) practiceWordIds = null;
  }

  // Read settings in RSC so the first batch fetch (which happens before the
  // client's /api/settings call resolves) uses the user's actual pullPriority
  // instead of a hardcoded "review" default. Same fix for pronunciationMode,
  // accent, masteryThreshold, flashSkipMinLevel — all of them used to start
  // from client-side defaults and only update after the async settings fetch.
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
  });

  const initialSettings = {
    pullPriority:
      (settings?.pullPriority as "review" | "balanced" | "new" | null | undefined) ??
      DEFAULT_FALLBACK_PRIORITY,
    pronunciationMode:
      (settings?.pronunciationMode as "both" | "flash" | "feedback" | "off" | null | undefined) ??
      DEFAULT_FALLBACK_PRONUNCIATION,
    accent: (settings?.accent as "us" | "uk" | null | undefined) ?? DEFAULT_FALLBACK_ACCENT,
    flashMs: settings?.flashMs ?? 800,
    masteryThreshold: settings?.masteryThreshold ?? 5,
    flashSkipMinLevel: settings?.flashSkipMinLevel ?? null,
    soundEnabled: settings?.soundEnabled ?? true,
  };

  return (
    <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">{wb.name}</h1>
        <p className="text-sm text-muted-foreground">
          {practiceWordIds
            ? `精选练习 · ${practiceWordIds.length} 词`
            : `Flash-then-Spell 模式 · ${wb._count.words} 词可选`}
        </p>
      </header>
      <PracticeClient
        wordbookId={wb.id}
        wordbookSlug={wb.slug}
        practiceWordIds={practiceWordIds}
        initialSettings={initialSettings}
      />
    </main>
  );
}