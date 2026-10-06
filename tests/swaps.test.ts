import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import type { EmailMessage } from "@/lib/email";
import { SurkaError } from "@/lib/errors";
import { pilotMetrics } from "@/lib/services/metrics";
import { runReminders } from "@/lib/services/reminders";
import {
  addTrackingLink,
  cancelSwap,
  createParty,
  createSwap,
  getSwapDetail,
  getSwapForToken,
  listSwaps,
  logOperatorMinutes,
  markDelivered,
  markProposed,
  partyRecord,
  partyForToken,
  recordClick,
  replaceCommitments,
  reportResult,
  respond,
  verifyCommitment,
} from "@/lib/services/swaps";

const NOW = new Date("2026-10-02T15:00:00Z");
let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

beforeEach(async () => {
  await db.execute(
    sql`truncate parties, swaps, commitments, swap_access, responses, tracking_links, results, events, reminders_sent cascade`,
  );
});

async function seedSwap() {
  const app = await createParty(db, {
    name: "Clinic Scheduler",
    kind: "app",
    email: "founder@clinicscheduler.example",
    website: "https://clinicscheduler.example",
  });
  const newsletter = await createParty(db, { name: "Practice Manager Weekly", kind: "newsletter" });
  const created = await createSwap(db, {
    title: "Newsletter feature for an extended trial",
    partyAId: app.id,
    partyBId: newsletter.id,
    commitments: [
      { side: "a", description: "Extra free month for readers who sign up", dueDate: "2026-10-05" },
      { side: "b", description: "Dedicated section in the Oct 17 issue", dueDate: "2026-10-17" },
    ],
  });
  return { app, newsletter, ...created };
}

async function expectSurka(promise: Promise<unknown>, code: SurkaError["code"]) {
  await expect(promise).rejects.toSatisfy((e) => e instanceof SurkaError && e.code === code);
}

describe("creating swaps", () => {
  it("refuses a swap where only one side gives something", async () => {
    const a = await createParty(db, { name: "A" });
    const b = await createParty(db, { name: "B" });
    await expectSurka(
      createSwap(db, {
        title: "One-sided",
        partyAId: a.id,
        partyBId: b.id,
        commitments: [
          { side: "a", description: "Feature B", dueDate: "2026-10-05" },
          { side: "a", description: "Feature B again", dueDate: "2026-10-06" },
        ],
      }),
      "invalid",
    );
  });

  it("refuses a swap with itself", async () => {
    const a = await createParty(db, { name: "A" });
    await expectSurka(
      createSwap(db, {
        title: "Self swap",
        partyAId: a.id,
        partyBId: a.id,
        commitments: [
          { side: "a", description: "Thing one", dueDate: "2026-10-05" },
          { side: "b", description: "Thing two", dueDate: "2026-10-05" },
        ],
      }),
      "invalid",
    );
  });

  it("gives each side its own private link", async () => {
    const { tokens } = await seedSwap();
    expect(tokens.a).not.toEqual(tokens.b);
    const view = await getSwapForToken(db, tokens.b, NOW);
    expect(view.side).toBe("b");
    expect(view.swap.status).toBe("draft");
    expect(view.commitments).toHaveLength(2);
    expect(view.records.a.resolved).toBe(0);
  });

  it("rejects an unknown link", async () => {
    await expectSurka(getSwapForToken(db, "nope", NOW), "not_found");
  });
});

