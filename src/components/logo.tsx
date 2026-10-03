import { useId } from "react";

const LEFT = "M40 145V90A30 30 0 0 1 100 90V145";
const RIGHT = "M100 145V90A30 30 0 0 1 160 90V145";

/**
 * The Ambo mark: two arches that share one stem, forming the m. Where they
 * overlap, coral and teal combine into the seam color.
 */
export function Mark({ size = 32, className }: { size?: number; className?: string }) {
  const maskId = `ambo-mark-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="20 40 160 125"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
          <path d={LEFT} fill="none" stroke="#fff" strokeWidth="22" strokeLinecap="round" />
        </mask>
      </defs>
      <path d={LEFT} fill="none" stroke="#FF5A36" strokeWidth="22" strokeLinecap="round" />
      <path d={RIGHT} fill="none" stroke="#0E7C7B" strokeWidth="22" strokeLinecap="round" />
      <path
        d={RIGHT}
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
    <span className="inline-flex items-center gap-2" aria-label="Ambo">
      <Mark size={size} />
      <span
        className="font-display font-semibold text-ink"
        style={{ fontSize: size * 0.82, letterSpacing: "-0.03em", lineHeight: 1 }}
      >
        ambo
      </span>
    </span>
  );
}
