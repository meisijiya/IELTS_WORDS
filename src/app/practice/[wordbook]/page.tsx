import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";
import { PracticeClient } from "./practice-client";

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ wordbook: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  if (!(await isAuthenticated())) {
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
        <p className="text-muted-fg mt-2">slug: {slug}</p>
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

  return (
    <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">{wb.name}</h1>
        <p className="text-sm text-muted-fg">
          {practiceWordIds
            ? `精选练习 · ${practiceWordIds.length} 词`
            : `Flash-then-Spell 模式 · ${wb._count.words} 词可选`}
        </p>
      </header>
      <PracticeClient
        wordbookId={wb.id}
        wordbookSlug={wb.slug}
        practiceWordIds={practiceWordIds}
      />
    </main>
  );
}