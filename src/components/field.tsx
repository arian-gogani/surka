"use client";

import { cloneElement, isValidElement, type ReactNode, useId } from "react";

/**
 * A labelled control with an optional hint.
 *
 * The hint sits outside the label and is linked with aria-describedby. Inside
 * the label it became part of the control's accessible name, so "Your email"
 * announced as "Your email Optional. For swap reminders if email delivery is
 * enabled." every time, including on each validation error.
 *
 * A client component only for useId. The hint id used to be a slug of the
 * label text, which collides whenever a page has two fields with the same
 * label: /start asks for a "Website" twice, so the second input described
 * itself using the first one's hint, and the document had duplicate ids.
 */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const generated = useId();
  const hintId = hint ? `hint-${generated}` : undefined;
  const control =
    hintId && isValidElement<{ "aria-describedby"?: string }>(children)
      ? cloneElement(children, {
          "aria-describedby": [children.props["aria-describedby"], hintId].filter(Boolean).join(" "),
        })
      : children;
  return (
    <div className={`block ${className}`}>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
        {control}
      </label>
      {hint ? (
        <span id={hintId} className="mt-1 block text-[13px] text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
