import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5">
      {/* The logo is a link on every other page, so someone who mistyped a swap
          link taps the familiar mark here and gets nothing. */}
      <header>
        <a href="/" aria-label="Surka home">
          <Logo size={26} />
        </a>
      </header>
      <main>
        <h1 className="mt-10 text-3xl font-semibold">This page doesn&apos;t exist</h1>
        <p className="mt-3 text-lg text-muted">
          If someone sent you a swap link, it may have been mistyped. Ask them to send it again.
        </p>
        <Link
          href="/"
          className="-mx-2 mt-6 inline-flex min-h-11 items-center px-2 font-medium underline underline-offset-4"
        >
          Go to the Surka homepage
        </Link>
      </main>
    </div>
  );
}
