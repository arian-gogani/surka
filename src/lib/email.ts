export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type EmailSender = (message: EmailMessage) => Promise<void>;

/** Which way a run actually delivered, so a log-only run is not mistaken for a real one. */
export type EmailProvider = "resend" | "log";

/**
 * Sends through Resend when RESEND_API_KEY is set. Otherwise prints the email
 * to the server log, which is all you need while running swaps by hand.
 */
export function defaultEmailSender(): EmailSender & { provider: EmailProvider } {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    const log = async (m: EmailMessage) => {
      console.info(`[email] to=${m.to}\nsubject: ${m.subject}\n\n${m.text}\n`);
    };
    return Object.assign(log, { provider: "log" as const });
  }
  const from = process.env.EMAIL_FROM ?? "Surka <swaps@example.com>";
  const resend = async (m: EmailMessage) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }),
    });
    if (!res.ok) {
      throw new Error(`Email provider responded ${res.status}: ${await res.text()}`);
    }
  };
  return Object.assign(resend, { provider: "resend" as const });
}
