/**
 * Demo data for local development: three swaps at different stages, so every
 * screen has something on it. Refuses to touch a non-empty database.
 */
import path from "node:path";
import { sql } from "drizzle-orm";
import { createPgliteDb, createPostgresDb } from "../src/db/client";
import { addDays, toDateOnly } from "../src/lib/dates";
import {
  addTrackingLink,
  createParty,
  createSwap,
  getSwapForToken,
  logOperatorMinutes,
  markDelivered,
  markProposed,
  reportResult,
  respond,
  verifyCommitment,
} from "../src/lib/services/swaps";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const db = url ? await createPostgresDb(url) : await createPgliteDb(path.join(process.cwd(), ".pglite"));
  const existing = await db.execute(sql`select count(*)::int as n from parties`);
  const rows = Array.isArray(existing) ? existing : (existing as { rows: { n: number }[] }).rows;
  if (Number((rows[0] as { n: number } | undefined)?.n ?? 0) > 0) {
    console.log("The database already has data. Seed skipped.");
    return;
  }

  const today = toDateOnly(new Date());
  const appBase = process.env.APP_URL ?? "http://localhost:3000";

  const scheduler = await createParty(db, {
    name: "Clinic Scheduler",
    kind: "app",
    website: "https://clinicscheduler.example",
    contactName: "Dana",
    email: "dana@clinicscheduler.example",
    offers: "In-app announcement to about 1,200 merchants (self-reported)",
    needs: "Reach clinic managers who run Shopify stores",
  });
  const weekly = await createParty(db, {
    name: "Practice Manager Weekly",
    kind: "newsletter",
    website: "https://pmweekly.example",
    contactName: "Sam",
    offers: "Sponsor-free section in a weekly issue",
    needs: "Tools to recommend to readers",
  });
  const reviews = await createParty(db, {
    name: "Glow Reviews",
    kind: "app",
    website: "https://glowreviews.example",
    contactName: "Priya",
    email: "priya@glowreviews.example",
  });
  const bundles = await createParty(db, {
    name: "Bundle Builder",
    kind: "app",
    website: "https://bundlebuilder.example",
    email: "team@bundlebuilder.example",
  });

  // 1. Waiting on the partner.
  const waiting = await createSwap(db, {
    title: "Newsletter feature for an extended trial",
    partyAId: scheduler.id,
    partyBId: weekly.id,
    commitments: [
      { side: "a", description: "An extra free month for readers who sign up through the issue's link", dueDate: addDays(today, 21) },
      { side: "b", description: "A dedicated section in the next issue", dueDate: addDays(today, 10) },
    ],
  });
  await markProposed(db, waiting.swap.id);
  await logOperatorMinutes(db, waiting.swap.id, 25);

  // 2. In progress: one side delivered, one due soon.
  const live = await createSwap(db, {
    title: "Integration listing swap",
    partyAId: reviews.id,
    partyBId: bundles.id,
    commitments: [
      { side: "a", description: "List Bundle Builder on the integrations page", dueDate: addDays(today, 2) },
      { side: "b", description: "Announce the integration in the app's changelog", dueDate: addDays(today, 6) },
    ],
  });
  await markProposed(db, live.swap.id);
  await respond(db, live.tokens.b, { decision: "accept" });
  const liveView = await getSwapForToken(db, live.tokens.b);
  const bCommitment = liveView.commitments.find((c) => c.side === "b")!;
  await markDelivered(db, live.tokens.b, bCommitment.id, { proofUrl: "https://bundlebuilder.example/changelog" });
  await addTrackingLink(db, live.swap.id, {
    side: "a",
    label: "Integrations page listing",
    destinationUrl: "https://bundlebuilder.example/?ref=glow",
  });
  await logOperatorMinutes(db, live.swap.id, 40);

  // 3. Completed, with results.
  const done = await createSwap(db, {
    title: "Cross-promotion in onboarding emails",
    partyAId: scheduler.id,
    partyBId: reviews.id,
    commitments: [
      { side: "a", description: "Mention Glow Reviews in the welcome email", dueDate: addDays(today, -12) },
      { side: "b", description: "Mention Clinic Scheduler in the welcome email", dueDate: addDays(today, -10) },
    ],
  });
  await markProposed(db, done.swap.id);
  await respond(db, done.tokens.b, { decision: "accept" });
  const doneView = await getSwapForToken(db, done.tokens.a);
  for (const c of doneView.commitments) await verifyCommitment(db, c.id, "kept");
  await reportResult(db, done.tokens.a, { metric: "installs", value: 15, note: "First 14 days" });
  await reportResult(db, done.tokens.b, { metric: "installs", value: 9 });
  await logOperatorMinutes(db, done.swap.id, 55);

  console.log("Seeded demo data. Links:");
  console.log(`  Partner answering a proposal: ${appBase}/d/${waiting.tokens.b}`);
  console.log(`  Swap in progress:             ${appBase}/d/${live.tokens.a}`);
  console.log(`  Completed swap:               ${appBase}/d/${done.tokens.a}`);
  console.log(`  Operator dashboard:           ${appBase}/admin`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
