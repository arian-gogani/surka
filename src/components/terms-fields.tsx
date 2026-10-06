import type { Side } from "@/db/schema";

export interface TermRow {
  side: Side;
  description: string;
  dueDate: string;
}

/**
 * Commitment rows for creating or reworking a swap. Blank rows are ignored,
 * so the form always offers a few spare lines.
 */
export function TermsFields({
  rows,
  names,
  today,
  spare = 2,
}: {
  rows: TermRow[];
  names: { a: string; b: string };
  spare?: number;
  /** Earliest date the picker will offer, so a past deadline is not a mis-click away. */
  today: string;
}) {
  const all: TermRow[] = [
    ...rows,
    ...Array.from({ length: spare }, (_, i): TermRow => ({ side: i % 2 === 0 ? "a" : "b", description: "", dueDate: "" })),
  ].slice(0, 12);

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">Who gives what, by when</legend>
      {all.map((row, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-[10rem_1fr_10rem]">
          <label className="block">
            <span className="sr-only">Row {i + 1}: who gives it</span>
            <select name={`commitments.${i}.side`} defaultValue={row.side} className="field">
              <option value="a">{names.a}</option>
              <option value="b">{names.b}</option>
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Row {i + 1}: what they give</span>
            <input
              name={`commitments.${i}.description`}
              defaultValue={row.description}
              placeholder="What they give, like a section in the Oct 17 issue"
              className="field"
            />
          </label>
          <label className="block">
            <span className="sr-only">Row {i + 1}: due date</span>
            {/* The public form guards its dates; this one did not, so a
                fat-fingered year read as "20273 days ago" and sorted the whole
                dashboard by it. */}
            <input
              name={`commitments.${i}.dueDate`}
              type="date"
              min={today}
              defaultValue={row.dueDate}
              className="field num"
            />
          </label>
        </div>
      ))}
    </fieldset>
  );
}
