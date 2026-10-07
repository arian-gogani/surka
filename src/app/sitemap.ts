import type { MetadataRoute } from "next";
import { getDb } from "@/db/client";
import { appUrl } from "@/lib/env";
import { listListings } from "@/lib/services/swaps";

/**
 * Only the pages a stranger should land on. Swap pages, the operator dashboard
 * and the tracking redirect are all private or pointless to index, and
 * robots.txt already disallows them.
 *
 * /partners is weighted with /start because it is the one page that answers
 * "who would swap with me", which is the question someone has before they have
 * any reason to care what Surka is.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const fixed: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/partners`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/list`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/start`, changeFrequency: "monthly", priority: 0.8 },
  ];

  // Each listing has its own page, and a page nothing links to from a sitemap
  // is a page a search engine has no reason to visit. A failure here must not
  // take the whole sitemap down with it.
  try {
    const listings = await listListings(await getDb());
    return [
      ...fixed,
      ...listings.map((l) => ({
        url: `${base}/partners/${l.id}`,
        lastModified: l.listedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.error("Could not add listings to the sitemap", error);
    return fixed;
  }
}
