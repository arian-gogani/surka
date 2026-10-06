import type { Side } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { SideTag } from "./ui";

export interface DealSheetSide {
  name: string;
  detail?: string | null;
  record: string;
  gives: { description: string; dueDate: string }[];
}

/**
 * The deal sheet: what each side gives, side by side, meeting at a seam in
 * the middle, the same way the two arches of the mark share one stem.
 */
export function DealSheet({
  title,
  a,
  b,
  viewer,
  caption,
}: {
  title: string;
  a: DealSheetSide;
  b: DealSheetSide;
  viewer?: Side;
  caption?: string;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="border-b border-line px-5 py-4 sm:px-6">
        {/* figcaption, not a p: a figure with no caption element has no
            accessible name, and the text reads as unrelated body copy. */}
        <figcaption className="text-[13px] text-muted">{caption ?? "Swap proposal"}</figcaption>
        <h2 className="mt-1 text-lg font-semibold sm:text-xl">{title}</h2>
      </div>
      <div className="grid sm:grid-cols-[1fr_3px_1fr]">
        <SideColumn side="a" data={a} isViewer={viewer === "a"} />
        <div aria-hidden="true" className="h-[3px] bg-seam sm:h-auto" />
        <SideColumn side="b" data={b} isViewer={viewer === "b"} />
      </div>
    </figure>
  );
}

function SideColumn({ side, data, isViewer }: { side: Side; data: DealSheetSide; isViewer: boolean }) {
  return (
    <section className="flex flex-col px-5 py-5 sm:px-6" aria-label={`What ${data.name} gives`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <SideTag name={data.name} side={side} />
        {isViewer ? <span className="text-[13px] text-muted">You</span> : null}
      </div>
      {data.detail ? <p className="mt-1 text-[13px] text-muted">{data.detail}</p> : null}
      <p className="mt-4 text-[13px] font-medium text-muted">Gives</p>
      <ul className="mt-1.5 space-y-3">
        {data.gives.map((g, i) => (
          <li key={i}>
            <p className="text-[15px] leading-snug text-ink">{g.description}</p>
            <p className="num mt-0.5 text-[13px] text-muted">By {formatDate(g.dueDate)}</p>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-5">
        <p className="border-t border-line pt-3 text-[13px] text-muted">{data.record}</p>
      </div>
    </section>
  );
}
