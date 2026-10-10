import type { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, daysUntil, isValidDateOnly } from "@/lib/dates";
import { appUrl } from "@/lib/env";
import { computeRecord, describeRecord } from "@/lib/reputation";
import { possessive } from "@/lib/present";
import { commitmentInput, firstIssue, partyInput, resultInput } from "@/lib/validation";
import { dueReminderKind, reminderSubject } from "@/lib/reminders";
import {
  allResolved,
  canMoveCommitment,
  canTransition,
  hasBothSides,
  isFinal,
  statusAfterDecision,
  termsEditable,
} from "@/lib/swap-rules";

const NOW = new Date("2026-10-02T15:00:00Z");

describe("swap status rules", () => {
  it("follows the proposal flow", () => {
    expect(canTransition("draft", "proposed")).toBe(true);
    expect(canTransition("proposed", "accepted")).toBe(true);
    expect(canTransition("countered", "proposed")).toBe(true);
    expect(canTransition("accepted", "completed")).toBe(true);
  });

  it("never reopens a swap the partner closed", () => {
    // Declining and cancelling are the other side's decision, not a judgement
    // the operator made, so neither reopens.
    for (const to of ["draft", "proposed", "accepted"] as const) {
      expect(canTransition("declined", to)).toBe(false);
      expect(canTransition("cancelled", to)).toBe(false);
    }
  });

  it("reopens a completed swap, but only back to accepted", () => {
    // Completing is a conclusion the operator reached by hand, and a mis-click
    // on Kept should not be permanent.
    expect(canTransition("completed", "accepted")).toBe(true);
    expect(canTransition("completed", "draft")).toBe(false);
    expect(canTransition("completed", "proposed")).toBe(false);
    expect(canTransition("completed", "cancelled")).toBe(false);
  });

  it("reopens a checked commitment", () => {
    expect(canMoveCommitment("kept", "pending")).toBe(true);
    expect(canMoveCommitment("missed", "pending")).toBe(true);
    // But not straight from one verdict to the other: reopen, then re-check.
    expect(canMoveCommitment("kept", "missed")).toBe(false);
    expect(canMoveCommitment("missed", "kept")).toBe(false);
  });

  it("can't skip the partner's answer", () => {
    expect(canTransition("draft", "accepted")).toBe(false);
  });

  it("maps decisions to statuses", () => {
    expect(statusAfterDecision("accept")).toBe("accepted");
    expect(statusAfterDecision("counter")).toBe("countered");
    expect(statusAfterDecision("decline")).toBe("declined");
  });

  it("locks terms once agreed, and not before", () => {
    expect(termsEditable("draft")).toBe(true);
    expect(termsEditable("countered")).toBe(true);
    expect(termsEditable("accepted")).toBe(false);
  });

  it("requires both sides to give something", () => {
    expect(hasBothSides([{ side: "a" }, { side: "b" }])).toBe(true);
    expect(hasBothSides([{ side: "a" }, { side: "a" }])).toBe(false);
  });

  it("completes only when every commitment is checked", () => {
    expect(allResolved([])).toBe(false);
    expect(allResolved([{ status: "kept" }, { status: "missed" }])).toBe(true);
    expect(allResolved([{ status: "kept" }, { status: "delivered" }])).toBe(false);
  });

  it("moves a commitment forward through delivery", () => {
    expect(canMoveCommitment("pending", "delivered")).toBe(true);
    expect(canMoveCommitment("delivered", "kept")).toBe(true);
  });

  it("lets a delivery be re-sent so a wrong proof link can be replaced", () => {
    expect(canMoveCommitment("delivered", "delivered")).toBe(true);
    // Still not after a verdict: that is the operator's to reopen.
    expect(canMoveCommitment("kept", "delivered")).toBe(false);
    expect(canMoveCommitment("missed", "delivered")).toBe(false);
  });
});

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isValidDateOnly("2026-02-28")).toBe(true);
    expect(isValidDateOnly("2026-02-30")).toBe(false);
    expect(isValidDateOnly("10/02/2026")).toBe(false);
  });

  it("counts days in UTC", () => {
    expect(daysUntil("2026-10-02", NOW)).toBe(0);
    expect(daysUntil("2026-10-05", NOW)).toBe(3);
    expect(daysUntil("2026-09-30", NOW)).toBe(-2);
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("track record", () => {
  it("starts empty", () => {
    const record = computeRecord([], NOW);
    expect(record).toEqual({ kept: 0, resolved: 0, late: 0 });
    expect(describeRecord(record)).toBe("No swaps through Surka yet");
  });

  it("ignores a commitment that is still live", () => {
    const record = computeRecord(
      [
        { status: "kept", verifiedAt: NOW, dueDate: "2026-09-01", deliveredAt: null },
        // Still in the future, so it is a promise in flight, not a broken one.
        { status: "pending", verifiedAt: null, dueDate: "2026-10-20", deliveredAt: null },
      ],
      NOW,
    );
    expect(record.resolved).toBe(1);
    expect(describeRecord(record)).toBe("Kept 1 of 1 commitment");
  });

  it("counts an accepted promise nobody delivered, once it is clearly abandoned", () => {
    // Nothing writes "missed" except the operator's button, and the reminder
    // run gives up after one overdue notice, so ghosting a commitment used to
    // be free and invisible: the denominator was the operator's workload, not
    // the business's promises.
    const kept = { status: "kept" as const, verifiedAt: NOW, dueDate: "2026-09-20", deliveredAt: null };
    const live = { status: "pending" as const, verifiedAt: null, dueDate: "2026-10-20", deliveredAt: null };
    const slipping = { status: "pending" as const, verifiedAt: null, dueDate: "2026-09-25", deliveredAt: null };
    const ghosted = { status: "pending" as const, verifiedAt: null, dueDate: "2026-08-01", deliveredAt: null };

    expect(computeRecord([kept, live], NOW)).toEqual({ kept: 1, resolved: 1, late: 0 });
    // A week late is a slipped issue, not an abandoned promise.
    expect(computeRecord([kept, slipping], NOW)).toEqual({ kept: 1, resolved: 1, late: 0 });
    expect(computeRecord([kept, ghosted], NOW)).toEqual({ kept: 1, resolved: 2, late: 0 });
    expect(describeRecord(computeRecord([kept, ghosted], NOW))).toBe("Kept 1 of 2 commitments");

    // Delivered and waiting on the operator never counts against the party who
    // did their part: that would charge them for our latency.
    const waiting = { status: "delivered" as const, verifiedAt: null, dueDate: "2026-08-01", deliveredAt: null };
    expect(computeRecord([kept, waiting], NOW)).toEqual({ kept: 1, resolved: 1, late: 0 });
  });

  it("says when a kept commitment landed after its deadline", () => {
    // deliveredAt was stored from the start and compared to nothing, so
    // "Kept 2 of 2" was true of two deliveries that both blew their dates, on
    // a product whose pitch is holding both sides to the dates.
    const onTime = {
      status: "kept" as const,
      verifiedAt: NOW,
      dueDate: "2026-10-05",
      deliveredAt: new Date("2026-10-05T23:00:00Z"),
    };
    const late = {
      status: "kept" as const,
      verifiedAt: NOW,
      dueDate: "2026-10-05",
      deliveredAt: new Date("2026-10-09T01:00:00Z"),
    };

    // Same day counts as on time, however late in the day.
    expect(computeRecord([onTime], NOW)).toEqual({ kept: 1, resolved: 1, late: 0 });
    expect(computeRecord([onTime, late], NOW)).toEqual({ kept: 2, resolved: 2, late: 1 });
    expect(describeRecord(computeRecord([onTime, late], NOW))).toBe("Kept 2 of 2 commitments, 1 late");
    expect(describeRecord(computeRecord([onTime], NOW))).toBe("Kept 1 of 1 commitment");
  });

  it("counts an old miss exactly like a recent one", () => {
    // There used to be a 180 day half life here, computed and displayed
    // nowhere, so this test pinned the weighting of a number no reader could
    // see while both pages showed the raw counts. The displayed number is the
    // one worth testing.
    const old = new Date(NOW.getTime() - 3 * 365 * 86_400_000);
    const record = computeRecord(
      [
        { status: "missed", verifiedAt: old, dueDate: "2026-09-01", deliveredAt: null },
        { status: "kept", verifiedAt: NOW, dueDate: "2026-09-01", deliveredAt: null },
      ],
      NOW,
    );
    expect(record).toEqual({ kept: 1, resolved: 2, late: 0 });
    expect(describeRecord(record)).toBe("Kept 1 of 2 commitments");
  });
});

describe("reminder timing", () => {
  const pending = (dueDate: string) => ({ status: "pending" as const, dueDate });

  it("sends nothing far from the deadline", () => {
    expect(dueReminderKind(pending("2026-10-09"), [], NOW)).toBeNull();
  });

  it("sends the 3-day reminder, then the 1-day reminder", () => {
    expect(dueReminderKind(pending("2026-10-05"), [], NOW)).toBe("3d");
    expect(dueReminderKind(pending("2026-10-05"), ["3d"], NOW)).toBeNull();
    expect(dueReminderKind(pending("2026-10-03"), ["3d"], NOW)).toBe("1d");
  });

  it("catches up after a missed run without double-sending", () => {
    expect(dueReminderKind(pending("2026-10-02"), [], NOW)).toBe("1d");
    expect(dueReminderKind(pending("2026-10-04"), ["1d"], NOW)).toBeNull();
  });

  it("sends one overdue notice", () => {
    expect(dueReminderKind(pending("2026-10-01"), [], NOW)).toBe("overdue");
    expect(dueReminderKind(pending("2026-10-01"), ["overdue"], NOW)).toBeNull();
  });

  it("leaves delivered commitments alone", () => {
    expect(dueReminderKind({ status: "delivered", dueDate: "2026-10-01" }, [], NOW)).toBeNull();
  });
});

describe("wording", () => {
  it("writes possessives the way people do", () => {
    expect(possessive("Bundle Builder")).toBe("Bundle Builder's");
    expect(possessive("Glow Reviews")).toBe("Glow Reviews'");
  });
});

describe("app URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers APP_URL, then the Vercel production domain, then localhost", () => {
    vi.stubEnv("APP_URL", "https://surka.example/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "surka.vercel.app");
    expect(appUrl()).toBe("https://surka.example");
    vi.stubEnv("APP_URL", "");
    expect(appUrl()).toBe("https://surka.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(appUrl()).toBe("http://localhost:3000");
  });
});

describe("reminder subjects match the body", () => {
  const DUE = "2026-10-05";
  it("says today when the deadline is today, even in the 1d window", () => {
    // The public form allows a deadline of today, so this is reachable: the
    // window is named "1d" but the subject used to claim "Due tomorrow".
    expect(reminderSubject("1d", "A swap", DUE, new Date("2026-10-05T15:00:00Z"))).toContain("Due today");
  });

  it("says tomorrow only when it really is tomorrow", () => {
    expect(reminderSubject("1d", "A swap", DUE, new Date("2026-10-04T15:00:00Z"))).toContain("Due tomorrow");
  });

  it("says in 2 days inside the 3d window rather than claiming 3", () => {
    expect(reminderSubject("3d", "A swap", DUE, new Date("2026-10-03T15:00:00Z"))).toContain("in 2 days");
  });

  it("still says in 3 days at the top of that window", () => {
    expect(reminderSubject("3d", "A swap", DUE, new Date("2026-10-02T15:00:00Z"))).toContain("in 3 days");
  });

  it("ignores the day count when overdue", () => {
    expect(reminderSubject("overdue", "A swap", DUE, new Date("2026-10-09T15:00:00Z"))).toContain("Overdue");
  });
});

describe("validation speaks to the person filling the form", () => {
  const messageFor = (schema: z.ZodType, input: unknown): string => {
    const parsed = schema.safeParse(input);
    if (parsed.success) throw new Error("expected this input to be rejected");
    return firstIssue(parsed.error);
  };

  it("never leaks Zod's internal wording", () => {
    const cases: [z.ZodType, unknown][] = [
      [resultInput, { side: "a", metric: "installs", value: 20_000_000 }],
      [resultInput, { side: "a", metric: "installs", value: -1 }],
      [resultInput, { side: "a", metric: "installs", value: "not a number" }],
      [partyInput, { name: "x".repeat(200) }],
      [commitmentInput, { side: "a", description: "y".repeat(600), dueDate: "2026-10-05" }],
    ];
    for (const [schema, input] of cases) {
      const message = messageFor(schema, input);
      // "Too big: expected string to have <=500 characters" and friends.
      expect(message).not.toMatch(/Too (big|small)|expected (string|number) to/i);
      expect(message[0]).toBe(message[0]?.toUpperCase());
    }
  });

  it("rejects a blank result instead of storing zero", () => {
    // formData.get returns null for an absent field, and Number(null) is 0.
    expect(messageFor(resultInput, { side: "a", metric: "installs", value: null })).toContain("number");
    expect(messageFor(resultInput, { side: "a", metric: "installs", value: "  " })).toContain("number");
  });

  it("still accepts a real result", () => {
    expect(resultInput.safeParse({ side: "a", metric: "installs", value: "15" }).success).toBe(true);
  });
});

describe("terms stay editable until both sides agree", () => {
  it("includes proposed, since swaps from the public form arrive that way", () => {
    expect(termsEditable("proposed")).toBe(true);
    expect(termsEditable("accepted")).toBe(false);
    expect(termsEditable("completed")).toBe(false);
  });

  it("does not offer a cancel on a completed swap", () => {
    // isFinal("completed") is false now that it can reopen, so the dashboard
    // must gate the cancel form on the transition rather than on finality.
    expect(isFinal("completed")).toBe(false);
    expect(canTransition("completed", "cancelled")).toBe(false);
  });
});
