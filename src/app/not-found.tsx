import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5">
      <Logo size={26} />
      <h1 className="mt-10 text-3xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="mt-3 text-lg text-muted">
        If someone sent you a swap link, it may have been mistyped. Ask them to send it again.
      </p>
      <Link href="/" className="mt-6 font-medium underline underline-offset-4">
        Go to the Ambo homepage
      </Link>
    </main>
  );
}
