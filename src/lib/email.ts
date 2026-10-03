export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type EmailSender = (message: EmailMessage) => Promise<void>;

/**
 * Sends through Resend when RESEND_API_KEY is set. Otherwise prints the email
 * to the server log, which is all you need while running swaps by hand.
 */
export function defaultEmailSender(): EmailSender {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return async (m) => {
      console.info(`[email] to=${m.to}\nsubject: ${m.subject}\n\n${m.text}\n`);
    };
  }
  const from = process.env.EMAIL_FROM ?? "Ambo <swaps@example.com>";
  return async (m) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }),
    });
    if (!res.ok) {
      throw new Error(`Email provider responded ${res.status}: ${await res.text()}`);
    }
  };
}
