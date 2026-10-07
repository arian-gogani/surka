export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /**
   * Stable key for this exact message, passed to the provider so a retry after
   * an ambiguous failure cannot deliver twice. Without it, a response that is
   * lost after the provider already queued the mail looks identical to a
   * refusal, and the only safe choice would be to never retry.
   */
  idempotencyKey?: string;
}

export type EmailSender = (message: EmailMessage) => Promise<void>;

/** Which way a run actually delivered, so a log-only run is not mistaken for a real one. */
export type EmailProvider = "resend" | "log";

export interface Configured {
  provider: EmailProvider;
  /**
   * Whether this sender puts mail in front of a human.
   *
   * The log sender does not, and a caller that books a reminder as sent on the
   * strength of it burns that reminder for good: the window passes, the
   * once-only record stands, and the commitment is never chased again even
   * after a real key is added. Callers must check this before recording
   * anything.
   */
  delivers: boolean;
}

/**
 * Sends through Resend when RESEND_API_KEY is set. Otherwise prints the email
 * to the server log, which is all you need while developing.
 */
export function defaultEmailSender(): EmailSender & Configured {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    const log = async (m: EmailMessage) => {
      console.info(`[email] to=${m.to}\nsubject: ${m.subject}\n\n${m.text}\n`);
    };
    return Object.assign(log, { provider: "log" as const, delivers: false });
  }

  // No default. The old one was Surka <swaps@example.com>, a domain nobody can
  // verify, so setting the key alone made every send 403 forever while the
  // README called this variable optional. Failing here names the cause.
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new Error(
      "RESEND_API_KEY is set but EMAIL_FROM is not. Set EMAIL_FROM to an address on a domain you've verified with Resend, like Surka <swaps@yourdomain.com>.",
    );
  }

  const resend = async (m: EmailMessage) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }),
    });
    if (!res.ok) {
      throw new Error(`Email provider responded ${res.status}: ${await res.text()}`);
    }
  };
  return Object.assign(resend, { provider: "resend" as const, delivers: true });
}
