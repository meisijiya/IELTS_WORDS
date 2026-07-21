"use client";

import { useState, type MouseEvent } from "react";
import type { DailyStat } from "@/lib/word-history";

const W = 120;
const H = 32;

interface WrongWordSparklineProps {
  data: DailyStat[];
}

/**
 * Map an SVG-space x coordinate (0..W) to the nearest data point index.
 * Exported for unit testing; -1 when data is empty, 0 when length === 1.
 */
export function findNearestIndex(x: number, data: DailyStat[]): number {
  if (data.length === 0) return -1;
  if (data.length === 1) return 0;
  const dx = W / (data.length - 1);
  const idx = Math.round(x / dx);
  return Math.max(0, Math.min(data.length - 1, idx));
}

/**
 * 30-day daily-accuracy sparkline for a single wrong word.
 * Fixed 120×32px inline SVG; responsive via max-w-full. Empty branch
 * when no attempts in 30-day window. Hover shows a guide line + dot
 * + tooltip with `date · X/Y · Z%`. Tooltip clamps its translateX at
 * first/last points so it doesn't get clipped by ancestor overflow.
 */
export function WrongWordSparkline({ data }: WrongWordSparklineProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const hasAttempts = data.length > 0 && data.some((d) => d.total > 0);
  if (!hasAttempts) {
    return (
      <span className="text-xs text-muted-fg">近 30 天无练习记录</span>
    );
  }

  const n = data.length;
  const dx = n > 1 ? W / (n - 1) : 0;

  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = data[i]!;
    const acc = d.total > 0 ? d.correct / d.total : 0;
    pts.push(`${(i * dx).toFixed(2)},${(H - acc * H).toFixed(2)}`);
  }

  function handleMouseMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const x = Math.max(0, Math.min(1, ratio)) * W;
    setHoverIdx(findNearestIndex(x, data));
  }
  function handleMouseLeave() {
    setHoverIdx(null);
  }

  const hover = hoverIdx !== null ? data[hoverIdx]! : null;
  const hoverX = hoverIdx !== null ? hoverIdx * dx : 0;
  const hoverY =
    hoverIdx !== null && hover && hover.total > 0
      ? H - (hover.correct / hover.total) * H
      : H;
  const hoverPct =
    hoverIdx !== null && hover && hover.total > 0
      ? Math.round((hover.correct / hover.total) * 100)
      : 0;
  const tooltipTranslate =
    hoverIdx === 0
      ? "translateX(0)"
      : hoverIdx === n - 1
      ? "translateX(-100%)"
      : "translateX(-50%)";

  return (
    <div className="relative w-[120px] max-w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        preserveAspectRatio="none"
        className="text-accent block max-w-full h-auto"
        role="img"
        aria-label="近30天准确率"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <path
          d={`M ${pts.join(" L ")}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hoverIdx !== null && (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={0}
              y2={H}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.4}
            />
            <circle cx={hoverX} cy={hoverY} r={2} fill="currentColor" />
          </>
        )}
      </svg>
      {hover && (
        <div
          className="absolute -top-7 px-1.5 py-0.5 bg-foreground text-background text-xs rounded shadow-sm whitespace-nowrap pointer-events-none"
          style={{
            left: `${(hoverIdx! / (n - 1)) * 100}%`,
            transform: tooltipTranslate,
          }}
        >
          {`${hover.date} · ${hover.correct}/${hover.total} · ${hoverPct}%`}
        </div>
      )}
    </div>
  );
}