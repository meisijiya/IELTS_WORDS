import { useEffect, useRef } from "react";

function normalizeSpelling(spelling: string): string {
  return spelling
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function playAudioWithFallback(primaryUrl: string) {
  try {
    const audio = new Audio(primaryUrl);
    audio.volume = 0.8;
    let tried = false;
    const other = primaryUrl.replace(/\.(us|uk)\.mp3$/, (_, a) => (a === "us" ? ".uk.mp3" : ".us.mp3"));
    audio.onerror = () => {
      if (tried || other === primaryUrl) return;
      tried = true;
      const fb = new Audio(other);
      fb.volume = 0.8;
      fb.play().catch(() => {});
    };
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

function playTone(
  freq: number,
  ms: number,
  type: OscillatorType,
  vol: number,
): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
    osc.start(t0);
    osc.stop(t0 + ms / 1000 + 0.02);
    osc.onended = () => ctx.close();
  } catch {
    // ignore
  }
}

export function usePracticeAudio(accent: "us" | "uk", soundEnabled: boolean) {
  const soundRef = useRef(soundEnabled);
  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);

  function playPronunciation(spelling: string) {
    playAudioWithFallback(`/audio/${normalizeSpelling(spelling)}.${accent}.mp3`);
  }

  function playCorrectChime() {
    if (!soundRef.current) return;
    playTone(1046, 110, "sine", 0.18);
    window.setTimeout(() => playTone(1568, 140, "sine", 0.18), 90);
  }

  function playWrongBuzz() {
    if (!soundRef.current) return;
    playTone(440, 130, "sawtooth", 0.18);
    window.setTimeout(() => playTone(330, 180, "sawtooth", 0.18), 100);
  }

  function playStreakChime(streak: number) {
    if (!soundRef.current) return;
    const tier =
      streak >= 15 ? 4 :
      streak >= 12 ? 3 :
      streak >= 9  ? 2 :
      streak >= 6  ? 1 :
      0;
    const baseFreq = 1320 + Math.min(streak, 12) * 80;
    if (tier === 0) {
      playTone(baseFreq, 120, "triangle", 0.18);
      window.setTimeout(() => playTone(baseFreq * 1.5, 140, "triangle", 0.18), 60);
      window.setTimeout(() => playTone(baseFreq * 2, 180, "sine", 0.18), 130);
    } else if (tier === 1) {
      [1, 1.25, 1.5, 2].forEach((m, i) =>
        window.setTimeout(() => playTone(baseFreq * m, 130, "triangle", 0.18), i * 70));
    } else if (tier === 2) {
      for (let i = 0; i < 8; i++) {
        const f = baseFreq * (1 + i * 0.2);
        window.setTimeout(() => playTone(f, 80, "triangle", 0.12), i * 40);
      }
    } else {
      [1, 1.25, 1.5, 1.75, 2, 2.5].forEach((m, i) =>
        window.setTimeout(() => playTone(baseFreq * m, 200, "sine", 0.2), i * 60));
      setTimeout(() => {
        playTone(baseFreq * 2,   600, "sine",     0.18);
        playTone(baseFreq * 2.5, 600, "triangle", 0.15);
        playTone(baseFreq * 3,   600, "sine",     0.12);
      }, 350);
    }
  }

  function triggerMilestoneFx(streak: number) {
    if (!soundRef.current) return;
    if (typeof document === "undefined") return;
    const root = document.body;
    if (streak % 3 === 0 && streak > 0) {
      root.animate(
        [
          { transform: "translate(0,0)" },
          { transform: "translate(-1px,1px)" },
          { transform: "translate(1px,-1px)" },
          { transform: "translate(0,0)" },
        ],
        { duration: 90, iterations: 1, easing: "ease-out" },
      );
    }
    if (streak === 6 || streak === 9 || streak === 12 || streak === 15) {
      const intensity = streak === 15 ? 4 : streak === 12 ? 3 : streak === 9 ? 2 : 1;
      root.animate(
        Array.from({ length: 5 }, (_, i) => ({
          transform: `translate(${(i % 2 === 0 ? -1 : 1) * intensity}px, ${(i % 2 === 0 ? 1 : -1) * intensity}px)`,
        })).concat([{ transform: "translate(0,0)" }]),
        { duration: 120, easing: "ease-out" },
      );
    }
    if (streak % 3 === 0) {
      const el = document.getElementById("streak-banner");
      if (el) {
        el.classList.remove("streak-flash");
        void el.offsetWidth;
        el.classList.add("streak-flash");
      }
    }
  }

  return { playPronunciation, playCorrectChime, playWrongBuzz, playStreakChime, triggerMilestoneFx };
}
