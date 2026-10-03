import type { Commitment, Party, PartyKind, Side } from "@/db/schema";
import type { DealSheetSide } from "@/components/deal-sheet";
import { describeRecord, type TrackRecord } from "./reputation";

export const KIND_LABEL: Record<PartyKind, string> = {
  app: "App",
  newsletter: "Newsletter",
  community: "Community",
  creator: "Creator",
  other: "Business",
};

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function partyDetail(party: Party): string {
  return [KIND_LABEL[party.kind], host(party.website)].filter(Boolean).join(", ");
}

export function sheetSide(party: Party, side: Side, items: Commitment[], record: TrackRecord): DealSheetSide {
  return {
    name: party.name,
    detail: partyDetail(party),
    record: describeRecord(record),
    gives: items
      .filter((c) => c.side === side)
      .map((c) => ({ description: c.description, dueDate: c.dueDate })),
  };
}
