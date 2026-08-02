import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createRef } from "react";
import { DiffRow, pickScaleByLength } from "./practice-client";

// Regression: DiffRow flash phase was readOnly, blocking Android IME reopen.
// Fix: gate on feedback (!showTyped && !isCorrect), not showExpected.
// SentenceCard (BlankPill) already uses the same !isFeedback gating.

const noop = () => {};

describe("DiffRow readOnly gating (IME regression)", () => {
  it("(a) normal typing: editable", () => {
    const html = renderToString(
      <DiffRow
        expected="bank"
        typed="ba"
        hintPositions={new Set([0])}
        showTyped={false}
        showExpected={false}
        isCorrect={false}
        inputRef={createRef()}
        onInputChange={noop}
        onInputKeyDown={noop}
      />,
    );
    expect(html).toMatch(/<input[^>]*aria-label="拼写 bank"/);
    expect(html).not.toMatch(/\breadonly\b/i);
  });

  it("(b) new-word flash: editable so Android focus can open IME", () => {
    // showExpected=true, showTyped=false, isCorrect=false
    // This is the exact flash phase that causes the regression.
    const html = renderToString(
      <DiffRow
        expected="atmosphere"
        typed=""
        hintPositions={new Set([0, 1])}
        showTyped={false}
        showExpected={true}
        isCorrect={false}
        inputRef={createRef()}
        onInputChange={noop}
        onInputKeyDown={noop}
        onInputFocus={noop}
        onInputBlur={noop}
      />,
    );
    expect(html).toMatch(/<input[^>]*aria-label="拼写 atmosphere"/);
    expect(html).not.toMatch(/\breadonly\b/i);
  });

  it("(c) correct feedback: remains readOnly", () => {
    const html = renderToString(
      <DiffRow
        expected="bank"
        typed="bank"
        hintPositions={new Set([0])}
        showTyped={false}
        showExpected={true}
        isCorrect={true}
        inputRef={createRef()}
        onInputChange={noop}
        onInputKeyDown={noop}
      />,
    );
    expect(html).toMatch(/<input[^>]*aria-label="拼写 bank"/);
    // Must be readOnly — user cannot edit submitted answer
    expect(html).toMatch(/\breadOnly/i);
  });

  it("(d) wrong feedback: remains readOnly", () => {
    const html = renderToString(
      <DiffRow
        expected="sprinkle"
        typed="sprnkle"
        hintPositions={new Set([0])}
        showTyped={true}
        showExpected={true}
        isCorrect={false}
        inputRef={createRef()}
        onInputChange={noop}
        onInputKeyDown={noop}
      />,
    );
    expect(html).toMatch(/<input[^>]*aria-label="拼写 sprinkle"/);
    // Must be readOnly — user cannot edit submitted answer
    expect(html).toMatch(/\breadOnly/i);
  });

  it("handlers absent: input still rendered but readOnly (defensive)", () => {
    // No handlers passed → isInteractive is false regardless
    const html = renderToString(
      <DiffRow
        expected="bank"
        typed="ba"
        hintPositions={new Set([])}
        showTyped={false}
        showExpected={false}
        isCorrect={false}
      />,
    );
    expect(html).toMatch(/<input[^>]*readOnly/);
  });
});

// Regression: long words used to overflow on mobile because the
// scrollWidth-based reactive shrink only ran AFTER first paint (so a
// 10+ letter word flashed at text-3xl before stepping down). Length-
// based sizing picks the right tier on first render, no flicker.
describe("pickScaleByLength (length-based sizing, mobile overflow fix)", () => {
  it("short word (≤6 chars) stays at scale 0 (largest)", () => {
    expect(pickScaleByLength(4, true)).toBe(0);
    expect(pickScaleByLength(6, true)).toBe(0);
  });

  it("medium word (7–9 chars) steps down to scale 1", () => {
    expect(pickScaleByLength(7, true)).toBe(1);
    expect(pickScaleByLength(9, true)).toBe(1);
  });

  it("long word (10–13 chars) — the regression case — steps to scale 2", () => {
    // "commentator" is 11 chars and was the word that overflowed in
    // the bug screenshot. scale 2 = text-xl on mobile.
    expect(pickScaleByLength(10, true)).toBe(2);
    expect(pickScaleByLength(11, true)).toBe(2);
    expect(pickScaleByLength(13, true)).toBe(2);
  });

  it("very long word (14+ chars) drops to scale 3 (tightest)", () => {
    expect(pickScaleByLength(14, true)).toBe(3);
    expect(pickScaleByLength(17, true)).toBe(3); // "characteristics"
    expect(pickScaleByLength(25, true)).toBe(3);
  });

  it("desktop breakpoints are wider (more pixels → larger tiers)", () => {
    // A 10-char word is scale 1 on desktop (text-4xl) but scale 2 on
    // mobile (text-xl) — desktop has more horizontal room.
    expect(pickScaleByLength(10, false)).toBe(1);
    expect(pickScaleByLength(10, true)).toBe(2);
    // 13 chars already bumped to desktop scale 2 (text-3xl); the
    // mobile/desktop breakpoint is 12 chars.
    expect(pickScaleByLength(13, false)).toBe(2);
  });

  it("desktop very-long (17+ chars) drops to scale 3 (text-2xl)", () => {
    expect(pickScaleByLength(17, false)).toBe(3);
  });

  it("empty/edge: zero-length word returns scale 0 (no overflow possible)", () => {
    expect(pickScaleByLength(0, true)).toBe(0);
    expect(pickScaleByLength(0, false)).toBe(0);
  });
});
