import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  computeCheckinData,
  readCheckin,
  snapshotCheckin,
} from "@/lib/checkin-snapshot";

function parseDateParam(raw: string | null): Date {
  const today = new Date();
  if (!raw) return today;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return today;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekdayOf(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return WEEKDAYS[new Date(y, mo - 1, d).getDay()];
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = parseDateParam(url.searchParams.get("date"));
  const todayStr = fmtDate(new Date());

  // Lazy snapshot: serve from saved snapshot if available, otherwise
  // compute + persist, then return. /api/admin/reset also snapshots all
  // dates with attempts, so /checkin reads preserve history across resets.
  let snap = await readCheckin(date);
  if (!snap) {
    const data = await computeCheckinData(date);
    await snapshotCheckin(date);
    snap = {
      ...data,
      weekday: weekdayOf(data.date),
      isToday: data.date === todayStr,
    };
  }

  return NextResponse.json(snap);
}