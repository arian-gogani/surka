/**
 * Publishes a markdown file in content/posts to DEV.
 *
 *   npm run post -- content/posts/the-market-that-closed.md           # draft
 *   npm run post -- content/posts/the-market-that-closed.md --publish # live
 *
 * Drafts by default on purpose. A command that publishes to the open internet
 * on its first argument is a command you will eventually run by accident.
 *
 * Needs DEV_API_KEY, from dev.to Settings, Extensions, DEV Community API Keys.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const API = "https://dev.to/api/articles";

interface FrontMatter {
  title: string;
  tags: string[];
  canonicalUrl: string | null;
}

/** Splits the leading --- block from the body. Deliberately small: we control these files. */
function parse(raw: string): { front: FrontMatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) throw new Error("No front matter found. The file must start with a --- block.");
  const [, head, body] = match;
  const fields = new Map<string, string>();
  for (const line of (head ?? "").split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at === -1) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
    fields.set(key, value);
  }

  const title = fields.get("title");
  if (!title) throw new Error("Front matter needs a title.");
  const canonical = fields.get("canonical_url");
  return {
    front: {
      title,
      tags: (fields.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 4),
      canonicalUrl: canonical ? canonical : null,
    },
    body: (body ?? "").trim(),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const publish = args.includes("--publish");

  if (!file) {
    console.error("Usage: npm run post -- <file.md> [--publish]");
    process.exit(1);
  }
  const key = process.env.DEV_API_KEY;
  if (!key) {
    console.error("Set DEV_API_KEY first. Get one at dev.to, Settings, Extensions, DEV Community API Keys.");
    process.exit(1);
  }

  const { front, body } = parse(readFileSync(path.resolve(file), "utf8"));

  console.log(`\n  ${front.title}`);
  console.log(`  tags: ${front.tags.join(", ") || "none"}`);
  console.log(`  ${body.length} characters`);
  console.log(`  ${publish ? "PUBLISHING LIVE" : "saving as a draft"}\n`);

  const response = await fetch(API, {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      article: {
        title: front.title,
        body_markdown: body,
        published: publish,
        tags: front.tags,
        ...(front.canonicalUrl ? { canonical_url: front.canonicalUrl } : {}),
      },
    }),
  });

  if (!response.ok) {
    console.error(`DEV refused it: ${response.status} ${response.statusText}`);
    console.error(await response.text());
    process.exit(1);
  }

  const article = (await response.json()) as { url?: string; id?: number };
  console.log(publish ? `Live at ${article.url}` : `Draft saved. Review it at https://dev.to/dashboard`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
