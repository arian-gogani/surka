import Link from "next/link";
import { logoutAction } from "@/app/admin/actions";
import { Logo } from "./logo";
import { Notice } from "./ui";

const NAV = [
  { href: "/admin", label: "Swaps" },
  { href: "/admin/parties", label: "Businesses" },
  { href: "/admin/listings", label: "Partner list" },
  { href: "/admin/swaps/new", label: "New swap" },
];

export function AdminShell({
  children,
  error,
  ok,
}: {
  children: React.ReactNode;
  error?: string;
  ok?: string;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 sm:px-8">
          <Link href="/admin" aria-label="Surka operator home">
            <Logo size={24} />
          </Link>
          <nav aria-label="Operator" className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-[15px] font-medium text-ink hover:bg-paper"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form action={logoutAction} className="ml-auto">
            <button type="submit" className="rounded-md px-3 py-2 text-[15px] text-muted hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {ok ? <Notice tone="ok">{ok}</Notice> : null}
        {children}
      </main>
    </div>
  );
}