describe("the partner's answer", () => {
  it("only accepts answers while a proposal is open", async () => {
    const { tokens } = await seedSwap();
    await expectSurka(respond(db, tokens.b, { decision: "accept" }, NOW), "conflict");
  });

  it("only lets the receiving side answer", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await expectSurka(respond(db, tokens.a, { decision: "accept" }, NOW), "not_allowed");
  });

  it("requires a message with a counter, then allows reworked terms", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await expectSurka(respond(db, tokens.b, { decision: "counter" }, NOW), "invalid");
    expect(await respond(db, tokens.b, { decision: "counter", message: "Two issues, not one" }, NOW)).toBe(
      "countered",
    );
    await replaceCommitments(db, swap.id, [
      { side: "a", description: "Two extra free months", dueDate: "2026-10-05" },
      { side: "b", description: "Features in two issues", dueDate: "2026-10-24" },
    ]);
    await markProposed(db, swap.id, NOW);
    expect(await respond(db, tokens.b, { decision: "accept", email: "Editor@PMW.example" }, NOW)).toBe(
      "accepted",
    );
    const view = await getSwapForToken(db, tokens.b, NOW);
    expect(view.partyB.email).toBe("editor@pmw.example");
    expect(view.commitments.map((c) => c.description)).toContain("Features in two issues");
  });

  it("locks terms after acceptance", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    await expectSurka(
      replaceCommitments(db, swap.id, [
        { side: "a", description: "Changed", dueDate: "2026-10-05" },
        { side: "b", description: "Changed too", dueDate: "2026-10-05" },
      ]),
      "conflict",
    );
  });
});

describe("delivery and checking", () => {
  async function acceptedSwap() {
    const seeded = await seedSwap();
    await markProposed(db, seeded.swap.id, NOW);
    await respond(db, seeded.tokens.b, { decision: "accept" }, NOW);
    const view = await getSwapForToken(db, seeded.tokens.a, NOW);
    const mine = view.commitments.find((c) => c.side === "a")!;
    const theirs = view.commitments.find((c) => c.side === "b")!;
    return { ...seeded, mine, theirs };
  }

  it("lets a side deliver only its own commitments, with proof", async () => {
    const { tokens, mine, theirs } = await acceptedSwap();
    await expectSurka(
      markDelivered(db, tokens.a, theirs.id, { proofUrl: "https://example.com/x" }, NOW),
      "not_allowed",
    );
    await expectSurka(markDelivered(db, tokens.a, mine.id, { proofUrl: "not a link" }, NOW), "invalid");
    await markDelivered(db, tokens.a, mine.id, { proofUrl: "https://clinicscheduler.example/promo" }, NOW);
    const view = await getSwapForToken(db, tokens.a, NOW);
    expect(view.commitments.find((c) => c.id === mine.id)?.status).toBe("delivered");
  });

  it("completes the swap when every commitment is checked, and builds records", async () => {
    const { app, newsletter, swap, mine, theirs } = await acceptedSwap();
    expect((await verifyCommitment(db, mine.id, "kept", NOW)).swapCompleted).toBe(false);
    expect((await verifyCommitment(db, theirs.id, "missed", NOW)).swapCompleted).toBe(true);
    await expectSurka(verifyCommitment(db, mine.id, "missed", NOW), "conflict");

    const appRecord = await partyRecord(db, app.id, NOW);
    const newsletterRecord = await partyRecord(db, newsletter.id, NOW);
    expect(appRecord).toMatchObject({ kept: 1, resolved: 1 });
    expect(newsletterRecord).toMatchObject({ kept: 0, resolved: 1 });

    await expectSurka(cancelSwap(db, swap.id, "too late", NOW), "conflict");
  });

  it("keeps the timeline in the order things happened, even within one step", async () => {
    const { swap, mine, theirs } = await acceptedSwap();
    await verifyCommitment(db, mine.id, "kept", NOW);
    await verifyCommitment(db, theirs.id, "kept", NOW);
    const { events } = await getSwapDetail(db, swap.id);
    // Newest first. Checking the last commitment and completing the swap share a timestamp.
    expect(events.slice(0, 3).map((e) => e.type)).toEqual(["completed", "kept", "kept"]);
    expect(events.at(-1)?.type).toBe("created");
  });
});

