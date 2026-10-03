import type { Metadata } from "next";
// Self-hosted fonts: no request to a third party, works offline in development.
import "@fontsource-variable/sora";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Surka: partner swaps that actually happen", template: "%s | Surka" },
  description:
    "You agree to a cross-promotion swap. Surka runs it: terms, assets, deadlines, reminders, proof, and results, so both sides grow.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
