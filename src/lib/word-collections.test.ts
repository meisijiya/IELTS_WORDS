import { describe, expect, it } from "vitest";
import {
  aggregateWordsByWord,
  partitionWords,
  sortByAttempts,
  sortByMasteredAt,
  type AttemptLike,
} from "./word-collections";

const baseWord = (overrides: Partial<AttemptLike["word"]> = {}) => ({
  spelling: "test",
  pos: null,
  glosses: "[]",
  level: 0,
  masteredAt: null,
  ...overrides,
});

const att = (
  wordId: number,
  correct: boolean,
  createdAt: Date,
  word: AttemptLike["word"] = baseWord(),
): AttemptLike => ({ wordId, correct, createdAt, word });

describe("partitionWords", () => {
  it("classifies mastered (level=5) into 'mastered' bucket", () => {
    const w = {
      wordId: 1,
      spelling: "x",
      pos: null,
      glosses: [],
      level: 5,
      attempts: 10,
      correct: 9,
      mistakes: 1,
      masteredAt: new Date("2026-07-15"),
      lastAttemptAt: new Date(),
    };
    const { wrong, learning, mastered } = partitionWords([w]);
    expect(mastered).toHaveLength(1);
    expect(wrong).toHaveLength(0);
    expect(learning).toHaveLength(0);
  });

  it("classifies mistakes>0 + level<5 into 'wrong' bucket", () => {
    const w = {
      wordId: 2,
      spelling: "y",
      pos: null,
      glosses: [],
      level: 1,
      attempts: 5,
      correct: 3,
      mistakes: 2,
      masteredAt: null,
      lastAttemptAt: new Date(),
    };
    const { wrong, learning, mastered } = partitionWords([w]);
    expect(wrong).toHaveLength(1);
    expect(learning).toHaveLength(0);
    expect(mastered).toHaveLength(0);
  });

  it("classifies attempts>0 + mistakes==0 + level<5 into 'learning' bucket", () => {
    const w = {
      wordId: 3,
      spelling: "z",
      pos: null,
      glosses: [],
      level: 2,
      attempts: 4,
      correct: 4,
      mistakes: 0,
      masteredAt: null,
      lastAttemptAt: new Date(),
    };
    const { wrong, learning, mastered } = partitionWords([w]);
    expect(learning).toHaveLength(1);
    expect(wrong).toHaveLength(0);
    expect(mastered).toHaveLength(0);
  });

  it("with masteryThreshold=3, level=4 + masteredAt=null goes to 'mastered' bucket", () => {
    const w = {
      wordId: 5,
      spelling: "a",
      pos: null,
      glosses: [],
      level: 4,
      attempts: 6,
      correct: 6,
      mistakes: 0,
      masteredAt: null,
      lastAttemptAt: new Date(),
    };
    const { wrong, learning, mastered } = partitionWords([w], 3);
    expect(mastered).toHaveLength(1);
    expect(wrong).toHaveLength(0);
    expect(learning).toHaveLength(0);
  });

  it("with masteryThreshold=3, level=2 stays in 'learning' bucket", () => {
    const w = {
      wordId: 6,
      spelling: "b",
      pos: null,
      glosses: [],
      level: 2,
      attempts: 5,
      correct: 5,
      mistakes: 0,
      masteredAt: null,
      lastAttemptAt: new Date(),
    };
    const { wrong, learning, mastered } = partitionWords([w], 3);
    expect(learning).toHaveLength(1);
    expect(mastered).toHaveLength(0);
  });

  it("masteredAt != null always routes to 'mastered' regardless of level vs threshold", () => {
    const w = {
      wordId: 7,
      spelling: "c",
      pos: null,
      glosses: [],
      level: 0, // low level but already promoted
      attempts: 1,
      correct: 1,
      mistakes: 0,
      masteredAt: new Date("2026-07-10"),
      lastAttemptAt: new Date(),
    };
    const { mastered, wrong, learning } = partitionWords([w], 5);
    expect(mastered).toHaveLength(1);
    expect(learning).toHaveLength(0);
    expect(wrong).toHaveLength(0);
  });

  it("defaults to masteryThreshold=5 when arg omitted (back-compat)", () => {
    const w = {
      wordId: 8,
      spelling: "d",
      pos: null,
      glosses: [],
      level: 5,
      attempts: 10,
      correct: 10,
      mistakes: 0,
      masteredAt: new Date(),
      lastAttemptAt: new Date(),
    };
    const { mastered } = partitionWords([w]);
    expect(mastered).toHaveLength(1);
  });

  it("classifies untouched words (attempts==0) into nothing", () => {
    const w = {
      wordId: 4,
      spelling: "w",
      pos: null,
      glosses: [],
      level: 0,
      attempts: 0,
      correct: 0,
      mistakes: 0,
      masteredAt: null,
      lastAttemptAt: new Date(0),
    };
    const { wrong, learning, mastered } = partitionWords([w]);
    expect([...wrong, ...learning, ...mastered]).toHaveLength(0);
  });
});