describe("tracking and results", () => {
  it("counts clicks and redirects", async () => {
    const { swap } = await seedSwap();
    const link = await addTrackingLink(db, swap.id, {
      side: "b",
      label: "Oct 17 issue",
      destinationUrl: "https://clinicscheduler.example/?ref=pmw",
    });
    expect(link.code).toMatch(/^[2-9a-zA-Z]{7}$/);
    expect(await recordClick(db, link.code)).toBe("https://clinicscheduler.example/?ref=pmw");
    await recordClick(db, link.code);
    expect(await recordClick(db, "missing")).toBeNull();
    const view = await getSwapForToken(db, (await seedSwap()).tokens.a, NOW);
    expect(view.trackingLinks).toHaveLength(0);
  });

  it("only lets a side report results for itself", async () => {
    const { tokens } = await seedSwap();
    const result = await reportResult(db, tokens.b, { side: "a", metric: "signups", value: 42 });
    expect(result.side).toBe("b");
  });
});

describe("reminders", () => {
  it("emails the delivering side once per window, and skips sides without email", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);

    const outbox: EmailMessage[] = [];
    const send = async (m: EmailMessage) => {
      outbox.push(m);
    };

    // Side A's commitment is due in 3 days; side B has no email yet.
    expect(await runReminders(db, send, NOW)).toMatchObject({ sent: 1, skipped: 0, failed: 0 });
    expect(outbox[0]?.to).toBe("founder@clinicscheduler.example");
    expect(outbox[0]?.subject).toContain("Due in 3 days");
    expect(outbox[0]?.text).toContain(`/d/${tokens.a}`);

    expect(await runReminders(db, send, NOW)).toMatchObject({ sent: 0, skipped: 0, failed: 0 });

    const dayBefore = new Date("2026-10-04T15:00:00Z");
    expect((await runReminders(db, send, dayBefore)).sent).toBe(1);
    expect(outbox[1]?.subject).toContain("Due tomorrow");

    const afterB = new Date("2026-10-15T15:00:00Z");
    const run = await runReminders(db, send, afterB);
    expect(run.skipped).toBe(1); // B's reminder is due but B has no email.
  });

  it("retries a reminder whose send failed", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    const failing = async () => {
      throw new Error("provider down");
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(await runReminders(db, failing, NOW)).toMatchObject({ sent: 0, skipped: 0, failed: 1 });
    } finally {
      console.error = originalError;
    }
    const outbox: EmailMessage[] = [];
    expect((await runReminders(db, async (m) => void outbox.push(m), NOW)).sent).toBe(1);
  });
});

describe("pilot metrics", () => {
  it("reports the numbers to watch", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    await logOperatorMinutes(db, swap.id, 45);
    const view = await getSwapForToken(db, tokens.a, NOW);
    for (const c of view.commitments) await verifyCommitment(db, c.id, "kept", NOW);
    await reportResult(db, tokens.a, { metric: "installs", value: 15 });

    const m = await pilotMetrics(db, NOW);
    expect(m.swapsByStatus.completed).toBe(1);
    expect(m.completedThisWeek).toBe(1);
    expect(m.onTimeRate).toBe(1);
    expect(m.acceptanceRate).toBe(1);
    expect(m.minutesPerCompletedSwap).toBe(45);
    expect(m.repeatParties).toBe(0);
    expect(m.resultTotals.installs).toBe(15);
  });
});

/**
 * The /start route composes these three calls with no operator involved. The
 * pieces are covered individually above; this pins the sequence a stranger
 * actually triggers, including that the partner's link works immediately.
 */
