import { describe, expect, it } from "vitest";
import { addDays, daysUntil, isValidDateOnly } from "@/lib/dates";
import { computeRecord, describeRecord, HALF_LIFE_DAYS } from "@/lib/reputation";
import { possessive } from "@/lib/present";
import { dueReminderKind } from "@/lib/reminders";
import {
  allResolved,
  canMoveCommitment,
  canTransition,
  hasBothSides,
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

  it("never reopens a finished swap", () => {
    for (const to of ["draft", "proposed", "accepted"] as const) {
      expect(canTransition("completed", to)).toBe(false);
      expect(canTransition("declined", to)).toBe(false);
      expect(canTransition("cancelled", to)).toBe(false);
    }
  });

  it("can't skip the partner's answer", () => {
    expect(canTransition("draft", "accepted")).toBe(false);
  });

  it("maps decisions to statuses", () => {
    expect(statusAfterDecision("accept")).toBe("accepted");
    expect(statusAfterDecision("counter")).toBe("countered");
    expect(statusAfterDecision("decline")).toBe("declined");
  });

  it("locks terms once agreed", () => {
    expect(termsEditable("draft")).toBe(true);
    expect(termsEditable("countered")).toBe(true);
    expect(termsEditable("proposed")).toBe(false);
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

  it("keeps checked commitments final", () => {
    expect(canMoveCommitment("pending", "delivered")).toBe(true);
    expect(canMoveCommitment("delivered", "kept")).toBe(true);
    expect(canMoveCommitment("kept", "missed")).toBe(false);
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
    expect(record).toEqual({ kept: 0, resolved: 0, score: null });
    expect(describeRecord(record)).toBe("No swaps through Ambo yet");
  });

  it("ignores commitments that haven't been checked", () => {
    const record = computeRecord(
      [
        { status: "kept", verifiedAt: NOW },
        { status: "pending", verifiedAt: null },
      ],
      NOW,
    );
    expect(record.resolved).toBe(1);
    expect(describeRecord(record)).toBe("Kept 1 of 1 commitment");
  });

  it("lets an old miss fade behind recent kept commitments", () => {
    const oldMiss = new Date(NOW.getTime() - 2 * HALF_LIFE_DAYS * 86_400_000);
    const record = computeRecord(
      [
        { status: "missed", verifiedAt: oldMiss },
        { status: "kept", verifiedAt: NOW },
      ],
      NOW,
    );
    expect(record.kept).toBe(1);
    expect(record.resolved).toBe(2);
    // The miss weighs a quarter as much: 1 / (1 + 0.25) = 0.8.
    expect(record.score).toBeCloseTo(0.8, 5);
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
