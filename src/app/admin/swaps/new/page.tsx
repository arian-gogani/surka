import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
import { TermsFields } from "@/components/terms-fields";
import { Button, ButtonLink, Field } from "@/components/ui";
import { getDb } from "@/db/client";
import { addDays, toDateOnly } from "@/lib/dates";
import { listParties } from "@/lib/services/swaps";
import { createSwapAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New swap", robots: { index: false } };

export default async function NewSwapPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const parties = await listParties(await getDb());
  const inTwoWeeks = addDays(toDateOnly(new Date()), 14);

  if (parties.length < 2) {
    return (
      <AdminShell error={error}>
        <h1 className="text-3xl font-semibold">New swap</h1>
        <div className="rounded-xl border border-dashed border-line bg-white px-6 py-10">
          <p className="max-w-prose text-muted">A swap needs two businesses. Add the founder and their partner first.</p>
          <ButtonLink href="/admin/parties" variant="action" className="mt-4">
            Add businesses
          </ButtonLink>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell error={error}>
      <h1 className="text-3xl font-semibold">New swap</h1>
      <form action={createSwapAction} className="max-w-3xl space-y-6">
        <Field label="Title" hint="What the swap is, in a few words. Both sides see it.">
          <input name="title" required placeholder="Newsletter feature for an extended trial" className="field" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proposing side" hint="The founder you're running this for">
            <select name="partyAId" required className="field" defaultValue="">
              <option value="" disabled>
                Choose a business
              </option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Partner" hint="Gets the deal sheet and answers it">
            <select name="partyBId" required className="field" defaultValue="">
              <option value="" disabled>
                Choose a business
              </option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <TermsFields
          names={{ a: "Proposing side", b: "Partner" }}
          rows={[
            { side: "a", description: "", dueDate: inTwoWeeks },
            { side: "b", description: "", dueDate: inTwoWeeks },
          ]}
        />
        <p className="text-[13px] text-muted">
          Both sides must give something. When sizes don&apos;t match, the smaller side gives more, like two features
          instead of one.
        </p>
        <Field label="Private notes" hint="Only you see these">
          <textarea name="notes" rows={3} className="field" />
        </Field>
        <Button type="submit" variant="action">
          Create swap
        </Button>
      </form>
    </AdminShell>
  );
}
