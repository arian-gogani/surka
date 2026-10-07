import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import { ListForm } from "./list-form";

export const metadata: Metadata = {
  title: "List your business for cross-promotion",
  description:
    "Say what you can offer a partner and what you're after. Founders can propose a swap to you, and Surka holds both sides to the dates. No account.",
  alternates: { canonical: "/list" },
};

export default function ListPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" aria-label="Surka home">
          <Logo size={30} />
        </a>
        <ButtonLink href="/partners">See the list</ButtonLink>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 sm:px-8">
        <h1 className="max-w-[20ch] text-[36px] font-semibold leading-[1.05] sm:text-[44px]">
          Let partners come to you.
        </h1>
        <p className="mt-5 max-w-prose text-lg leading-relaxed text-muted">
          Say what you can offer and what you&apos;re after, and founders can propose a swap to you without an
          introduction. When one is agreed, Surka holds both sides to the dates and checks that each part
          actually shipped.
        </p>
        <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-muted">
          Your name, what kind of business you are, your website and these two answers are public. Your email
          never is. Every swap you complete adds to the record shown next to your name, which is the part a
          listing cannot write about itself.
        </p>

        <ListForm />
      </main>
    </div>
  );
}
