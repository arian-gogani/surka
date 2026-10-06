import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
import { ButtonLink } from "@/components/ui";
import { getDb } from "@/db/client";
import { addDays, toDateOnly } from "@/lib/dates";
import { listParties } from "@/lib/services/swaps";
import { NewSwapForm } from "./new-swap-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New swap", robots: { index: false } };

export default async function NewSwapPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const parties = await listParties(await getDb());
  const today = toDateOnly(new Date());
  const inTwoWeeks = addDays(today, 14);

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
      <NewSwapForm
        parties={parties.map((p) => ({ id: p.id, name: p.name }))}
        today={today}
        defaultRows={[
          { side: "a", description: "", dueDate: inTwoWeeks },
          { side: "b", description: "", dueDate: inTwoWeeks },
        ]}
      />
    </AdminShell>
  );
}
