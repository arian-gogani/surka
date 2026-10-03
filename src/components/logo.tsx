import { useId } from "react";

/** Upper bowl, swept anticlockwise from the top-right terminal to the waist. */
const UPPER = "M130 74A30 30 0 1 0 100 104";
/** Lower bowl, swept the opposite way from the waist to the bottom-left terminal. */
const LOWER = "M100 104A30 30 0 1 1 70 134";

/**
 * The Surka mark: an S built from two opposing arcs, one per side of a swap.
 * Neither arc is a letter on its own. Where they meet at the waist, coral and
 * teal overlap into the seam color.
 */
export function Mark({ size = 32, className }: { size?: number; className?: string }) {
  const maskId = `surka-mark-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="25 29 150 150"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
          <path d={UPPER} fill="none" stroke="#fff" strokeWidth="22" strokeLinecap="round" />
        </mask>
      </defs>
      <path d={UPPER} fill="none" stroke="#FF5A36" strokeWidth="22" strokeLinecap="round" />
      <path d={LOWER} fill="none" stroke="#0E7C7B" strokeWidth="22" strokeLinecap="round" />
      <path
        d={LOWER}
        fill="none"
        stroke="#0E2C1A"
        strokeWidth="22"
        strokeLinecap="round"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="Surka">
      <Mark size={size} />
      <span
        className="font-display font-semibold text-ink"
        style={{ fontSize: size * 0.82, letterSpacing: "-0.03em", lineHeight: 1 }}
      >
        surka
      </span>
    </span>
  );
}
