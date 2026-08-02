import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createRef } from "react";
import { DiffRow } from "./practice-client";

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
