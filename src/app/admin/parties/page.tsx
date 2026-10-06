import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
import { Button, Field } from "@/components/ui";
import { getDb } from "@/db/client";
import { describeRecord, NO_RECORD } from "@/lib/reputation";
import { KIND_LABEL } from "@/lib/present";
import { listParties, partyRecords } from "@/lib/services/swaps";
import { createPartyAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Businesses", robots: { index: false } };

export default async function PartiesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const db = await getDb();
  const [parties, records] = await Promise.all([listParties(db), partyRecords(db)]);

  return (
    <AdminShell error={error} ok={ok}>
      <h1 className="text-3xl font-semibold">Businesses</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <section aria-label="All businesses">
          {parties.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-white px-6 py-10 text-muted">
              Add the founders you&apos;re running swaps for, and their partners. Partners don&apos;t need an email to start.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {parties.map((p) => (
                <li key={p.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-[13px] text-muted">{describeRecord(records.get(p.id) ?? NO_RECORD)}</p>
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {[KIND_LABEL[p.kind], p.contactName, p.email].filter(Boolean).join(", ")}
                  </p>
                  {p.offers || p.needs ? (
                    <p className="mt-2 text-[14px] leading-relaxed">
                      {p.offers ? <>Has: {p.offers}. </> : null}
                      {p.needs ? <>Wants: {p.needs}.</> : null}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <form action={createPartyAction} className="h-fit space-y-4 rounded-xl border border-line bg-white p-5">
          <h2 className="text-lg font-semibold">Add a business</h2>
          <Field label="Name">
            <input name="name" required className="field" />
          </Field>
          <Field label="Type">
            <select name="kind" defaultValue="app" className="field">
              {Object.entries(KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Website or listing">
            <input name="website" type="url" placeholder="https://" className="field" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name">
              <input name="contactName" className="field" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" className="field" />
            </Field>
          </div>
          <Field label="What they have to offer" hint="Audience, placements, integrations">
            <textarea name="offers" rows={2} className="field" />
          </Field>
          <Field label="What they want">
            <textarea name="needs" rows={2} className="field" />
          </Field>
          <Field label="Notes">
            <textarea name="notes" rows={2} className="field" />
          </Field>
          <Button type="submit" variant="action" className="w-full">
            Add business
          </Button>
        </form>
      </div>
    </AdminShell>
  );
}
