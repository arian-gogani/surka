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
