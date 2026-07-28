/**
 * Duel domain logic — state machine, winner calculation, forfeit detection, stats aggregation.
 *
 * Sandbox mode: this module NEVER writes to Attempt / UserWord / Checkin / Session.
 * All match data lives in Duel + DuelAnswer tables only.
 */
import type { PrismaClient } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type DuelMode = "1" | "2";
export type DuelStatus =
  | "pending"
  | "ready"
  | "active"
  | "finished"
  | "forfeited";

export const DUEL_MODE_SPEED = "1" as const;
export const DUEL_MODE_ROUND = "2" as const;
export const ROUND_COUNT_OPTIONS = [10, 20, 30, 50] as const;
export const MODE1_WORD_POOL_SIZE = 50;
export const ROUND_TIMEOUT_MS = 10_000;
export const MODE1_FORFEIT_MS = 30_000;
export const MODE2_FORFEIT_MS = 60_000;

export interface DuelRow {
  id: string;
  mode: string;
  status: string;
  wordbookId: number;
  durationSec: number;
  roundCount: number;
  wordIds: string; // JSON-encoded number[]
  challengerId: number;
  opponentId: number | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  winnerId: number | null;
  forfeitById: number | null;
  challengerLastSeenAt: Date | null;
  opponentLastSeenAt: Date | null;
  currentRoundIndex: number | null;
  currentRoundStartedAt: Date | null;
}

export interface DuelAnswerRow {
  id: number;
  duelId: string;
  userId: number;
  wordId: number;
  roundIndex: number | null;
  correct: boolean;
  elapsedMs: number;
  submittedAt: Date;
}

// ──────────────────────────────────────────────────────────────────────────
// Spelling check
// ──────────────────────────────────────────────────────────────────────────

export function checkSpelling(typed: string, correct: string): boolean {
  return typed.trim().toLowerCase() === correct.trim().toLowerCase();
}

// ──────────────────────────────────────────────────────────────────────────
// WordIds JSON helper
// ──────────────────────────────────────────────────────────────────────────