describe("the public path into a swap", () => {
  it("creates both sides, proposes it, and issues two working links", async () => {
    const mine = await createParty(db, { name: "Clinic Scheduler", kind: "app" });
    const theirs = await createParty(db, { name: "Practice Manager Weekly", kind: "newsletter" });
    const { swap, tokens } = await createSwap(db, {
      title: "Newsletter section for an extended trial",
      partyAId: mine.id,
      partyBId: theirs.id,
      commitments: [
        { side: "a", description: "Extra free month for readers", dueDate: "2026-10-18" },
        { side: "b", description: "Dedicated section in the Oct 17 issue", dueDate: "2026-10-17" },
      ],
    });
    await markProposed(db, swap.id, NOW);

    // The partner can open their link and answer without an account.
    const partnerView = await getSwapForToken(db, tokens.b, NOW);
    expect(partnerView.side).toBe("b");
    expect(partnerView.swap.status).toBe("proposed");
    expect(partnerView.commitments).toHaveLength(2);

    // And the creator's link is a different side of the same swap.
    const mineView = await getSwapForToken(db, tokens.a, NOW);
    expect(mineView.side).toBe("a");
    expect(mineView.swap.id).toBe(swap.id);
    expect(tokens.a).not.toBe(tokens.b);

    await expect(respond(db, tokens.b, { decision: "accept" }, NOW)).resolves.toBe("accepted");
  });

  it("refuses a swap where only one side gives, even from the public form", async () => {
    const mine = await createParty(db, { name: "Clinic Scheduler", kind: "app" });
    const theirs = await createParty(db, { name: "Practice Manager Weekly", kind: "newsletter" });
    await expectSurka(
      createSwap(db, {
        title: "A one-sided favour",
        partyAId: mine.id,
        partyBId: theirs.id,
        commitments: [
          { side: "a", description: "Extra free month for readers", dueDate: "2026-10-18" },
          { side: "a", description: "And a second thing from me", dueDate: "2026-10-19" },
        ],
      }),
      "invalid",
    );
  });
});

describe("the operator dashboard surfaces work", () => {
  it("counts deliveries waiting to be checked, which have no due date left", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);

    const view = await getSwapForToken(db, tokens.a, NOW);
    const mine = view.commitments.find((c) => c.side === "a");
    if (!mine) throw new Error("expected a commitment on side a");
    await markDelivered(db, tokens.a, mine.id, { proofUrl: "https://example.com/proof" }, NOW);

    const [listed] = await listSwaps(db);
    if (!listed) throw new Error("expected the swap to be listed");
    // Before this was counted, a swap in exactly this state read "Nothing due".
    expect(listed.awaitingCheck).toBe(1);
  });

  it("reports nothing waiting when every commitment is still pending", async () => {
    const { swap } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    const [listed] = await listSwaps(db);
    expect(listed?.awaitingCheck).toBe(0);
  });
});

describe("the Phase 0 gate counts whole swaps", () => {
  it("separates a swap that fully delivered from one that half did", async () => {
    // Swap one: both sides kept.
    const clean = await seedSwap();
    await markProposed(db, clean.swap.id, NOW);
    await respond(db, clean.tokens.b, { decision: "accept" }, NOW);
    const cleanView = await getSwapForToken(db, clean.tokens.a, NOW);
    for (const c of cleanView.commitments) await verifyCommitment(db, c.id, "kept", NOW);

    // Swap two: one side kept, the other missed.
    const partial = await seedSwap();
    await markProposed(db, partial.swap.id, NOW);
    await respond(db, partial.tokens.b, { decision: "accept" }, NOW);
    const partialView = await getSwapForToken(db, partial.tokens.a, NOW);
    for (const c of partialView.commitments) {
      await verifyCommitment(db, c.id, c.side === "a" ? "kept" : "missed", NOW);
    }

    const m = await pilotMetrics(db, NOW);
    expect(m.completedSwaps).toBe(2);
    // Three of four commitments were kept, which reads as 75% and flatters the
    // gate. Only one of the two swaps actually delivered in full.
    expect(m.onTimeRate).toBeCloseTo(0.75);
    expect(m.swapsFullyKept).toBe(1);
  });
});

