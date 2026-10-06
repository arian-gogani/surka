import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

/**
 * Only the two pages a stranger should land on. Swap pages, the operator
 * dashboard and the tracking redirect are all private or pointless to index,
 * and robots.txt already disallows them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return [
    { url: base, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/start`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
