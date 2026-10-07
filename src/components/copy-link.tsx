"use client";

import { useRef, useState } from "react";

type Copied = "idle" | "done" | "failed";

/**
 * The link plus a button that copies it.
 *
 * The link is a readonly input, not a code block. Everything here that copies
 * for you needs JavaScript and the clipboard permission, and when either is
 * missing the only way out is to select the text by hand. A code block cannot
 * be focused, so on an insecure origin, with scripting off, or with the
 * clipboard denied, a keyboard-only user had no way to reach the one string
 * that is their only route back into their swap. An input can be tabbed to,
 * selected with one keystroke, and announces its own value.
 *
 * The status lives in a sibling region rather than on the button. With
 * aria-live on the button itself, its own accessible name was the thing
 * changing, so it announced "Copied" and then announced the label again when
 * the timer reset it, reporting a state change that never happened.
 */
export function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState<Copied>("idle");
  const field = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label className="min-w-0 flex-1">
        <span className="sr-only">{label === "Copy link" ? "Link" : label.replace(/^Copy /, "")}</span>
        <input
          ref={field}
          type="text"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-md border border-line-strong bg-paper px-3 py-2 text-[13px] text-ink"
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          try {
            // Rejects on an insecure origin or when permission is denied. Left
            // unhandled, the click did nothing at all and said nothing either.
            await navigator.clipboard.writeText(url);
            setCopied("done");
          } catch {
            setCopied("failed");
            // Put the link in their selection so the fallback is one keystroke
            // away rather than an instruction they have to carry out by hand.
            field.current?.select();
          }
          setTimeout(() => setCopied("idle"), 2400);
        }}
        className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-ink"
      >
        {copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : label}
      </button>
      <span role="status" className="sr-only">
        {copied === "done"
          ? "Link copied"
          : copied === "failed"
            ? "Could not copy. The link is selected, so copy it with your keyboard."
            : ""}
      </span>
    </div>
  );
}