export function parseWordIds(wordIdsJson: string): number[] {
  try {
    const parsed = JSON.parse(wordIdsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => Number.isInteger(n));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Mode 1 (speed race) — 60s countdown, max correct wins
// ──────────────────────────────────────────────────────────────────────────

export function isMode1TimeUp(duel: DuelRow, serverNow: number): boolean {
  if (!duel.startedAt) return false;
  const elapsedMs = serverNow - duel.startedAt.getTime();
  return elapsedMs >= duel.durationSec * 1000;
}

export function timeLeftSecMode1(duel: DuelRow, serverNow: number): number {
  if (!duel.startedAt) return duel.durationSec;
  const elapsedSec = (serverNow - duel.startedAt.getTime()) / 1000;
  return Math.max(0, duel.durationSec - elapsedSec);
}

// ──────────────────────────────────────────────────────────────────────────
// Mode 2 (round race) — N rounds, per-round winner (correct + fastest)
// ──────────────────────────────────────────────────────────────────────────

export function isMode2RoundTimedOut(
  duel: DuelRow,
  serverNow: number,
  timeoutMs: number = ROUND_TIMEOUT_MS
): boolean {
  if (!duel.currentRoundStartedAt) return false;
  return serverNow - duel.currentRoundStartedAt.getTime() >= timeoutMs;
}

export function isMode2Complete(duel: DuelRow): boolean {
  const idx = duel.currentRoundIndex ?? 0;
  return idx >= duel.roundCount;
}

// ──────────────────────────────────────────────────────────────────────────
// Round + match winner
// ──────────────────────────────────────────────────────────────────────────

export type RoundWinner = "challenger" | "opponent" | "tie";

export interface RoundParticipantAnswer {
  correct: boolean;
  elapsedMs: number;
}

/**
 * Decide who wins a single round.
 * - both null → tie (nobody showed up)
 * - one null, other present → the present player wins (vacant rule)
 * - both present, both wrong → tie
 * - one correct, other not → correct one wins
 * - both correct → faster wins; identical times → tie
 */
export function computeRoundWinner(
  challengerAnswer: RoundParticipantAnswer | null,
  opponentAnswer: RoundParticipantAnswer | null
): RoundWinner {
  if (challengerAnswer == null && opponentAnswer == null) return "tie";
  if (challengerAnswer == null) return "opponent";
  if (opponentAnswer == null) return "challenger";

  const cOk = challengerAnswer.correct;
  const oOk = opponentAnswer.correct;
  if (!cOk && !oOk) return "tie";
  if (cOk && !oOk) return "challenger";
  if (!cOk && oOk) return "opponent";

  // Both correct: faster wins; identical time → tie
  if (challengerAnswer.elapsedMs < opponentAnswer.elapsedMs) return "challenger";
  if (opponentAnswer.elapsedMs < challengerAnswer.elapsedMs) return "opponent";
  return "tie";
}

function tallyRoundWins(
  duel: DuelRow,
  answers: DuelAnswerRow[]
): { challenger: number; opponent: number } {
  const roundsPlayed = duel.currentRoundIndex ?? 0;
  let challenger = 0;
  let opponent = 0;
  for (let r = 0; r < roundsPlayed; r++) {
    const cAns = answers.find(
      (a) => a.userId === duel.challengerId && a.roundIndex === r,
    );
    const oAns = answers.find(
      (a) => a.userId === duel.opponentId && a.roundIndex === r,
    );
    const winner = computeRoundWinner(
      cAns ? { correct: cAns.correct, elapsedMs: cAns.elapsedMs } : null,
      oAns ? { correct: oAns.correct, elapsedMs: oAns.elapsedMs } : null,
    );
    if (winner === "challenger") challenger++;
    else if (winner === "opponent") opponent++;
  }
  return { challenger, opponent };
}

/**
 * Decide the overall match winner.
 * Mode 1: most correct wins (tie → null).
 * Mode 2: most round-wins wins (tie → null).
 */
export function computeWinner(
  duel: DuelRow,
  answers: DuelAnswerRow[]
): number | null {
  if (duel.mode === DUEL_MODE_SPEED) {
    const challengerCorrect = answers.filter(
      (a) => a.userId === duel.challengerId && a.correct,
    ).length;
    const opponentCorrect = answers.filter(
      (a) => a.userId === duel.opponentId && a.correct,
    ).length;
    if (challengerCorrect > opponentCorrect) return duel.challengerId;
    if (opponentCorrect > challengerCorrect) return duel.opponentId;
    return null;
  }

  // Mode 2
  if (duel.opponentId == null) return null;
  const { challenger, opponent } = tallyRoundWins(duel, answers);
  if (challenger > opponent) return duel.challengerId;
  if (opponent > challenger) return duel.opponentId;
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Forfeit detection
// ──────────────────────────────────────────────────────────────────────────

export interface ForfeitResult {
  forfeit: boolean;
  winnerId?: number;
  forfeitById?: number;
}

/**
 * Returns {forfeit:true, winnerId, forfeitById} when the opponent has been silent
 * past the mode-specific threshold. Caller is expected to persist this state.
 */
export function checkForfeit(
  duel: DuelRow,
  meId: number,
  opponentLastSeenAt: Date | null,
  serverNow: number
): ForfeitResult {
  if (duel.status !== "active") return { forfeit: false };
  if (!opponentLastSeenAt) return { forfeit: false };
  if (duel.opponentId == null) return { forfeit: false };

  const thresholdMs =
    duel.mode === DUEL_MODE_SPEED ? MODE1_FORFEIT_MS : MODE2_FORFEIT_MS;
  const elapsedMs = serverNow - opponentLastSeenAt.getTime();
  if (elapsedMs < thresholdMs) return { forfeit: false };

  // Forfeiter is the opponent (silently offline). Winner is the caller (still online).
  const opponentId = duel.opponentId;
  const isCallerChallenger = meId === duel.challengerId;
  const forfeitById = isCallerChallenger ? opponentId : duel.challengerId;
  const winnerId = isCallerChallenger ? duel.challengerId : opponentId;
  return { forfeit: true, winnerId, forfeitById };
}

// ──────────────────────────────────────────────────────────────────────────
// Today's stats (DB-backed) — used by leaderboard extension
// ──────────────────────────────────────────────────────────────────────────

export interface TodayDuelStats {
  wins: number;
  total: number;
  winRate: number | null;
}

export async function getTodayDuelStats(
  prisma: PrismaClient,
  userId: number
): Promise<TodayDuelStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const duels = await prisma.duel.findMany({
    where: {
      finishedAt: { gte: todayStart },
      status: { in: ["finished", "forfeited"] },
      opponentId: { not: null },
      OR: [{ challengerId: userId }, { opponentId: userId }],
    },
    select: {
      winnerId: true,
      challengerId: true,
      opponentId: true,
    },
  });

  const total = duels.length;
  const wins = duels.filter((d) => d.winnerId === userId).length;
  const winRate = total === 0 ? null : wins / total;
  return { wins, total, winRate };
}