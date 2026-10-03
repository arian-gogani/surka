"use client";

import { useState } from "react";

export function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-paper px-3 py-2 text-[13px] text-ink">
        {url}
      </code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:border-ink/40"
        aria-live="polite"
      >
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}
