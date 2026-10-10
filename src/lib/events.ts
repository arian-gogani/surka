/**
 * Every kind of thing that can happen to a swap.
 *
 * A union rather than a loose string, so adding one without giving it a label
 * does not compile. The timeline is the operator's only record of what
 * happened and of figures that were later replaced, and an unlabelled entry
 * falls back to the raw key, which reads as a bug rather than as history. A
 * grep-based test tried to enforce this and produced a false positive on the
 * first ternary it met, which is the usual fate of checking by pattern what a
 * type can check outright.
 */
export type SwapEventType =
  | "created"
  | "proposed"
  | "viewed"
  | "accept"
  | "counter"
  | "decline"
  | "terms_updated"
  | "delivered"
  | "kept"
  | "missed"
  | "reopened"
  | "completed"
  | "cancelled"
  | "link_created"
  | "link_retired"
  | "result_added"
  | "time_logged"
  | "withdrawn"
  | "confirmed"
  | "disputed"
  | "reminder_sent"
  | "email_set";

export const EVENT_LABEL: Record<SwapEventType, string> = {

  created: "Swap created",
  proposed: "Sent to the partner",
  viewed: "Opened their link",
  accept: "Accepted the swap",
  counter: "Suggested changes",
  decline: "Declined",
  terms_updated: "Terms updated",
  delivered: "Marked delivered",
  kept: "Checked as kept",
  missed: "Checked as missed",
  reopened: "Reopened for checking",
  completed: "Swap completed",
  cancelled: "Swap cancelled",
  link_created: "Tracking link created",
  link_retired: "Tracking link retired",
  result_added: "Result reported",
  time_logged: "Time logged",
  withdrawn: "Called it off",
  confirmed: "Partner confirmed it arrived",
  disputed: "Partner says it never arrived",
  reminder_sent: "Reminder sent",
  email_set: "Added an email for reminders",
};

