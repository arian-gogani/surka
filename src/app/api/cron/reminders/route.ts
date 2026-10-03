import { getDb } from "@/db/client";
import { defaultEmailSender } from "@/lib/email";
import { runReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";

/** Daily reminder run. Vercel Cron calls this with the CRON_SECRET bearer token. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const run = await runReminders(await getDb(), defaultEmailSender());
  return Response.json(run);
}
