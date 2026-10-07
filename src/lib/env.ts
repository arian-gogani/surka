/**
 * Absolute base URL for links in emails and copy buttons: APP_URL if set,
 * then the Vercel project's production domain, then localhost.
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * The address to reach a human, or null when none is configured.
 *
 * No placeholder. The old fallback was hello@example.com, so any deploy that
 * forgot the variable shipped a dead "Talk to us" that looked live, and the
 * pages that offer to sort out a problem were offering nothing. Callers render
 * the link only when there is somewhere for it to go.
 */
export function contactEmail(): string | null {
  const value = process.env.CONTACT_EMAIL?.trim();
  return value ? value : null;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in your environment (see .env.example).`);
  return value;
}
