"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, Notice } from "@/components/ui";
import { startSwapAction } from "./actions";
import { EMPTY_START, type StartField } from "./state";

/** Mirrors the kinds accepted by partyInput; shown on the deal sheet under each name. */
const KINDS = [
  { value: "app", label: "App or software" },
  { value: "newsletter", label: "Newsletter" },
  { value: "community", label: "Community" },
  { value: "creator", label: "Creator" },
  { value: "other", label: "Something else" },
] as const;

export interface Prefill {
  from: string | null;
  name: string;
  kind: string;
  website: string;
  email: string;
  /**
   * Whether the link they arrived with may rewrite the business.
   *
   * A swap link carries the business forward but does not prove you are it, so
   * the fields are shown as settled rather than as a form that will save.
   * Showing them editable and discarding the edits is the worse of the two.
   */
  editable: boolean;
}

/**
 * A client component only so a rejected submit can hand back what was typed.
 * useActionState degrades: with JavaScript off the form posts normally and the
 * server renders the same state, so nothing here depends on the script loading.
 */
/** A business from the directory this proposal is aimed at. */
export interface Target {
  id: string;
  name: string;
  kind: string;
  needs: string;
}

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

        <Field label="What's the swap?" hint="A few words. Both sides see this.">
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

        <fieldset className="space-y-4 rounded-xl border border-line bg-white p-5">
          <legend className="px-2 text-sm font-semibold">Your side</legend>
          {prefill.from ? (
            <p className="text-[15px] text-muted">
              Carrying over <span className="font-medium text-ink">{prefill.name}</span> from your last swap, so your
              record builds up instead of starting over.
              {prefill.editable ? null : " To change these details you'll need your listing link."}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your business">
              <input
                name="yourName"
                readOnly={!prefill.editable && prefill.from !== null}
                required
                maxLength={120}
                autoComplete="organization"
                defaultValue={kept("yourName", prefill.name)}
                placeholder="Clinic Scheduler"
                className="field"
              />
            </Field>
            <Field label="What kind">
              <select
                name="yourKind"
                disabled={!prefill.editable && prefill.from !== null}
                className="field"
                defaultValue={kept("yourKind", prefill.kind || "app")}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Website" hint="Optional">
            <input
              name="yourWebsite"
              readOnly={!prefill.editable && prefill.from !== null}
              type="url"
              autoComplete="url"
              defaultValue={kept("yourWebsite", prefill.website)}
              placeholder="https://example.com"
              className="field"
            />
          </Field>
          <Field label="Your email" hint="Optional. For swap reminders if email delivery is enabled.">
            <input
              name="yourEmail"
              readOnly={!prefill.editable && prefill.from !== null}
              type="email"
              autoComplete="email"
              defaultValue={kept("yourEmail", prefill.email)}
              className="field"
            />
          </Field>
          <Field label="What you'll give" hint="Be specific enough that someone could check it happened.">
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
          <Field label="By when">
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
          <legend className="px-2 text-sm font-semibold">Their side</legend>
          {target ? (
            <>
              <p className="text-[15px]">
                <span className="font-medium">{target.name}</span>
                <span className="text-muted"> from the partner list.</span>
              </p>
              {target.needs ? (
                <p className="max-w-prose text-[15px] leading-relaxed text-muted">
                  They said they&apos;re looking for: {target.needs}
                </p>
              ) : null}
            </>
          ) : null}
          <div className={`grid gap-4 sm:grid-cols-2 ${target ? "hidden" : ""}`}>
            <Field label="Their business">
              <input
                name="partnerName"
                required={!target}
                maxLength={120}
                defaultValue={kept("partnerName", target?.name ?? "")}
                placeholder="Practice Manager Weekly"
                className="field"
              />
            </Field>
            <Field label="What kind">
              <select name="partnerKind" className="field" defaultValue={kept("partnerKind", target?.kind || "newsletter")}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Website" hint="Optional" className={target ? "hidden" : ""}>
            <input
              name="partnerWebsite"
              type="url"
              defaultValue={kept("partnerWebsite")}
              placeholder="https://example.com"
              className="field"
            />
          </Field>
          <Field
            label={target ? `What ${target.name} would give` : "What they'll give"}
            hint="They can accept this, suggest changes, or decline."
          >
            <input
              name="partnerGive"
              required
              minLength={3}
              maxLength={500}
              defaultValue={kept("partnerGive")}
              placeholder="A dedicated section in the October 17 issue"
              className="field"
            />
          </Field>
          <Field label="By when">
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

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton pendingLabel="Creating...">Create the deal sheet</SubmitButton>
          <p className="text-[15px] text-muted">Nothing is sent anywhere until you share the link yourself.</p>
        </div>
      </form>
    </>
  );
}
