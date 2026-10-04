import { ImageResponse } from "next/og";

export const alt = "Surka: partner swaps that actually happen";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The mark: two halves of one disc, the gap between them an S. */
const LEFT = "M100 50A40 40 0 0 0 100 100A48 48 0 0 1 100 150A50 50 0 0 1 100 50Z";
const RIGHT = "M100 50A40 40 0 0 0 100 100A48 48 0 0 1 100 150A50 50 0 0 0 100 50Z";

/**
 * The card shown when a Surka link is posted anywhere. Generated at build time
 * so there is no binary in the repo and it never drifts from the brand colours.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FAF7F2",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="76" height="76" viewBox="44 44 112 112">
            <g transform="rotate(-4.5 100 100)">
              <path d={LEFT} fill="#FF5A36" />
            </g>
            <g transform="rotate(4.5 100 100)">
              <path d={RIGHT} fill="#0E7C7B" />
            </g>
          </svg>
          <div style={{ fontSize: 60, fontWeight: 600, color: "#0E2C1A", letterSpacing: "-0.03em" }}>
            surka
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 600,
              color: "#0E2C1A",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: 900,
            }}
          >
            Partner swaps that actually happen.
          </div>
          <div style={{ fontSize: 34, color: "#6B6358", marginTop: 28, maxWidth: 940 }}>
            Terms, deadlines, reminders to both sides, and proof each side delivered.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, color: "#6B6358" }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#FF5A36" }} />
          <div>No trade, no swap</div>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#0E7C7B", marginLeft: 24 }} />
          <div>Reputation counts commitments kept, never results</div>
        </div>
      </div>
    ),
    size,
  );
}
