"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { TermsFields, type TermRow } from "@/components/terms-fields";
import { Field, Notice } from "@/components/ui";
import { createSwapAction } from "../../actions";
import { EMPTY_NEW_SWAP } from "./state";

/**
 * A client component only so a rejected submit can hand back what was typed.
 * useActionState degrades: with JavaScript off the form posts normally and the
 * server renders the result, so nothing here depends on the script loading.
 */
export function NewSwapForm({
  parties,
  today,
  defaultRows,
}: {
  parties: { id: string; name: string }[];
  today: string;
  defaultRows: TermRow[];
}) {
  const [state, action] = useActionState(createSwapAction, EMPTY_NEW_SWAP);

  return (
    <>
      {state.error ? (
        <div className="mt-4">
          <Notice tone="error">{state.error}</Notice>
        </div>
      ) : null}

      <form action={action} className="max-w-3xl space-y-6">
        <Field label="Title" hint="What the swap is, in a few words. Both sides see it.">
          <input
            name="title"
            required
            defaultValue={state.values.title ?? ""}
            placeholder="Newsletter feature for an extended trial"
            className="field"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proposing side" hint="The founder you're running this for">
            <select name="partyAId" required className="field" defaultValue={state.values.partyAId ?? ""}>
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
            <select name="partyBId" required className="field" defaultValue={state.values.partyBId ?? ""}>
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
        <TermsFields today={today} names={{ a: "Proposing side", b: "Partner" }} rows={state.rows ?? defaultRows} />
        <p className="text-[13px] text-muted">
          Both sides must give something. When sizes don&apos;t match, the smaller side gives more, like two features
          instead of one.
        </p>
        <Field label="Private notes" hint="Only you see these">
          <textarea name="notes" rows={3} defaultValue={state.values.notes ?? ""} className="field" />
        </Field>
        <SubmitButton pendingLabel="Creating...">Create swap</SubmitButton>
      </form>
    </>
  );
}
