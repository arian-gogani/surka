import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import type { EmailMessage } from "@/lib/email";
import { SurkaError } from "@/lib/errors";
import { describeRecord } from "@/lib/reputation";
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
  partyRecords,
  claimParty,
  createListing,
  getListingForToken,
  approveListing,
  pendingListings,
  getListing,
  getParty,
  listListings,
  setListed,
  setSideEmail,
  unlistParty,
  updateParty,
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

  it("takes the partner's own address over whatever the operator guessed", async () => {
    // Reminders are the product. This used to write only where the column was
    // still null, so an operator's guess beat the partner's real address.
    const seeded = await seedSwap();
    await updateParty(db, seeded.newsletter.id, {
      name: "Practice Manager Weekly",
      kind: "newsletter",
      email: "guess@pmweekly.example",
    });
    await markProposed(db, seeded.swap.id, NOW);
    await respond(db, seeded.tokens.b, { decision: "accept", email: "real@pmweekly.example" }, NOW);
    const view = await getSwapForToken(db, seeded.tokens.b, NOW);
    expect(view.partyB.email).toBe("real@pmweekly.example");
  });

  it("lets either side turn reminders on later, for its own side only", async () => {
    const { tokens } = await acceptedSwap();
    await setSideEmail(db, tokens.a, { email: "Dana@Clinicscheduler.example" });
    const view = await getSwapForToken(db, tokens.a, NOW);
    // Addresses are lowercased on the way in, so a reminder is not sent twice.
    expect(view.partyA.email).toBe("dana@clinicscheduler.example");
    await expectSurka(setSideEmail(db, tokens.a, { email: "not an address" }), "invalid");
  });

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

  it("replaces a wrong proof link without moving the delivery time", async () => {
    const { tokens, mine } = await acceptedSwap();
    await markDelivered(db, tokens.a, mine.id, { proofUrl: "https://clinicscheduler.example/wrong" }, NOW);
    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    await markDelivered(db, tokens.a, mine.id, { proofUrl: "https://clinicscheduler.example/right" }, later);

    const after = (await getSwapForToken(db, tokens.a, later)).commitments.find((c) => c.id === mine.id)!;
    expect(after.proofUrl).toBe("https://clinicscheduler.example/right");
    // Correcting the link must not make an on-time delivery look late.
    expect(after.deliveredAt?.getTime()).toBe(NOW.getTime());

    // Once checked it is the operator's to reopen, and the message says so.
    await verifyCommitment(db, mine.id, "kept", later);
    await expectSurka(
      markDelivered(db, tokens.a, mine.id, { proofUrl: "https://clinicscheduler.example/third" }, later),
      "conflict",
    );
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

    // The businesses page reads every record in one query. It has to agree
    // with the per-party version, including which side owns a commitment.
    const batched = await partyRecords(db, NOW);
    expect(batched.get(app.id)).toEqual(appRecord);
    expect(batched.get(newsletter.id)).toEqual(newsletterRecord);

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

  it("only lets a side report results for itself, and only on an agreed swap", async () => {
    const { swap, tokens } = await seedSwap();
    // A tab left open on a swap that never got agreed used to write a result
    // into it that no page would ever show.
    await expectSurka(reportResult(db, tokens.b, { metric: "signups", value: 42 }), "conflict");

    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    const result = await reportResult(db, tokens.b, { side: "a", metric: "signups", value: 42 });
    expect(result.side).toBe("b");
  });

  it("keeps one figure per measure even when two submits land at once", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);

    // A double-tapped submit on a phone. Delete-then-insert let both find
    // nothing to delete and both insert, which is the pair of contradictory
    // numbers the replacement behaviour exists to prevent.
    await Promise.all([
      reportResult(db, tokens.b, { metric: "signups", value: 500 }),
      reportResult(db, tokens.b, { metric: "signups", value: 500 }),
    ]);

    const view = await getSwapForToken(db, tokens.b, NOW);
    expect(view.results.filter((r) => r.metric === "signups")).toHaveLength(1);
  });

  it("replaces a figure for the same measure instead of stacking contradictions", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);

    await reportResult(db, tokens.b, { metric: "signups", value: 5000 });
    await reportResult(db, tokens.b, { metric: "signups", value: 500, note: "Meant 500." });
    // A different measure is a different figure, not a correction.
    await reportResult(db, tokens.b, { metric: "clicks", value: 80 });

    const view = await getSwapForToken(db, tokens.b, NOW);
    expect(view.results.map((r) => [r.metric, r.value])).toEqual(
      expect.arrayContaining([
        ["signups", 500],
        ["clicks", 80],
      ]),
    );
    expect(view.results).toHaveLength(2);
    // Replacing does not lose the history: the timeline keeps every submission.
    expect(view.events.filter((e) => e.type === "result_added")).toHaveLength(3);
  });
});

