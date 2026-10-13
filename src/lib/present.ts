import type { Commitment, Party, PartyKind, Side } from "@/db/schema";
import type { DealSheetSide } from "@/components/deal-sheet";
import { describeRecord, type TrackRecord } from "./reputation";

/**
 * One set of words for what a business is.
 *
 * This existed three times with two different vocabularies: the two public
 * forms offered "App or software" and "Something else", and every page that
 * renders a listing said "App" and "Business". So a founder picked "Something
 * else" on /list and their own public listing came back reading "Business",
 * which is not what they chose and not a word anyone would pick for
 * themselves. The form labels win, because they are the words a person reads
 * while deciding, and they are the ones the answer has to keep meaning
 * afterwards.
 */
export const KIND_LABEL: Record<PartyKind, string> = {
  app: "App or software",
  newsletter: "Newsletter",
  community: "Community",
  creator: "Creator",
  other: "Something else",
};

/** Ordered for a select, and the only list of them. */
export const KIND_OPTIONS = (Object.keys(KIND_LABEL) as PartyKind[]).map((value) => ({
  value,
  label: KIND_LABEL[value],
}));

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** "Glow Reviews' link", "Bundle Builder's link". */
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name}'` : `${name}'s`;
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
