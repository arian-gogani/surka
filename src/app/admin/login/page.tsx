import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { Button, Field, Notice } from "@/components/ui";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Operator sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = Boolean(process.env.ADMIN_PASSWORD && (process.env.SESSION_SECRET?.length ?? 0) >= 16);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <Logo size={26} />
      <h1 className="mt-10 text-2xl font-semibold">Operator sign in</h1>
      <div className="mt-6 space-y-4">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!configured ? (
          <Notice tone="error">Set ADMIN_PASSWORD and SESSION_SECRET (16+ characters) in your environment first.</Notice>
        ) : null}
        <form action={loginAction} className="space-y-4">
          <Field label="Password">
            <input name="password" type="password" required autoComplete="current-password" className="field" />
          </Field>
          <Button type="submit" variant="action" className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