describe("the partner list", () => {
  async function agreed() {
    const seeded = await seedSwap();
    await markProposed(db, seeded.swap.id, NOW);
    await respond(db, seeded.tokens.b, { decision: "accept" }, NOW);
    return seeded;
  }

  it("shows nobody until somebody opts in", async () => {
    await agreed();
    expect(await listListings(db, NOW)).toEqual([]);
  });

  it("lists the business on the holder's own side, and only that one", async () => {
    const { app, newsletter, tokens } = await agreed();
    await setListed(db, await claimParty(db, tokens.b), {
      listed: "yes",
      offers: "A dedicated section to 9,000 practice managers",
      needs: "A tool my readers would actually use",
    });
    // Asking is not appearing: nothing can tell whether a listing is the
    // business it names, so a person reads it first.
    expect(await listListings(db, NOW)).toEqual([]);
    expect((await pendingListings(db, NOW)).map((l) => l.id)).toEqual([newsletter.id]);
    await approveListing(db, newsletter.id, NOW);

    const listings = await listListings(db, NOW);
    expect(listings.map((l) => l.id)).toEqual([newsletter.id]);
    expect(listings.map((l) => l.id)).not.toContain(app.id);
    expect(listings[0]?.offers).toContain("9,000 practice managers");
  });

  it("never publishes an email, a contact name, or the operator's notes", async () => {
    const { newsletter, tokens } = await agreed();
    await updateParty(db, newsletter.id, {
      name: "Practice Manager Weekly",
      kind: "newsletter",
      email: "editor@pmweekly.example",
      contactName: "Sam",
      notes: "Slow to reply. Chase twice.",
    });
    await setListed(db, await claimParty(db, tokens.b), {
      listed: "yes",
      offers: "A dedicated section in the next issue",
      needs: "Something my readers would use daily",
    });
    await approveListing(db, newsletter.id, NOW);

    const [listing] = await listListings(db, NOW);
    const published = JSON.stringify(listing);
    expect(published).not.toContain("editor@pmweekly.example");
    expect(published).not.toContain("Sam");
    expect(published).not.toContain("Chase twice");
  });

  it("won't list a business that says nothing useful", async () => {
    const { tokens } = await agreed();
    await expectSurka(setListed(db, tokens.b, { listed: "yes", offers: "stuff", needs: "" }), "invalid");
    expect(await listListings(db, NOW)).toEqual([]);
  });

  it("takes a business back off without losing what it wrote", async () => {
    const { newsletter, tokens } = await agreed();
    // Claimed once. A second claim from a swap link is refused on purpose, so
    // the link is kept rather than re-derived.
    const own = await claimParty(db, tokens.b);
    await setListed(db, own, {
      listed: "yes",
      offers: "A dedicated section in the next issue",
      needs: "Something my readers would use daily",
    });
    await approveListing(db, newsletter.id, NOW);
    await setListed(db, own, { listed: "" });
    expect(await listListings(db, NOW)).toEqual([]);
    // Delisting is not deleting: re-listing shouldn't mean retyping both boxes.
    expect((await getParty(db, newsletter.id))?.offers).toContain("dedicated section");
  });

  it("will not approve a business that never asked", async () => {
    const { newsletter } = await agreed();
    await expectSurka(approveListing(db, newsletter.id, NOW), "not_found");
    expect(await listListings(db, NOW)).toEqual([]);
  });

  it("clears the request when the operator declines, so it does not come back", async () => {
    const { newsletter, tokens } = await agreed();
    await setListed(db, await claimParty(db, tokens.b), {
      listed: "yes",
      offers: "Buy cheap followers at spam.example",
      needs: "Anyone at all, no questions asked",
    });
    expect(await pendingListings(db, NOW)).toHaveLength(1);

    await unlistParty(db, newsletter.id);
    expect(await pendingListings(db, NOW)).toEqual([]);
    expect(await listListings(db, NOW)).toEqual([]);
  });

  it("refuses an unknown link rather than listing a guess", async () => {
    await expectSurka(
      setListed(db, "not-a-real-token", { listed: "yes", offers: "x".repeat(20), needs: "y".repeat(20) }),
      "not_found",
    );
  });

  it("only resolves a listing for a business that is actually listed", async () => {
    const { app, newsletter, tokens } = await agreed();
    await setListed(db, await claimParty(db, tokens.b), {
      listed: "yes",
      offers: "A dedicated section in the next issue",
      needs: "Something my readers would use daily",
    });
    await approveListing(db, newsletter.id, NOW);
    // /start?with= takes a public id, so it must not be a way to attach a
    // proposal to a business that never asked to be found.
    expect(await getListing(db, newsletter.id, NOW)).not.toBeNull();
    expect(await getListing(db, app.id, NOW)).toBeNull();
    expect(await getListing(db, "not-a-uuid", NOW)).toBeNull();
  });
});

