"use client";

import type { DailyStat } from "@/lib/word-history";

interface WrongWordSparklineProps {
  data: DailyStat[];
}

const W = 120;
const H = 32;

/**
 * 30-day daily-accuracy sparkline for a single wrong word.
 * ~120×32px inline SVG. Empty branch shown when the word has no
 * attempts in the 30-day window. Hover tooltip added in slice-3.
 */
export function WrongWordSparkline({ data }: WrongWordSparklineProps) {
  const hasAttempts = data.length > 0 && data.some((d) => d.total > 0);
  if (!hasAttempts) {
    return (
      <span className="text-xs text-muted-fg">近 30 天无练习记录</span>
    );
  }

  const n = data.length;
  const dx = W / (n - 1);

  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = data[i]!;
    const acc = d.total > 0 ? d.correct / d.total : 0;
    const x = i * dx;
    const y = H - acc * H;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      className="text-accent block"
      role="img"
      aria-label="近30天准确率"
    >
      <path
        d={`M ${pts.join(" L ")}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}