import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  aggregateWordsByWord,
  partitionWords,
  sortByAttempts,
} from "@/lib/word-collections";
import { aggregateWordHistories } from "@/lib/word-history";
import { LearningClient } from "./learning-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ wordbook: string }>;
  searchParams: Promise<{ range?: string }>;
}

export default async function LearningPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { wordbook: slug } = await params;
  const { range = "all" } = await searchParams;

  const wordbook = await prisma.wordbook.findUnique({ where: { slug } });
  if (!wordbook) {
    redirect("/analytics");
  }

  const now = new Date();
  const since = (() => {
    if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    if (range === "month") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d;
    }
    return null;
  })();

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { masteryThreshold: true },
  });
  const masteryThreshold = settings?.masteryThreshold ?? 5;

  const [attempts, historyAttempts, userWordRows] = await Promise.all([
    prisma.attempt.findMany({
      where: {
        userId: user.id,
        session: { wordbookId: wordbook.id },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      include: { word: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.attempt.findMany({
      where: {
        userId: user.id,
        session: { wordbookId: wordbook.id },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { wordId: true, correct: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userWord.findMany({
      where: { userId: user.id, word: { wordbookId: wordbook.id } },
      select: { wordId: true, level: true, masteredAt: true },
    }),
  ]);

  const userWordMap = new Map(
    userWordRows.map((uw) => [uw.wordId, { level: uw.level, masteredAt: uw.masteredAt }]),
  );
  const attemptsWithUserWord = attempts.map((a) => {
    const uw = userWordMap.get(a.wordId);
    return {
      ...a,
      word: {
        ...a.word,
        level: uw?.level ?? 0,
        masteredAt: uw?.masteredAt ?? null,
      },
    };
  });

  const words = aggregateWordsByWord(attemptsWithUserWord);
  const { learning } = partitionWords(words, masteryThreshold);
  const sorted = sortByAttempts(learning);
  const wordHistories = aggregateWordHistories(historyAttempts, now);

  return (
    <LearningClient
      wordbook={{ id: wordbook.id, slug: wordbook.slug, name: wordbook.name }}
      range={range}
      words={sorted}
      wordHistories={wordHistories}
    />
  );
}