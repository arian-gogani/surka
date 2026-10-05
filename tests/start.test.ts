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
    try { await startSwapAction(form); } catch (error) { target = String(error); }
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
    expect(run).toEqual({ sent: 1, skipped: 1, failed: 0 });
    expect(sent).toEqual(["editor@first.example"]);
  });
});
