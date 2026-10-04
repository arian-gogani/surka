import type { Metadata } from "next";
import { appUrl } from "@/lib/env";
// Self-hosted fonts: no request to a third party, works offline in development.
import "@fontsource-variable/sora";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./globals.css";

const TITLE = "Surka: partner swaps that actually happen";
const DESCRIPTION =
  "You agree to a cross-promotion swap. Surka runs it: terms, assets, deadlines, reminders, proof, and results, so both sides grow.";

export const metadata: Metadata = {
  // Absolute base for the share card, so links posted elsewhere resolve it.
  metadataBase: new URL(appUrl()),
  title: { default: TITLE, template: "%s | Surka" },
  description: DESCRIPTION,
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "Surka",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
