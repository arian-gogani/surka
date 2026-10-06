"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A result message that screen readers actually hear.
 *
 * Every action redirects, so this arrives in the initial DOM of a fresh
 * document. Live regions only announce changes after the region is registered,
 * and content present at parse time is reliably skipped, so role="alert" alone
 * said nothing. Focusing it moves the virtual cursor and reads the text, which
 * works for both tones and does not depend on live-region timing.
 */
export function Notice({ tone, children }: { tone: "error" | "ok"; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const styles =
    tone === "error"
      ? "border-spark/40 bg-spark-wash text-[#7a2410]"
      : "border-kept/30 bg-kept-wash text-kept-deep";
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-4 py-3 text-[15px] ${styles}`}
    >
      {children}
    </div>
  );
}
