"use client";

import { useState } from "react";

type Copied = "idle" | "done" | "failed";

/**
 * The link plus a button that copies it.
 *
 * The status lives in a sibling region rather than on the button. With
 * aria-live on the button itself, its own accessible name was the thing
 * changing, so it announced "Copied" and then announced the label again when
 * the timer reset it, reporting a state change that never happened.
 */
export function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState<Copied>("idle");
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-paper px-3 py-2 text-[13px] text-ink">
        {url}
      </code>
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
          }
          setTimeout(() => setCopied("idle"), 2400);
        }}
        className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-ink"
      >
        {copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : label}
      </button>
      <span role="status" className="sr-only">
        {copied === "done" ? "Link copied" : copied === "failed" ? "Could not copy. Select the link and copy it." : ""}
      </span>
    </div>
  );
}