describe("a track record survives into the next swap", () => {
  it("resolves the holder's own business from their link", async () => {
    const { app, newsletter, tokens } = await seedSwap();
    await expect(partyForToken(db, tokens.a)).resolves.toMatchObject({ id: app.id });
    await expect(partyForToken(db, tokens.b)).resolves.toMatchObject({ id: newsletter.id });
  });

  it("returns nothing for a token that isn't real, so no identity leaks", async () => {
    await seedSwap();
    await expect(partyForToken(db, "not-a-token")).resolves.toBeNull();
  });

  it("carries the record forward when the same party runs a second swap", async () => {
    const first = await seedSwap();
    await markProposed(db, first.swap.id, NOW);
    await respond(db, first.tokens.b, { decision: "accept" }, NOW);
    const view = await getSwapForToken(db, first.tokens.a, NOW);
    for (const c of view.commitments) await verifyCommitment(db, c.id, "kept", NOW);

    // Reusing the party is what the /start "from" token does.
    const carried = await partyForToken(db, first.tokens.a);
    if (!carried) throw new Error("expected a party for the holder's token");
    const other = await createParty(db, { name: "Someone New", kind: "newsletter" });
    const second = await createSwap(db, {
      title: "A second swap for the same business",
      partyAId: carried.id,
      partyBId: other.id,
      commitments: [
        { side: "a", description: "Another thing from me", dueDate: "2026-11-01" },
        { side: "b", description: "Another thing from them", dueDate: "2026-11-02" },
      ],
    });

    // A fresh party would read zero here, which is the bug this prevents.
    const shown = await getSwapForToken(db, second.tokens.b, NOW);
    expect(shown.records.a.kept).toBeGreaterThan(0);
  });
});

/**
 * Both sides hold private links and act independently. Every guard in this
 * service used to read a status, await, then write unconditionally, so two
 * overlapping requests both passed. These run on one connection: the event
 * loop is enough, no second instance required.
 */
describe("two people acting at once", () => {
  it("refuses a second answer that races the first", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);

    const both = await Promise.allSettled([
      respond(db, tokens.b, { decision: "accept" }, NOW),
      respond(db, tokens.b, { decision: "decline" }, NOW),
    ]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    // Exactly one outcome stuck, and it is not a swap stamped both ways.
    const detail = await getSwapDetail(db, swap.id);
    expect(["accepted", "declined"]).toContain(detail.swap.status);
    if (detail.swap.status === "accepted") expect(detail.swap.closedAt).toBeNull();
    else expect(detail.swap.acceptedAt).toBeNull();
  });

  it("refuses a cancel that races the partner's acceptance", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);

    const both = await Promise.allSettled([
      respond(db, tokens.b, { decision: "accept" }, NOW),
      cancelSwap(db, swap.id, "changed my mind", NOW),
    ]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const detail = await getSwapDetail(db, swap.id);
    // Previously this could end up accepted with closedAt set: live and closed.
    expect(detail.swap.acceptedAt === null || detail.swap.closedAt === null).toBe(true);
  });

  it("records one outcome when Kept and Missed are both submitted", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    const view = await getSwapForToken(db, tokens.a, NOW);
    const mine = view.commitments.find((c) => c.side === "a");
    if (!mine) throw new Error("expected a commitment on side a");

    const both = await Promise.allSettled([
      verifyCommitment(db, mine.id, "kept", NOW),
      verifyCommitment(db, mine.id, "missed", NOW),
    ]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("does not let a delivery overwrite a check that already landed", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    const view = await getSwapForToken(db, tokens.a, NOW);
    const mine = view.commitments.find((c) => c.side === "a");
    if (!mine) throw new Error("expected a commitment on side a");

    const both = await Promise.allSettled([
      verifyCommitment(db, mine.id, "kept", NOW),
      markDelivered(db, tokens.a, mine.id, { proofUrl: "https://example.com/proof" }, NOW),
    ]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    // The old bug left status "delivered" with verifiedAt set, which made the
    // commitment permanently uncheckable and erased the deliverer's credit.
    const after = await getSwapDetail(db, swap.id);
    const row = after.commitments.find((c) => c.id === mine.id);
    if (!row) throw new Error("expected the commitment to still exist");
    expect(row.status === "delivered" && row.verifiedAt !== null).toBe(false);
  });
});

