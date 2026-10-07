import { getDb } from "@/db/client";
import { destinationFor, recordClick } from "@/lib/services/swaps";

export const dynamic = "force-dynamic";

const CODE = /^[2-9a-zA-Z]{4,16}$/;

/**
 * Re-checked here, not only where it was written.
 *
 * One function writes these today, but nothing in the database enforces that,
 * and this value goes straight into a Location header. A seed script, an
 * import, or a hand-edited row should not be able to turn this into a
 * redirector for a scheme nobody intended.
 */
function safe(destination: string): boolean {
  return /^https?:\/\//i.test(destination) && !/[\u0000-\u001f\u007f]/.test(destination);
}

function send(destination: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location: destination, "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

function missing(): Response {
  return new Response("This link doesn't exist.", { status: 404, headers: { "content-type": "text/plain" } });
}

/**
 * Whether this request is a person following the link.
 *
 * A click count is the number both founders use to decide whether to swap
 * again, and it was counting link checkers, uptime monitors, mail-gateway
 * prescanners and browser prefetches. None of those is a reader.
 */
function isRealVisit(request: Request): boolean {
  const purpose = `${request.headers.get("sec-purpose") ?? ""} ${request.headers.get("purpose") ?? ""}`;
  return !purpose.toLowerCase().includes("prefetch");
}

/** Tracking redirect: counts the click, then sends the visitor on. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!CODE.test(code)) return missing();
  const db = await getDb();
  const destination = isRealVisit(request) ? await recordClick(db, code) : await destinationFor(db, code);
  if (!destination || !safe(destination)) return missing();
  return send(destination);
}

/**
 * Next implements HEAD from GET unless you say otherwise, and HEAD is exactly
 * what the automated fetchers prefer because it is cheap. Every link checker
 * was adding a click.
 */
export async function HEAD(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!CODE.test(code)) return missing();
  const destination = await destinationFor(await getDb(), code);
  if (!destination || !safe(destination)) return missing();
  return send(destination);
}
