import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  aggregateWordsByWord,
  partitionWords,
  sortByMasteredAt,
} from "@/lib/word-collections";
import { aggregateWordHistories } from "@/lib/word-history";
import { MasteredClient } from "./mastered-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ wordbook: string }>;
  searchParams: Promise<{ range?: string }>;
}

export default async function MasteredPage({ params, searchParams }: PageProps) {
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

  const [attempts, historyAttempts] = await Promise.all([
    prisma.attempt.findMany({
      where: {
        session: { wordbookId: wordbook.id },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      include: { word: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.attempt.findMany({
      where: {
        session: { wordbookId: wordbook.id },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { wordId: true, correct: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const words = aggregateWordsByWord(attempts);
  const { mastered } = partitionWords(words);
  const sorted = sortByMasteredAt(mastered);
  const wordHistories = aggregateWordHistories(historyAttempts, now);

  return (
    <MasteredClient
      wordbook={{ id: wordbook.id, slug: wordbook.slug, name: wordbook.name }}
      range={range}
      words={sorted}
      wordHistories={wordHistories}
    />
  );
}