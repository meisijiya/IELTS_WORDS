import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // ponytail: class-based dark mode. The .dark class is toggled by ThemeProvider
  // (or by the no-FOUC inline script before paint). We do NOT need Tailwind's
  // dark: variants because every color token reads CSS vars that already flip.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ponytail: RGB-channel variables so `bg-background/50` (alpha modifier)
        // works through Tailwind's <alpha-value> placeholder.
        background: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SF Mono",
          "ui-monospace",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      boxShadow: {
        // ponytail: shadows reference the CSS var so they soften in dark mode
        // (the rgb channel is consumed by the var; alpha stays constant).
        "soft-sm":
          "0 1px 2px 0 rgb(var(--shadow-color) / 0.04), 0 1px 1px 0 rgb(var(--shadow-color) / 0.03)",
        "soft-md":
          "0 2px 4px 0 rgb(var(--shadow-color) / 0.06), 0 4px 8px -1px rgb(var(--shadow-color) / 0.04)",
        "soft-lg":
          "0 8px 16px -4px rgb(var(--shadow-color) / 0.08), 0 4px 8px -2px rgb(var(--shadow-color) / 0.05)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-6px)" },
          "40%, 80%": { transform: "translateX(6px)" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "streak-flash": {
          "0%": { transform: "scale(1)", filter: "brightness(1)" },
          "40%": { transform: "scale(1.15)", filter: "brightness(1.4)" },
          "100%": { transform: "scale(1)", filter: "brightness(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "fade-out": "fade-out 200ms ease-in",
        shimmer: "shimmer 2s linear infinite",
        shake: "shake 350ms ease-in-out",
        "pop-in": "pop-in 220ms ease-out",
        "streak-flash": "streak-flash 600ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;