describe("listing without a swap", () => {
  const good = {
    name: "Invoice Nudge",
    kind: "app",
    website: "https://invoicenudge.example",
    email: "Pat@InvoiceNudge.example",
    offers: "A slot in our onboarding email to 2,000 new users a month",
    needs: "A billing or scheduling tool my users would pay for",
  };

  it("lists a business that has never run a swap", async () => {
    // The cold start: listing used to need a swap link, which only exists once
    // you have already swapped with someone.
    const { party, token } = await createListing(db, good, NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);

    // The public form is a request. Nothing verifies the name typed into it,
    // and the directory is an indexable page, so a person reads it first.
    expect(await listListings(db, NOW)).toEqual([]);
    expect((await pendingListings(db, NOW)).map((l) => l.id)).toEqual([party.id]);
    await approveListing(db, party.id, NOW);

    const listings = await listListings(db, NOW);
    expect(listings.map((l) => l.id)).toEqual([party.id]);
    expect(listings[0]?.record).toEqual({ kept: 0, resolved: 0, score: null });
    expect(describeRecord(listings[0]!.record)).toBe("No swaps through Surka yet");
  });

  it("won't list a business that says nothing useful", async () => {
    await expectSurka(createListing(db, { ...good, offers: "stuff" }, NOW), "invalid");
    await expectSurka(createListing(db, { ...good, needs: "" }, NOW), "invalid");
    await expectSurka(createListing(db, { ...good, name: "" }, NOW), "invalid");
    // A rejected listing leaves nothing behind.
    expect(await listListings(db, NOW)).toEqual([]);
  });

  it("gives the holder a link that manages the listing and nothing else", async () => {
    const { party, token } = await createListing(db, good, NOW);
    const view = await getListingForToken(db, token, NOW);
    expect(view?.party.id).toBe(party.id);
    expect(view?.swaps).toEqual([]);
    expect(await getListingForToken(db, "not-a-real-token", NOW)).toBeNull();
  });

  it("lets the holder edit and remove the listing with that link", async () => {
    const { party, token } = await createListing(db, good, NOW);
    await approveListing(db, party.id, NOW);
    await setListed(db, token, { listed: "yes", offers: "A dedicated slot, every week", needs: good.needs });
    // Editing a listing that is already public keeps it public: only the first
    // appearance waits on a person, because that is where the risk is.
    expect((await listListings(db, NOW))[0]?.offers).toBe("A dedicated slot, every week");

    await setListed(db, token, { listed: "" });
    expect(await listListings(db, NOW)).toEqual([]);
    // Delisting is not deleting: the link still resolves, so they can return.
    expect(await getListingForToken(db, token, NOW)).not.toBeNull();
  });

  it("carries the listed business into a swap instead of starting its record over", async () => {
    const { party, token } = await createListing(db, good, NOW);
    // /start?from= takes either kind of link, which is what makes the record
    // follow someone from their listing into their first swap.
    expect((await partyForToken(db, token))?.party.id).toBe(party.id);
    // Addresses are normalised on the way in, so reminders don't double-send.
    expect(party.email).toBe("pat@invoicenudge.example");
  });

  it("shows the holder their swaps, with their own side's link", async () => {
    const { party, token } = await createListing(db, good, NOW);
    const partner = await createParty(db, { name: "Practice Manager Weekly", kind: "newsletter" });
    const created = await createSwap(db, {
      title: "Onboarding slot for a feature",
      partyAId: party.id,
      partyBId: partner.id,
      commitments: [
        { side: "a", description: "A slot in the onboarding email", dueDate: "2026-10-20" },
        { side: "b", description: "A dedicated section in the next issue", dueDate: "2026-10-20" },
      ],
    });

    const view = await getListingForToken(db, token, NOW);
    expect(view?.swaps).toHaveLength(1);
    expect(view?.swaps[0]?.title).toBe("Onboarding slot for a feature");
    // Side A's link, never side B's: this page must not hand over the partner's.
    expect(view?.swaps[0]?.token).toBe(created.tokens.a);
    expect(view?.swaps[0]?.token).not.toBe(created.tokens.b);
  });
});

