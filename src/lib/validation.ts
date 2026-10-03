import { z } from "zod";
import { isValidDateOnly } from "./dates";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .transform((v) => v ?? null);

const url = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a full link that starts with https://");

const optionalUrl = z
  .union([z.literal(""), url])
  .nullish()
  .transform((v) => (v ? v : null));

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));

export const sideSchema = z.enum(["a", "b"]);

export const partyInput = z.object({
  name: z.string().trim().min(1, "Give the business a name").max(120),
  kind: z.enum(["app", "newsletter", "community", "creator", "other"]).default("app"),
  website: optionalUrl,
  contactName: optionalText(120),
  email: z.union([z.literal(""), email]).nullish().transform((v) => (v ? v : null)),
  offers: optionalText(1000),
  needs: optionalText(1000),
  notes: optionalText(2000),
});
export type PartyInput = z.input<typeof partyInput>;

export const commitmentInput = z.object({
  side: sideSchema,
  description: z.string().trim().min(3, "Describe what will be delivered").max(500),
  dueDate: z.string().refine(isValidDateOnly, "Pick a due date"),
});
export type CommitmentInput = z.input<typeof commitmentInput>;

export const swapInput = z
  .object({
    title: z.string().trim().min(3, "Give the swap a short title").max(140),
    partyAId: z.uuid("Pick the proposing side"),
    partyBId: z.uuid("Pick the partner"),
    notes: optionalText(2000),
    commitments: z.array(commitmentInput).min(2).max(12),
  })
  .refine((v) => v.partyAId !== v.partyBId, {
    message: "A swap needs two different businesses",
    path: ["partyBId"],
  })
  .refine(
    (v) => v.commitments.some((c) => c.side === "a") && v.commitments.some((c) => c.side === "b"),
    { message: "Both sides need to give something. No trade, no swap.", path: ["commitments"] },
  );
export type SwapInput = z.input<typeof swapInput>;

export const responseInput = z
  .object({
    decision: z.enum(["accept", "counter", "decline"]),
    message: optionalText(2000),
    email: z.union([z.literal(""), email]).nullish().transform((v) => (v ? v : null)),
  })
  .refine((v) => v.decision !== "counter" || (v.message?.length ?? 0) > 0, {
    message: "Say what you'd change so we can rework the terms",
    path: ["message"],
  });
export type ResponseInput = z.input<typeof responseInput>;

export const proofInput = z.object({ proofUrl: url });

export const trackingLinkInput = z.object({
  side: sideSchema,
  label: z.string().trim().min(2, "Name the placement").max(120),
  destinationUrl: url,
});

export const resultInput = z.object({
  side: sideSchema,
  metric: z.enum(["installs", "signups", "trials", "clicks", "other"]),
  value: z.coerce.number().int("Use a whole number").min(0).max(10_000_000),
  note: optionalText(500),
});

/** First validation message, phrased for the person filling the form. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again";
}
