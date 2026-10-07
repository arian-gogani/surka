import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

/**
 * Only the pages a stranger should land on. Swap pages, the operator dashboard
 * and the tracking redirect are all private or pointless to index, and
 * robots.txt already disallows them.
 *
 * /partners is weighted with /start because it is the one page that answers
 * "who would swap with me", which is the question someone has before they have
 * any reason to care what Surka is.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return [
    { url: base, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/partners`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/list`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/start`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