describe("what the operator can see and undo", () => {
  it("counts sides of a live swap that nothing can chase", async () => {
    // seedSwap gives side A an address and side B none.
    const { swap, tokens } = await seedSwap();
    expect((await pilotMetrics(db, NOW)).unchaseableSides).toBe(0);

    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    expect((await pilotMetrics(db, NOW)).unchaseableSides).toBe(1);

    await setSideEmail(db, tokens.b, { email: "sam@pmweekly.example" });
    expect((await pilotMetrics(db, NOW)).unchaseableSides).toBe(0);
  });

  it("lets the operator take a listing down without destroying it", async () => {
    const { party, token } = await createListing(
      db,
      {
        name: "Spam Factory",
        kind: "other",
        offers: "Buy cheap followers at spam.example",
        needs: "Anyone at all, no questions asked",
      },
      NOW,
    );
    expect((await pilotMetrics(db, NOW)).pendingListings).toBe(1);
    expect((await pilotMetrics(db, NOW)).listedParties).toBe(0);
    await approveListing(db, party.id, NOW);
    expect((await pilotMetrics(db, NOW)).listedParties).toBe(1);

    await unlistParty(db, party.id);
    expect(await listListings(db, NOW)).toEqual([]);
    expect((await pilotMetrics(db, NOW)).listedParties).toBe(0);
    // Not destructive: the business, its record and its link all survive, so a
    // mistaken takedown is recoverable by the holder.
    expect(await getListingForToken(db, token, NOW)).not.toBeNull();
    await expectSurka(unlistParty(db, "not-a-uuid"), "not_found");
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

  it("never books a reminder nothing can deliver", async () => {
    // The production state with no RESEND_API_KEY. Booking these as sent burned
    // the window for good: the once-only row stood and that commitment was
    // never chased again, even after a real key was added.
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);

    const logged: EmailMessage[] = [];
    const logOnly = Object.assign(async (m: EmailMessage) => void logged.push(m), {
      provider: "log" as const,
      delivers: false,
    });

    expect(await runReminders(db, logOnly, NOW)).toMatchObject({ sent: 0, undeliverable: 1 });
    expect(logged).toHaveLength(1);
    // Still due, every run, until something can actually deliver it.
    expect((await runReminders(db, logOnly, NOW)).undeliverable).toBe(1);

    const outbox: EmailMessage[] = [];
    const real = await runReminders(db, async (m) => void outbox.push(m), NOW);
    expect(real).toMatchObject({ sent: 1, undeliverable: 0 });
    expect(outbox[0]?.subject).toContain("Due in 3 days");
  });

  it("gives every reminder a key the provider can deduplicate on", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    const outbox: EmailMessage[] = [];
    await runReminders(db, async (m) => void outbox.push(m), NOW);
    // So a retry after a lost response cannot deliver a second copy.
    expect(outbox[0]?.idempotencyKey).toMatch(/^reminder-[0-9a-f-]{36}-3d$/);
  });

  it("records a sent reminder on the swap's timeline", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    await runReminders(db, async () => {}, NOW);

    // Without this the product could not show that it had chased anyone.
    const { events } = await getSwapForToken(db, tokens.a, NOW);
    const reminder = events.find((e) => e.type === "reminder_sent");
    expect(reminder?.side).toBe("a");
    expect(reminder?.detail).toBe("3d");
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
  it("resolves the holder's own business from their link, without the right to rewrite it", async () => {
    const { app, newsletter, tokens } = await seedSwap();
    // A swap link carries the business into a new swap but does not prove you
    // are that business. The counterparty holds this link by design.
    await expect(partyForToken(db, tokens.a)).resolves.toMatchObject({
      party: { id: app.id },
      canEditIdentity: false,
    });
    await expect(partyForToken(db, tokens.b)).resolves.toMatchObject({
      party: { id: newsletter.id },
      canEditIdentity: false,
    });

    const own = await claimParty(db, tokens.b);
    await expect(partyForToken(db, own)).resolves.toMatchObject({
      party: { id: newsletter.id },
      canEditIdentity: true,
    });
  });

  it("refuses to mint a second listing link for a business that has one", async () => {
    // Otherwise the takeover comes straight back: the ordinary flow hands the
    // proposer the partner's swap link, so a second claim from it would hand
    // them the business too.
    const { tokens } = await seedSwap();
    const first = await claimParty(db, tokens.b);
    await expectSurka(claimParty(db, tokens.b), "conflict");
    // The listing link itself is idempotent: it already is the proof.
    expect(await claimParty(db, first)).toBe(first);
  });

  it("will not let a swap link rewrite the business or its listing", async () => {
    const { newsletter, tokens } = await seedSwap();
    await expectSurka(
      setListed(db, tokens.b, { listed: "yes", offers: "x".repeat(20), needs: "y".repeat(20) }),
      "not_allowed",
    );
    expect((await getParty(db, newsletter.id))?.listingRequestedAt).toBeNull();
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
      partyAId: carried.party.id,
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

describe("re-sending a deal sheet", () => {
  it("is idempotent, so a double click is not an error", async () => {
    const { swap } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    // Previously: "A swap that is waiting on partner can't move to waiting on
    // partner." shown to the operator for a click that had already worked.
    await expect(markProposed(db, swap.id, NOW)).resolves.toBeUndefined();
    expect((await getSwapDetail(db, swap.id)).swap.status).toBe("proposed");
  });
});

describe("the acceptance time is a fact, not a cursor", () => {
  it("survives a completed swap being reopened", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    const agreedAt = (await getSwapDetail(db, swap.id)).swap.acceptedAt;

    const view = await getSwapForToken(db, tokens.a, NOW);
    for (const c of view.commitments) await verifyCommitment(db, c.id, "kept", NOW);
    const first = view.commitments[0];
    if (!first) throw new Error("expected commitments");

    const later = new Date("2026-11-20T15:00:00Z");
    await verifyCommitment(db, first.id, "pending", later);

    // Reopening moves the swap back to accepted; it must not rewrite when the
    // deal was actually agreed.
    expect((await getSwapDetail(db, swap.id)).swap.acceptedAt).toEqual(agreedAt);
  });
});

describe("acceptance rate counts answers, not current status", () => {
  it("counts a countered swap as answered", async () => {
    const a = await seedSwap();
    await markProposed(db, a.swap.id, NOW);
    await respond(db, a.tokens.b, { decision: "accept" }, NOW);

    const b = await seedSwap();
    await markProposed(db, b.swap.id, NOW);
    await respond(db, b.tokens.b, { decision: "counter", message: "Could we move the date?" }, NOW);

    // One accept, one counter. Status-based counting saw only the accept and
    // reported 100%; the partner answered both.
    expect((await pilotMetrics(db, NOW)).acceptanceRate).toBeCloseTo(0.5);
  });

  it("still counts a swap accepted then cancelled", async () => {
    const { swap, tokens } = await seedSwap();
    await markProposed(db, swap.id, NOW);
    await respond(db, tokens.b, { decision: "accept" }, NOW);
    await cancelSwap(db, swap.id, "called off", NOW);
    // Status-based counting dropped this from both sides of the ratio.
    expect((await pilotMetrics(db, NOW)).acceptanceRate).toBeCloseTo(1);
  });
});
