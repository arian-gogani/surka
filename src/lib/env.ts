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

export function contactEmail(): string {
  return process.env.CONTACT_EMAIL ?? "hello@example.com";
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in your environment (see .env.example).`);
  return value;
}
