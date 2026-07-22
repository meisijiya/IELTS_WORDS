/**
 * Pure helpers for partitioning words by learning status.
 * Used by /wrong-words, /learning, /mastered pages (and tests).
 */

export interface CollectionWord {
  wordId: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  level: number;
  attempts: number;
  correct: number;
  mistakes: number;
  masteredAt: Date | null;
  lastAttemptAt: Date;
}

export interface AttemptLike {
  wordId: number;
  correct: boolean;
  createdAt: Date;
  word: {
    spelling: string;
    pos: string | null;
    glosses: string;
    level: number;
    masteredAt: Date | null;
  };
}

/**
 * Aggregate raw Attempt rows into one CollectionWord per wordId.
 * Mirrors the per-word aggregation done in page.tsx but is pure
 * (no DB) so it can be unit-tested.
 */
export function aggregateWordsByWord(
  attempts: AttemptLike[],
): CollectionWord[] {
  const map = new Map<number, CollectionWord>();
  for (const a of attempts) {
    let cur = map.get(a.wordId);
    if (!cur) {
      cur = {
        wordId: a.wordId,
        spelling: a.word.spelling,
        pos: a.word.pos,
        glosses: JSON.parse(a.word.glosses),
        level: a.word.level,
        attempts: 0,
        correct: 0,
        mistakes: 0,
        masteredAt: a.word.masteredAt,
        lastAttemptAt: a.createdAt,
      };
      map.set(a.wordId, cur);
    }
    cur.attempts++;
    if (a.correct) cur.correct++;
    else cur.mistakes++;
    if (a.createdAt > cur.lastAttemptAt) cur.lastAttemptAt = a.createdAt;
  }
  return [...map.values()];
}

/**
 * Mutually exclusive partition into the three learning states.
 *   mastered: level >= masteryThreshold OR masteredAt !== null
 *     (either condition qualifies — covers both "level 5 under old threshold"
 *     and "promoted by settings PUT lowering the threshold")
 *   wrong: mistakes > 0 AND level < masteryThreshold AND masteredAt === null
 *   learning: attempts > 0 AND mistakes == 0 AND level < masteryThreshold AND masteredAt === null
 * Words with attempts == 0 are dropped (never touched).
 */
export function partitionWords(
  words: CollectionWord[],
  masteryThreshold: number = 5,
): {
  wrong: CollectionWord[];
  learning: CollectionWord[];
  mastered: CollectionWord[];
} {
  const wrong: CollectionWord[] = [];
  const learning: CollectionWord[] = [];
  const mastered: CollectionWord[] = [];
  for (const w of words) {
    if (w.masteredAt !== null || w.level >= masteryThreshold) {
      mastered.push(w);
    } else if (w.mistakes > 0) {
      wrong.push(w);
    } else if (w.attempts > 0) {
      learning.push(w);
    }
    // else: never touched — skip
  }
  return { wrong, learning, mastered };
}

/** Sort for /learning: most-practiced first, then most-recent. */
export function sortByAttempts(words: CollectionWord[]): CollectionWord[] {
  return [...words].sort(
    (a, b) =>
      b.attempts - a.attempts ||
      b.lastAttemptAt.getTime() - a.lastAttemptAt.getTime(),
  );
}

/** Sort for /mastered: most-recently-mastered first; never-mastered last. */
export function sortByMasteredAt(words: CollectionWord[]): CollectionWord[] {
  return [...words].sort((a, b) => {
    if (!a.masteredAt && !b.masteredAt) return 0;
    if (!a.masteredAt) return 1;
    if (!b.masteredAt) return -1;
    return b.masteredAt.getTime() - a.masteredAt.getTime();
  });
}