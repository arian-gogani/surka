/**
 * One disc, divided by an S. The upper bowl is drawn at radius 40 and the lower
 * at 48: equal bowls read top-heavy, so letterforms shrink the upper one.
 */
const DIVIDE = "M100 50A40 40 0 0 0 100 100A48 48 0 0 1 100 150";
/** Each half closes around its own side of the rim. */
const LEFT = `${DIVIDE}A50 50 0 0 1 100 50Z`;
const RIGHT = `${DIVIDE}A50 50 0 0 0 100 50Z`;
/**
 * Rotating each half about the centre opens the gap while leaving the outer
 * silhouette a true circle, since every point stays on its own radius.
 */
const TILT = 4.5;

/**
 * The Surka mark: two halves of one disc, one per side of a swap. The gap
 * between them is an S. Rotate it 180° and it is itself, so neither half leads.
 * Coral and teal are the pairing the deal sheet already uses for the two sides.
 */
export function Mark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="44 44 112 112"
      aria-hidden="true"
      className={className}
    >
      <g transform={`rotate(${-TILT} 100 100)`}>
        <path d={LEFT} fill="#FF5A36" />
      </g>
      <g transform={`rotate(${TILT} 100 100)`}>
        <path d={RIGHT} fill="#0E7C7B" />
      </g>
    </svg>
  );
}

/**
 * No aria-label on the wrapper: a span has the generic role, for which naming
 * is prohibited, so conforming screen readers drop it anyway. The visible
 * wordmark already supplies the name.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
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
