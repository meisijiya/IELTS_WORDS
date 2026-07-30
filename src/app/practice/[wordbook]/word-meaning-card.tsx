import { Sparkles } from "lucide-react";

interface Gloss {
  pos: string;
  meaning: string;
}

export interface WordMeaningCardProps {
  pos: string | null;
  glosses: Gloss[];
  level: number;
  attempts: number;
  correct: number;
  masteryThreshold: number;
  masteredAt: string | null;
}

/**
 * Server-rendered meaning + meta row for the practice page.
 * Always visible — does not depend on phase state. Extracted from
 * practice-client.tsx (lines 912-938) to keep that file under 700 lines
 * and to make the meaning display testable in isolation.
 */
export function WordMeaningCard({
  pos,
  glosses,
  level,
  attempts,
  correct,
  masteryThreshold,
  masteredAt,
}: WordMeaningCardProps) {
  const meaning = glosses.map((g) => g.meaning).join("; ");
  return (
    <>
      <div className="text-center text-lg text-muted-foreground min-h-[2rem]">
        {pos && <span className="mr-2 font-mono text-sm">{pos}</span>}
        <span>{meaning}</span>
      </div>

      <div className="flex items-center justify-center gap-3 text-xs flex-wrap">
        {masteredAt ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-success/15 text-success rounded-full font-medium">
            <Sparkles className="h-3.5 w-3.5" /> 已熟练
            <span className="text-success/70">· 第 {attempts} 次（答对 {correct} 次）</span>
            <span className="text-success/70">· 复习中</span>
          </span>
        ) : attempts > 0 ? (
          <>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-soft text-accent rounded-full font-medium">
              等级 {level} / {masteryThreshold}
            </span>
            <span className="text-muted-foreground">
              已答对 {correct} 次 · 总尝试 {attempts}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-muted text-muted-foreground rounded-full">
            <Sparkles className="h-3.5 w-3.5" /> 新词
          </span>
        )}
      </div>
    </>
  );
}