import type { MetadataRoute } from "next";
import { getDb } from "@/db/client";
import { appUrl } from "@/lib/env";
import { desc, isNotNull } from "drizzle-orm";
import { parties } from "@/db/schema";

/**
 * Only the pages a stranger should land on. Swap pages, the operator dashboard
 * and the tracking redirect are all private or pointless to index, and
 * robots.txt already disallows them.
 *
 * /partners is weighted with /start because it is the one page that answers
 * "who would swap with me", which is the question someone has before they have
 * any reason to care what Surka is.
 */
/**
 * Rebuilt hourly.
 *
 * With no dynamic API and no revalidate, Next rendered this once at build, so
 * a listing approved after a deploy never entered the sitemap, which is the
 * whole point of the file. Hourly rather than per request, because this is the
 * one public page where a crawler could otherwise trigger a database read on
 * every visit.
 */
export const revalidate = 3600;

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
    // Two columns, not listListings: that computes every party's record and
    // joins every commitment, and nothing here uses either.
    const db = await getDb();
    const listings = await db
      .select({ id: parties.id, listedAt: parties.listedAt })
      .from(parties)
      .where(isNotNull(parties.listedAt))
      .orderBy(desc(parties.listedAt));
    return [
      ...fixed,
      ...listings.map((l) => ({
        url: `${base}/partners/${l.id}`,
        lastModified: l.listedAt ?? undefined,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.error("Could not add listings to the sitemap", error);
    return fixed;
  }
}
