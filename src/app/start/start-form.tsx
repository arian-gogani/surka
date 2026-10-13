"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, Notice } from "@/components/ui";
import { startSwapAction } from "./actions";
import { EMPTY_START, type StartField } from "./state";

export interface Prefill {
  from: string | null;
  name: string;
  website: string;
  /**
   * Whether the link they arrived with may rewrite the business.
   *
   * A swap link carries the business forward but does not prove you are it, so
   * the fields are shown as settled rather than as a form that will save.
   * Showing them editable and discarding the edits is the worse of the two.
   */
  editable: boolean;
}

/** A business from the directory this proposal is aimed at. */
export interface Target {
  id: string;
  name: string;
  needs: string;
}

/**
 * A client component only so a rejected submit can hand back what was typed.
 * useActionState degrades: with JavaScript off the form posts normally and the
 * server renders the same state, so nothing here depends on the script loading.
 *
 * Ordered certainty first, the one hard thing in the middle, and the title
 * last. Nothing comes back until the whole form posts, so every field has to
 * be answerable with no feedback and abandoning at field six costs all six.
 * Naming a deal before describing either half is asking for a title for a
 * thing that does not exist yet; after both halves are written it takes five
 * seconds, which is the right thing to be doing just before the button.
 */
export function StartForm({
  prefill,
  target,
  today,
  inTwoWeeks,
}: {
  prefill: Prefill;
  target: Target | null;
  today: string;
  inTwoWeeks: string;
}) {
  const [state, action] = useActionState(startSwapAction, EMPTY_START);
  // Prefer what they just typed, then the business carried over from a link.
  const kept = (name: StartField, fallback = "") => state.values[name] ?? fallback;
  const settled = !prefill.editable && prefill.from !== null;

  return (
    <>
      {state.error ? (
        <div className="mt-6">
          <Notice tone="error" arriving={false}>
            {state.error}
          </Notice>
        </div>
      ) : null}

      <form action={action} className="mt-10 space-y-8">
        {prefill.from ? <input type="hidden" name="from" value={prefill.from} /> : null}
        {/* The id, not the name: the action reuses this exact business so the
            record the directory advertises keeps accumulating. */}
        {target ? <input type="hidden" name="with" value={target.id} /> : null}

        <fieldset className="space-y-4 rounded-xl border border-line bg-white p-5">
          <legend className="px-2 text-sm font-semibold">Your business</legend>
          {prefill.from ? (
            <p className="text-[0.9375rem] text-muted">
              Carrying over <span className="font-medium text-ink">{prefill.name}</span> from your last swap, so
              your record builds up instead of starting over.
              {prefill.editable ? null : " To change these details you'll need your listing link."}
            </p>
          ) : null}
          <Field label="Your business">
            <input
              name="yourName"
              required
              readOnly={settled}
              maxLength={120}
              autoComplete="organization"
              defaultValue={kept("yourName", prefill.name)}
              placeholder="Clinic Scheduler"
              className="field"
            />
          </Field>
          <Field label="Website" hint="Optional. It's the one thing your partner can check before they answer.">
            <input
              name="yourWebsite"
              type="url"
              readOnly={settled}
              autoComplete="url"
              defaultValue={kept("yourWebsite", prefill.website)}
              placeholder="https://example.com"
              className="field"
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-line bg-white p-5">
          <legend className="px-2 text-sm font-semibold">What you&apos;ll give</legend>
          {/* Moved up next to the field it should be shaping. It used to sit
              two fieldsets away, in the box about the partner. */}
          {target?.needs ? (
            <p className="max-w-prose text-[0.9375rem] leading-relaxed text-muted">
              {target.name} said they&apos;re looking for: {target.needs}
            </p>
          ) : null}
          <Field
            label="What you'll give"
            hint="Specific enough that someone could check it happened. Name the placement, the audience, or the offer."
          >
            <input
              name="yourGive"
              required
              minLength={3}
              maxLength={500}
              defaultValue={kept("yourGive")}
              placeholder="An extra free month for readers who sign up through the link"
              className="field"
            />
          </Field>
          <Field label="By when" hint="The date you'll have delivered it by. Both sides get reminded before it.">
            <input
              name="yourDue"
              type="date"
              required
              min={today}
              defaultValue={kept("yourDue", inTwoWeeks)}
              className="field"
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-line bg-white p-5">
          {/* A request, not a term. The old wording asked you to write a
              stranger's deliverable and pick their deadline before any
              contact, which is a presumptuous thing to ask of anyone. */}
          <legend className="px-2 text-sm font-semibold">
            {target ? `What you'd like from ${target.name}` : "What you want back"}
          </legend>
          {target ? null : (
            <Field label="Their business">
              <input
                name="partnerName"
                required
                maxLength={120}
                defaultValue={kept("partnerName")}
                placeholder="Practice Manager Weekly"
                className="field"
              />
            </Field>
          )}
          <Field
            label={target ? `What you'd like ${target.name} to do` : "What you'd like them to do"}
            hint="They can accept this, suggest changes, or decline, so ask for something specific and let them firm it up."
          >
            <input
              name="partnerGive"
              required
              minLength={3}
              maxLength={500}
              defaultValue={kept("partnerGive")}
              placeholder="A dedicated section in an issue this autumn"
              className="field"
            />
          </Field>
          <Field label="A date you'd suggest" hint="They can change it when they answer.">
            <input
              name="partnerDue"
              type="date"
              required
              min={today}
              defaultValue={kept("partnerDue", inTwoWeeks)}
              className="field"
            />
          </Field>
        </fieldset>

        <Field label="Name the swap" hint="A few words. It's the heading on the deal sheet both of you read.">
          <input
            name="title"
            required
            minLength={3}
            maxLength={140}
            defaultValue={kept("title")}
            placeholder="Newsletter feature for an extended trial"
            className="field"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton pendingLabel="Creating...">Create the deal sheet</SubmitButton>
          <p className="text-[0.9375rem] text-muted">
            {target
              ? "Nothing is emailed. It appears on their partner-list page, and during the pilot we nudge them ourselves."
              : "Nothing is sent anywhere until you share the link yourself."}
          </p>
        </div>
      </form>
    </>
  );
}
