import Link from "next/link";
import type { ComponentProps } from "react";
import type { CommitmentStatus, SwapStatus } from "@/db/schema";
import { COMMITMENT_LABEL, STATUS_LABEL } from "@/lib/swap-rules";

type Variant = "action" | "quiet" | "kept" | "danger";

const VARIANT: Record<Variant, string> = {
  // Spark is reserved for the one action that moves a swap forward.
  action: "bg-spark text-ink hover:bg-[#ff6d4d] active:bg-[#f04d2a]",
  quiet: "border border-line-strong bg-white text-ink hover:border-ink",
  kept: "bg-kept text-white hover:bg-kept-deep",
  danger: "border border-line-strong bg-white text-spark-deep hover:border-spark-deep",
};

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-[0.9375rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "quiet",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${BASE} ${VARIANT[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "quiet",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANT[variant]} ${className}`} {...props} />;
}


// Notice lives in its own client module: it focuses itself so the message is
// actually announced after a redirect. Re-exported here so callers are unchanged.
export { Notice } from "./notice";

// Field lives in its own client module: its hint id has to be unique on the
// page, and useId is the only thing that can promise that.
export { Field } from "./field";

const STATUS_STYLE: Record<SwapStatus, string> = {
  draft: "bg-white text-muted border-line",
  proposed: "bg-spark-wash text-[#7a2410] border-spark/30",
  countered: "bg-spark-wash text-[#7a2410] border-spark/30",
  accepted: "bg-white text-ink border-ink/20",
  completed: "bg-kept-wash text-kept-deep border-kept/30",
  declined: "bg-white text-muted border-line",
  cancelled: "bg-white text-muted border-line",
};

export function StatusPill({ status }: { status: SwapStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.8125rem] font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const COMMITMENT_STYLE: Record<CommitmentStatus, string> = {
  pending: "text-muted",
  delivered: "text-ink",
  kept: "text-kept-deep",
  missed: "text-spark-deep",
};

export function CommitmentState({ status }: { status: CommitmentStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[0.8125rem] font-medium ${COMMITMENT_STYLE[status]}`}>
      {status === "kept" ? (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {COMMITMENT_LABEL[status]}
    </span>
  );
}

export function SideTag({ name, side }: { name: string; side: "a" | "b" }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${side === "a" ? "bg-spark" : "bg-kept"}`}
      />
      {name}
    </span>
  );
}
