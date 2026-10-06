import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { runReminders } from "@/lib/services/reminders";
import { respond } from "@/lib/services/swaps";

let db: Db;

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));
vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  getDb: async () => db,
}));

import { startSwapAction } from "@/app/start/actions";
import { EMPTY_START } from "@/app/start/state";

beforeAll(async () => { db = await createPgliteDb(); });
beforeEach(async () => {
  await db.execute(sql`truncate parties, swaps, commitments, swap_access, responses, tracking_links, results, events, reminders_sent cascade`);
});

describe("public swap start", () => {
  it("lets the creator provide an optional reminder email", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      title: "Two newsletter placements",
      yourName: "First Weekly",
      yourKind: "newsletter",
      yourEmail: "Editor@First.example",
      partnerName: "Second Weekly",
      partnerKind: "newsletter",
      yourGive: "A dedicated placement in our next issue",
      partnerGive: "A dedicated placement in their next issue",
      yourDue: "2026-10-08",
      partnerDue: "2026-10-08",
    })) form.set(key, value);

    let target = "";
    // The action takes the previous state first now, so a rejected submit can
    // hand back what was typed instead of wiping an eleven-field form.
    try { await startSwapAction(EMPTY_START, form); } catch (error) { target = String(error); }
    expect(target).toMatch(/^Error: REDIRECT:\/start\/sent\?/);
    const url = new URL(target.slice("Error: REDIRECT:".length), "http://localhost");
    const a = url.searchParams.get("a") ?? "";
    const b = url.searchParams.get("b") ?? "";
    const { getSwapForToken } = await import("@/lib/services/swaps");
    const view = await getSwapForToken(db, a);
    expect(view.partyA.email).toBe("editor@first.example");

    await respond(db, b, { decision: "accept" }, new Date("2026-10-05T15:00:00Z"));
    const sent: string[] = [];
    const run = await runReminders(db, async (message) => { sent.push(message.to); }, new Date("2026-10-05T15:00:00Z"));
    expect(run).toMatchObject({ sent: 1, skipped: 1, failed: 0 });
    expect(sent).toEqual(["editor@first.example"]);
  });
});

describe("a rejected submit keeps what was typed", () => {
  it("hands every field back instead of wiping the form", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      title: "A swap worth keeping",
      yourName: "First Weekly",
      yourKind: "newsletter",
      yourGive: "A dedicated placement in our next issue",
      yourDue: "2026-10-08",
      partnerName: "Second Weekly",
      partnerKind: "newsletter",
      partnerGive: "A dedicated placement in their next issue",
      // Not a real date, so the server rejects it after the browser is bypassed.
      partnerDue: "not-a-date",
    })) form.set(key, value);

    const state = await startSwapAction(EMPTY_START, form);
    expect(state.error).toBeTruthy();
    // Everything they typed comes back, including the eight good fields.
    expect(state.values.title).toBe("A swap worth keeping");
    expect(state.values.yourGive).toBe("A dedicated placement in our next issue");
    expect(state.values.partnerName).toBe("Second Weekly");
    expect(state.values.partnerKind).toBe("newsletter");
  });
});
