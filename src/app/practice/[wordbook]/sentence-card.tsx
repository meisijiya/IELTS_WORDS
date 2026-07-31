import type { Example } from "@/lib/sentence-mode";
import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { Volume2 } from "lucide-react";

type Phase = "typing" | "feedback";

export interface SentenceCardProps {
  spelling: string;
  sentence: Example | null;
  phase: Phase;
  userTyped?: string;
  isCorrect?: boolean;
  showSpelling?: boolean;
  spellingOpacity?: number;
  hintPositions?: ReadonlySet<number>;
  /**
   * In the typing phase, render the target word's FULL spelling (instead of
   * the masked _ placeholders) inside the BlankPill. Mirrors the bare-mode
   * DiffRow behavior where the flash window shows expected letters before
   * fading. Without this prop the flash stage is invisible to the user
   * because the mask is rendered with full opacity the entire time.
   */
  showExpected?: boolean;
  /** In-typing-phase interactive pill. Pass through from practice-client. */
  inputRef?: RefObject<HTMLInputElement | null>;
  onInputChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onInputKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
  /** Manually replay pronunciation. Renders a speaker button in card header. */
  onReplayAudio?: () => void;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitAtFirstWord(
  text: string,
  spelling: string,
): { before: string; after: string } {
  const bRe = /<b>[^<]*<\/b>/i;
  const bMatch = text.match(bRe);
  if (bMatch && bMatch.index !== undefined) {
    const before = text.slice(0, bMatch.index).replace(/<[^>]+>/g, "").trimEnd();
    const after = text.slice(bMatch.index + bMatch[0].length).replace(/<[^>]+>/g, "").trimStart();
    return { before, after };
  }
  const stripped = text.replace(/<[^>]+>/g, "");
  if (!spelling) return { before: stripped, after: "" };
  const re = new RegExp(`\\b${escapeRegExp(spelling)}\\b`, "i");
  const m = stripped.match(re);
  if (!m || m.index === undefined) return { before: stripped, after: "" };
  return {
    before: stripped.slice(0, m.index).trimEnd(),
    after: stripped.slice(m.index + m[0].length).trimStart(),
  };
}

function buildMask(
  spelling: string,
  userInput: string,
  hintPositions: ReadonlySet<number>,
): { char: string; className: string }[] {
  const out: { char: string; className: string }[] = [];
  for (let i = 0; i < spelling.length; i++) {
    const expChar = spelling[i];
    const userChar = i < userInput.length ? userInput[i] : "";
    if (hintPositions.has(i)) {
      if (userChar) {
        const isWrong = userChar.toLowerCase() !== expChar.toLowerCase();
        out.push({
          char: userChar,
          className: isWrong
            ? "text-error line-through"
            : "text-white",
        });
      } else {
        out.push({ char: expChar, className: "text-white" });
      }
    } else {
      if (userChar) {
        out.push({ char: userChar, className: "text-white" });
      } else {
        out.push({ char: "_", className: "text-white/50" });
      }
    }
  }
  return out;
}

function BlankPill({
  spelling,
  isFeedback,
  isWrong,
  userTyped,
  showSpelling,
  spellingOpacity,
  mask,
  hintPositions,
  showExpected,
  inputRef,
  onInputChange,
  onInputKeyDown,
  onInputFocus,
  onInputBlur,
}: {
  spelling: string;
  isFeedback: boolean;
  isWrong: boolean;
  userTyped: string;
  showSpelling: boolean;
  spellingOpacity: number;
  mask: { char: string; className: string }[];
  hintPositions: ReadonlySet<number>;
  showExpected: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onInputChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onInputKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
}) {
  // ponytail: feedback already reveals the full word; showExpected is the
  // typing-phase flash window (mirrors DiffRow's showExpected behavior).
  const renderFullSpelling = isFeedback || showExpected;
  // ponytail: typing phase + handlers provided → pill IS the input box.
  // The visible chars (hint + userInput + _) sit behind a transparent
  // <input> overlay (absolute inset-0, text-transparent, white caret).
  // This eliminates the separate input element below — clicking the pill
  // focuses the input and opens the mobile keyboard with no page scroll,
  // because there is no separate scroll target anymore.
  const isInteractive = !isFeedback && !!inputRef && !!onInputChange && !!onInputKeyDown;
  return (
    <span
      data-testid={isFeedback ? (isWrong ? "sentence-revealed-wrong" : "sentence-revealed") : "sentence-mask"}
      className={
        isFeedback
          ? isWrong
            ? "inline-block align-bottom bg-error/15 text-error px-2 rounded-md font-mono font-bold text-[26px] tracking-[3px] shadow-[0_3px_10px_rgba(220,38,38,0.28)] animate-shake"
            : "inline-block align-bottom bg-success-soft text-success px-2 rounded-md font-mono font-bold text-[26px] tracking-[3px] shadow-[0_3px_10px_rgba(13,148,136,0.28)] animate-revealPulse"
          : "relative inline-block align-bottom bg-accent text-white px-2 rounded-md font-mono font-bold text-[26px] tracking-[3px] shadow-[0_3px_0_rgba(232,132,95,0.35)]"
      }
      style={{
        opacity: !isFeedback && showSpelling ? spellingOpacity : 1,
        transitionDuration: !isFeedback && showSpelling ? "300ms" : "0ms",
      }}
    >
      {renderFullSpelling
        ? spelling.split("").map((char, j) => {
            if (isFeedback) {
              const isCharCorrect =
                !isWrong ||
                (userTyped[j]?.toLowerCase() === char.toLowerCase());
              return (
                <span
                  key={j}
                  className={isCharCorrect ? "text-success" : "text-error"}
                >
                  {char}
                </span>
              );
            }
            // ponytail: flash window — hint positions white, others at 70%
            // opacity. text-accent would be invisible here because the pill
            // background is also bg-accent. Visual hierarchy mirrors the
            // mask-phase convention (hint = bright white, blank = dim) so
            // the two phases share the same reading grammar.
            return (
              <span
                key={j}
                className={hintPositions.has(j) ? "text-white" : "text-white/70"}
              >
                {char}
              </span>
            );
          })
        : mask.map((m, j) => (
            <span key={j} className={m.className}>
              {m.char}
            </span>
          ))}
      {isInteractive && (
        <input
          ref={inputRef}
          type="text"
          value={userTyped}
          onChange={onInputChange}
          onKeyDown={onInputKeyDown}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          aria-label={`拼写 ${spelling}`}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="absolute inset-0 w-full h-full bg-transparent text-transparent outline-none px-2 rounded-md"
          style={{ caretColor: "white" }}
        />
      )}
    </span>
  );
}

export function SentenceCard({
  spelling,
  sentence,
  phase,
  userTyped = "",
  isCorrect = true,
  showSpelling = false,
  spellingOpacity = 1,
  hintPositions = new Set(),
  showExpected = false,
  inputRef,
  onInputChange,
  onInputKeyDown,
  onInputFocus,
  onInputBlur,
  onReplayAudio,
}: SentenceCardProps) {
  if (!sentence) return null;

  const isFeedback = phase === "feedback";
  const isWrong = isFeedback && !isCorrect;
  const mask = buildMask(spelling, userTyped, hintPositions);
  const { before, after } = splitAtFirstWord(sentence.en, spelling);

  return (
    <div
      className="rounded-2xl border border-accent-soft/60 dark:border-accent/30 bg-gradient-to-br from-white to-[#FFFAF5] dark:from-slate-900 dark:to-slate-800 p-8 space-y-4 max-w-2xl mx-auto"
      data-testid="sentence-card"
    >
      <div className="flex items-center justify-center gap-2">
        <div className="text-[11px] tracking-[0.1em] uppercase text-accent font-bold">例句</div>
        {onReplayAudio && (
          <button
            type="button"
            onClick={onReplayAudio}
            aria-label="播放发音"
            className="p-1 rounded-full text-muted-foreground hover:text-accent hover:bg-accent/10 active:bg-accent/20 transition"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="text-center text-[19px] leading-[1.8] text-foreground/90 font-medium">
        {before}{" "}
        <BlankPill
          spelling={spelling}
          isFeedback={isFeedback}
          isWrong={isWrong}
          userTyped={userTyped}
          showSpelling={showSpelling}
          spellingOpacity={spellingOpacity}
          mask={mask}
          hintPositions={hintPositions}
          showExpected={showExpected}
          inputRef={inputRef}
          onInputChange={onInputChange}
          onInputKeyDown={onInputKeyDown}
          onInputFocus={onInputFocus}
          onInputBlur={onInputBlur}
        />{" "}
        {after}
      </div>

      <div className="text-sm text-muted-foreground font-sans text-center">
        <span className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground font-bold mr-1.5">中文</span>
        <span>{sentence.zh}</span>
      </div>
    </div>
  );
}