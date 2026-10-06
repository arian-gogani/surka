import { getDb } from "@/db/client";
import { constantTimeEquals } from "@/lib/compare";
import { defaultEmailSender } from "@/lib/email";
import { runReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";
// The loop is one sequential HTTPS call per due commitment; a mid-run timeout
// would permanently drop every reminder already claimed but not yet sent.
export const maxDuration = 300;

/** Daily reminder run. Vercel Cron calls this with the CRON_SECRET bearer token. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const presented = request.headers.get("authorization") ?? "";
  if (!secret || !constantTimeEquals(presented, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const run = await runReminders(await getDb(), defaultEmailSender());
  return Response.json(run);
}
