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
  // A run that could deliver nothing is not a success. Nothing reads this body
  // on a good day, so the one day it matters it has to be in the server log.
  if (run.undeliverable > 0) {
    console.error(
      `[reminders] ${run.undeliverable} reminder(s) were due and nothing could send them: no RESEND_API_KEY is set. They stay due.`,
    );
  }
  if (run.truncated) {
    console.warn("[reminders] hit the per-run cap. The next run continues from where this one stopped.");
  }
  return Response.json(run, { status: run.undeliverable > 0 ? 503 : 200 });
}
