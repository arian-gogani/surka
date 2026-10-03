/** Absolute base URL for links in emails and copy buttons. */
export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function contactEmail(): string {
  return process.env.CONTACT_EMAIL ?? "hello@example.com";
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in your environment (see .env.example).`);
  return value;
}