describe("aggregateWordsByWord", () => {
  it("sums attempts/correct/mistakes per wordId across multiple attempts", () => {
    const t0 = new Date("2026-07-21T10:00:00Z");
    const attempts = [
      att(1, true, t0),
      att(1, false, new Date("2026-07-21T11:00:00Z")),
      att(1, true, new Date("2026-07-21T12:00:00Z")),
    ];
    const out = aggregateWordsByWord(attempts);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      wordId: 1,
      attempts: 3,
      correct: 2,
      mistakes: 1,
    });
    // lastAttemptAt is the most recent
    expect(out[0]!.lastAttemptAt.toISOString()).toBe("2026-07-21T12:00:00.000Z");
  });

  it("returns empty array for empty input", () => {
    expect(aggregateWordsByWord([])).toEqual([]);
  });
});

describe("sortByAttempts", () => {
  it("sorts descending by attempts, then by most recent lastAttemptAt", () => {
    const w1 = {
      wordId: 1, spelling: "a", pos: null, glosses: [], level: 1,
      attempts: 3, correct: 2, mistakes: 1, masteredAt: null,
      lastAttemptAt: new Date("2026-07-10"),
    };
    const w2 = {
      wordId: 2, spelling: "b", pos: null, glosses: [], level: 1,
      attempts: 3, correct: 2, mistakes: 1, masteredAt: null,
      lastAttemptAt: new Date("2026-07-15"),
    };
    const w3 = {
      wordId: 3, spelling: "c", pos: null, glosses: [], level: 1,
      attempts: 5, correct: 5, mistakes: 0, masteredAt: null,
      lastAttemptAt: new Date("2026-07-05"),
    };
    const sorted = sortByAttempts([w1, w2, w3]);
    expect(sorted.map((w) => w.wordId)).toEqual([3, 2, 1]);
  });
});

describe("sortByMasteredAt", () => {
  it("sorts descending by masteredAt; words without masteredAt go last", () => {
    const w1 = {
      wordId: 1, spelling: "a", pos: null, glosses: [], level: 5,
      attempts: 10, correct: 10, mistakes: 0,
      masteredAt: new Date("2026-07-10"),
      lastAttemptAt: new Date(),
    };
    const w2 = {
      wordId: 2, spelling: "b", pos: null, glosses: [], level: 5,
      attempts: 10, correct: 10, mistakes: 0,
      masteredAt: new Date("2026-07-20"),
      lastAttemptAt: new Date(),
    };
    const w3 = {
      wordId: 3, spelling: "c", pos: null, glosses: [], level: 5,
      attempts: 10, correct: 10, mistakes: 0,
      masteredAt: null,
      lastAttemptAt: new Date(),
    };
    const sorted = sortByMasteredAt([w1, w2, w3]);
    expect(sorted.map((w) => w.wordId)).toEqual([2, 1, 3]);
  });
});