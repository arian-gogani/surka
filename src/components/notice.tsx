"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A result message that screen readers actually hear.
 *
 * Two different situations, and they need opposite things.
 *
 * After a redirect the message is in the initial DOM of a fresh document. Live
 * regions only announce changes after the region is registered, and content
 * present at parse time is reliably skipped, so role="alert" alone says
 * nothing. Focusing it moves the virtual cursor and reads the text.
 *
 * A form that returns state instead of redirecting mounts this in place, where
 * role="alert" does announce. Focusing it as well made the message read twice,
 * and the public forms all return state now, so that is the common path rather
 * than the exception. `arriving` says which situation the caller is in.
 */
export function Notice({
  tone,
  arriving = true,
  children,
}: {
  tone: "error" | "ok";
  /** True when this came with a fresh document, false when it mounted in place. */
  arriving?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (arriving) ref.current?.focus();
  }, [arriving]);
  const styles =
    tone === "error"
      ? "border-spark/40 bg-spark-wash text-[#7a2410]"
      : "border-kept/30 bg-kept-wash text-kept-deep";
  return (
    <div
      ref={ref}
      tabIndex={arriving ? -1 : undefined}
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-4 py-3 text-[15px] ${styles}`}
    >
      {children}
    </div>
  );
}
