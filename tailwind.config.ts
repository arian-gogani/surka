import type { Config } from "tailwindcss";

// Brand tokens. Spark is for actions only, Kept is for kept commitments and
// finished swaps, Seam is the logo's overlap color where both sides meet.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF7F2",
        ink: "#16181D",
        spark: { DEFAULT: "#FF5A36", deep: "#C93A1B", wash: "#FFE5DD" },
        kept: { DEFAULT: "#0E7C7B", deep: "#0A5C5B", wash: "#DDF0EE" },
        seam: "#0E2C1A",
        line: "#E6E0D6",
        // Hairlines are decorative; a control boundary has to clear 3:1 under
        // WCAG 1.4.11, because on inputs the border is the only thing saying
        // "this is a field". 3.89:1 on white, 3.64:1 on paper.
        "line-strong": "#8A8070",
        muted: "#5A5E68",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [],
};

export default config;
