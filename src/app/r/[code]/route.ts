import { getDb } from "@/db/client";
import { recordClick } from "@/lib/services/swaps";

export const dynamic = "force-dynamic";

/** Tracking redirect: counts the click, then sends the visitor on. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const destination = /^[2-9a-zA-Z]{4,16}$/.test(code) ? await recordClick(await getDb(), code) : null;
  if (!destination) {
    return new Response("This link doesn't exist.", { status: 404, headers: { "content-type": "text/plain" } });
  }
  return new Response(null, {
    status: 302,
    headers: { location: destination, "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}
