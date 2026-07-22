"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

export function CheckinCalendarCard({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const isToday = date === today;

  return (
    <section className="mb-10">
      <div className="p-6 bg-surface border border-border rounded-xl shadow-soft-sm hover:shadow-soft-md hover:border-accent/40 transition">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              打卡
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{date}</p>
            {!isToday && (
              <p className="mt-1 text-xs text-muted-foreground">
                今天 {today}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            aria-label="选择打卡日期"
            className="border border-border rounded-md px-3 py-1.5 bg-background text-sm font-mono focus:border-accent focus:outline-none"
          />
          {!isToday && (
            <button
              type="button"
              onClick={() => setDate(today)}
              className="text-xs text-muted-foreground hover:text-accent transition"
            >
              回到今天
            </button>
          )}
          <Link
            href={`/checkin/${date}`}
            className="ml-auto inline-flex items-center gap-1 px-4 py-1.5 bg-accent text-accent-foreground rounded-md text-sm font-medium hover:bg-accent-hover active:scale-[0.97] transition"
          >
            查看打卡 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}