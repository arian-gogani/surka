import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const DRIZZLE = path.join(process.cwd(), "drizzle");

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

function journal(folder = DRIZZLE): Journal {
  return JSON.parse(readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as Journal;
}

const temps: string[] = [];
function tempFolder(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "surka-migrations-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

/**
 * Drizzle decides what is pending by comparing a timestamp watermark, taking
 * only the newest applied entry. It never compares the stored hash. So a
 * migration generated on a branch with a `when` below one already applied is
 * skipped permanently after the merge, and the deploy looks successful.
 */
describe("the migration journal", () => {
  it("is strictly increasing, so nothing can be silently skipped", () => {
    const entries = journal().entries;
    expect(entries.length).toBeGreaterThan(0);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.when, `${entries[i]!.tag} is not newer than ${entries[i - 1]!.tag}`).toBeGreaterThan(
        entries[i - 1]!.when,
      );
      expect(entries[i]!.idx).toBe(entries[i - 1]!.idx + 1);
    }
  });

  it("has no statement that destroys a column or table", () => {
    // Migrations run before the build, and the build can still fail, so the
    // currently-serving deployment runs against the new schema. That only
    // stays safe while every migration is additive. Dropping something is a
    // two-release job: stop reading it, ship, then drop in a later migration.
    // Deleting or blanking rows counts too. "Additive" was only checked
    // against schema statements, so TRUNCATE "events" or UPDATE "parties" SET
    // "email" = NULL passed, either of which destroys production data.
    const forbidden =
      /\b(drop\s+table|drop\s+column|alter\s+column|rename\s+(table|column|to)|truncate|delete\s+from|update\s+"?\w+"?\s+set)\b/i;
    // 0007 deliberately collapses duplicate results before adding a unique
    // index over them. Named explicitly so the exception cannot spread.
    const allowed = new Set(["0007_one_result_per_measure"]);
    for (const entry of journal().entries) {
      if (allowed.has(entry.tag)) continue;
      const sql = readFileSync(path.join(DRIZZLE, `${entry.tag}.sql`), "utf8");
      const offending = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => forbidden.test(s.replace(/^--.*$/gm, "")));
      expect(offending, `${entry.tag} is not additive`).toEqual([]);
    }
  });
});

/**
 * Every other test opens an empty database, so the whole class of migrations
 * that fail only against existing rows is invisible: a NOT NULL column with no
 * default, a unique index over duplicates, a cast that cannot apply. Those
 * abort the deploy at best, and at worst leave the schema ahead of the code,
 * because migrations commit before the build and the build can still fail.
 */
describe("migrating a database that already has rows", () => {
  /** A database migrated up to, but not including, `tag`. */
  async function openBefore(tag: string) {
    const entries = journal().entries;
    const upTo = entries.findIndex((e) => e.tag === tag);
    expect(upTo, `no migration tagged ${tag}`).toBeGreaterThan(-1);

    const folder = tempFolder();
    mkdirSync(path.join(folder, "meta"), { recursive: true });
    const kept = entries.slice(0, upTo);
    for (const entry of kept) cpSync(path.join(DRIZZLE, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
    writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal(), entries: kept }));

    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: folder });
    /** Applies everything, including `tag` and anything after it. */
    const finish = () => migrate(db, { migrationsFolder: DRIZZLE });
    return { client, finish };
  }

  /**
   * A row in every table, which is the point.
   *
   * This used to populate parties, swaps and commitments only, so a NOT NULL
   * column added to any of the other seven passed the test and then aborted
   * the deploy. swap_access in particular holds two rows per swap in
   * production and had none here.
   */
  const PILOT = `
    insert into parties (id, name, kind, email) values
      ('11111111-1111-4111-8111-111111111111', 'Clinic Scheduler', 'app', 'founder@example.com'),
      ('22222222-2222-4222-8222-222222222222', 'Practice Manager Weekly', 'newsletter', null);
    insert into swaps (id, title, status, party_a_id, party_b_id, proposed_at, accepted_at) values
      ('33333333-3333-4333-8333-333333333333', 'A swap', 'accepted',
       '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', now(), now());
    insert into commitments (id, swap_id, side, description, due_date, status) values
      ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
       'a', 'Something', '2026-10-20', 'pending'),
      ('44444444-4444-4444-8444-444444444445', '33333333-3333-4333-8333-333333333333',
       'b', 'Something else', '2026-10-21', 'delivered');
    insert into swap_access (token, swap_id, side, last_viewed_at) values
      ('tokenAAAAAAAAAAAAAAAAAAA', '33333333-3333-4333-8333-333333333333', 'a', now()),
      ('tokenBBBBBBBBBBBBBBBBBBB', '33333333-3333-4333-8333-333333333333', 'b', null);
    insert into responses (swap_id, side, decision, message, email) values
      ('33333333-3333-4333-8333-333333333333', 'b', 'accept', 'Sounds good', 'sam@example.com');
    insert into tracking_links (code, swap_id, side, label, destination_url, clicks) values
      ('abc2345', '33333333-3333-4333-8333-333333333333', 'b', 'Next issue', 'https://example.com/', 7);
    insert into events (swap_id, type, side, detail) values
      ('33333333-3333-4333-8333-333333333333', 'created', null, null),
      ('33333333-3333-4333-8333-333333333333', 'accept', 'b', 'Sounds good');
    insert into reminders_sent (commitment_id, kind) values
      ('44444444-4444-4444-8444-444444444444', '3d');
    insert into party_access (token, party_id) values
      ('tokenPPPPPPPPPPPPPPPPPPP', '22222222-2222-4222-8222-222222222222');
  `;

  it("applies the newest migration on top of representative rows", async () => {
    const entries = journal().entries;
    const newest = entries[entries.length - 1]!.tag;
    const { client, finish } = await openBefore(newest);
    await client.exec(PILOT);

    await expect(finish()).resolves.toBeUndefined();

    // Nothing was lost on the way through.
    const parties = await client.query<{ n: number }>("select count(*)::int as n from parties");
    expect(parties.rows[0]?.n).toBe(2);
  });

  it("collapses duplicate results rather than aborting on the unique index", async () => {
    // Pinned to its own migration rather than to "the newest one", because the
    // duplicate rows below are only insertable before 0007 adds the index.
    const { client, finish } = await openBefore("0007_one_result_per_measure");
    await client.exec(`
      ${PILOT}
      insert into results (swap_id, side, metric, value, created_at) values
        ('33333333-3333-4333-8333-333333333333', 'a', 'installs', 5000, now() - interval '1 day'),
        ('33333333-3333-4333-8333-333333333333', 'a', 'installs', 500, now());
    `);

    await expect(finish()).resolves.toBeUndefined();

    // The duplicate was collapsed instead of the deploy being aborted, and the
    // survivor is the newest, which is the figure the app would show.
    const rows = await client.query<{ value: number }>("select value from results where metric = 'installs'");
    expect(rows.rows.map((r) => r.value)).toEqual([500]);
  });
});