describe("the public form opens a swap atomically", () => {
  it("creates it already proposed, so the links work the moment they are shown", async () => {
    const mine = await createParty(db, { name: "Clinic Scheduler", kind: "app" });
    const theirs = await createParty(db, { name: "Practice Manager Weekly", kind: "newsletter" });
    const { swap, tokens } = await createSwap(
      db,
      {
        title: "Newsletter section for an extended trial",
        partyAId: mine.id,
        partyBId: theirs.id,
        commitments: [
          { side: "a", description: "Extra free month for readers", dueDate: "2026-10-18" },
          { side: "b", description: "Dedicated section in the Oct 17 issue", dueDate: "2026-10-17" },
        ],
      },
      { status: "proposed", now: NOW },
    );

    expect(swap.status).toBe("proposed");
    expect(swap.proposedAt).not.toBeNull();
    // The partner can answer immediately; previously a failure between creating
    // and proposing left a swap nobody could reach, tokens included.
    await expect(respond(db, tokens.b, { decision: "accept" }, NOW)).resolves.toBe("accepted");
  });

  it("still defaults to draft for the operator flow", async () => {
    const { swap } = await seedSwap();
    expect(swap.status).toBe("draft");
  });
});

describe("reopening a commitment reopens its reminders", () => {
  it("clears spent windows so a reopened commitment is chased again", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    const view = await getSwapForToken(db, tokens.a, NOW);
    const mine = view.commitments.find((c) => c.side === "a");
    if (!mine) throw new Error("expected a commitment on side a");

    // Burn every window, then deliver and have the operator reject the proof.
    const sent: EmailMessage[] = [];
    const send = async (m: EmailMessage) => void sent.push(m);
    const dayAfter = new Date("2026-10-06T15:00:00Z");
    await runReminders(db, send, NOW);
    await runReminders(db, send, dayAfter);
    await markDelivered(db, tokens.a, mine.id, { proofUrl: "https://example.com/bad" }, NOW);

    const before = sent.length;
    await verifyCommitment(db, mine.id, "pending", NOW);
    // Without clearing the claims this run sends nothing and the reopened
    // commitment is never chased again.
    await runReminders(db, send, dayAfter);
    expect(sent.length).toBeGreaterThan(before);
  });
});

describe("a mis-check can be undone", () => {
  async function completed() {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    const view = await getSwapForToken(db, tokens.a, NOW);
    for (const c of view.commitments) await verifyCommitment(db, c.id, "kept", NOW);
    return { swap, tokens, commitments: view.commitments };
  }

  it("pulls the swap back out of completed when a check is reopened", async () => {
    const { swap, commitments: cs } = await completed();
    const first = cs[0];
    if (!first) throw new Error("expected commitments");
    expect((await getSwapDetail(db, swap.id)).swap.status).toBe("completed");

    await verifyCommitment(db, first.id, "pending", NOW);

    const after = await getSwapDetail(db, swap.id);
    expect(after.swap.status).toBe("accepted");
    // Not still stamped as finished, or the dashboard and both deal sheets lie.
    expect(after.swap.completedAt).toBeNull();
  });

  it("lets the operator record the opposite verdict afterwards", async () => {
    const { swap, commitments: cs } = await completed();
    const first = cs[0];
    if (!first) throw new Error("expected commitments");

    await verifyCommitment(db, first.id, "pending", NOW);
    await verifyCommitment(db, first.id, "missed", NOW);

    const after = await getSwapDetail(db, swap.id);
    expect(after.commitments.find((c) => c.id === first.id)?.status).toBe("missed");
    // Every commitment is resolved again, so the swap completes a second time.
    expect(after.swap.status).toBe("completed");
  });

  it("keeps the whole history, so the record is auditable rather than mutable", async () => {
    const { swap, commitments: cs } = await completed();
    const first = cs[0];
    if (!first) throw new Error("expected commitments");
    await verifyCommitment(db, first.id, "pending", NOW);

    const types = (await getSwapDetail(db, swap.id)).events.map((e) => e.type);
    expect(types).toContain("kept");
    expect(types).toContain("reopened");
  });

  it("still refuses to reopen a swap the partner declined", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "decline" }, NOW);
    const detail = await getSwapDetail(db, swap.id);
    const first = detail.commitments[0];
    if (!first) throw new Error("expected commitments");
    await expectSurka(verifyCommitment(db, first.id, "pending", NOW), "conflict");
  });
});
