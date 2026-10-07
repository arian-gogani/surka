"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, Notice } from "@/components/ui";
import { createListingAction } from "./actions";
import { EMPTY_LIST, type ListField } from "./state";

/** Mirrors the kinds accepted by partyInput; shown beside the name on the list. */
const KINDS = [
  { value: "app", label: "App or software" },
  { value: "newsletter", label: "Newsletter" },
  { value: "community", label: "Community" },
  { value: "creator", label: "Creator" },
  { value: "other", label: "Something else" },
] as const;

/**
 * A client component only so a rejected submit can hand back what was typed.
 * useActionState degrades: with JavaScript off the form posts normally and the
 * server renders the same state, so nothing here depends on the script loading.
 */
export function ListForm() {
  const [state, action] = useActionState(createListingAction, EMPTY_LIST);
  const kept = (name: ListField, fallback = "") => state.values[name] ?? fallback;

  return (
    <>
      {state.error ? (
        <div className="mt-6">
          <Notice tone="error">{state.error}</Notice>
        </div>
      ) : null}

      <form action={action} className="mt-10 space-y-6">
        <fieldset className="space-y-4 rounded-xl border border-line bg-white p-5">
          <legend className="px-2 text-sm font-semibold">Your business</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input
                name="name"
                required
                maxLength={120}
                autoComplete="organization"
                defaultValue={kept("name")}
                placeholder="Clinic Scheduler"
                className="field"
              />
            </Field>
            <Field label="What kind">
              <select name="kind" className="field" defaultValue={kept("kind", "app")}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Website" hint="Shown on your listing. Optional, but it's the first thing anyone checks.">
            <input
              name="website"
              type="url"
              autoComplete="url"
              defaultValue={kept("website")}
              placeholder="https://example.com"
              className="field"
            />
          </Field>
          <Field label="Your email" hint="Never shown on the list. Only used for reminders about swaps you agree to.">
            <input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={kept("email")}
              className="field"
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-line bg-white p-5">
          <legend className="px-2 text-sm font-semibold">What you&apos;re after</legend>
          <Field
            label="What you can offer a partner"
            hint="Be concrete. Audience size, where the placement goes, what it looks like."
          >
            <textarea
              name="offers"
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              defaultValue={kept("offers")}
              placeholder="A dedicated section to 9,000 practice managers, or a slot in our onboarding email to 2,000 new users a month"
              className="field"
            />
          </Field>
          <Field label="What you're looking for" hint="The kind of partner, and what you'd want from them.">
            <textarea
              name="needs"
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              defaultValue={kept("needs")}
              placeholder="A scheduling or billing tool my readers would use daily, in exchange for a feature"
              className="field"
            />
          </Field>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton pendingLabel="Adding...">Add me to the list</SubmitButton>
          <p className="text-[15px] text-muted">You get a private link to edit or remove it. No account.</p>
        </div>
      </form>
    </>
  );
}
