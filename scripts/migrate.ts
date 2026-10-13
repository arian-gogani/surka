/**
 * Applies migrations to the database in DATABASE_URL. Without DATABASE_URL,
 * opening the local PGlite database migrates it automatically.
 */
import path from "node:path";
import { createPgliteDb } from "../src/db/client";

/**
 * One arbitrary but fixed number, so every build competes for the same lock.
 *
 * Drizzle's migrator reads the applied-migration watermark, then opens a
 * transaction and applies everything newer. There is no lock in between and
 * nothing unique on the version, so two builds overlapping by a few seconds
 * both decide the same migration is pending. The loser blocks on the table
 * lock for the winner's whole batch and then dies on "relation already
 * exists", failing a deploy for no reason.
 */
const MIGRATION_LOCK = 4815162342;

async function main() {
  /*
   * A preview migrates its own database, if it has one.
   *
   * The app now refuses to open production from a preview and tells you to set
   * PREVIEW_DATABASE_URL. Following that advice used to leave you with a
   * branch database nothing had ever migrated, because this script only ever
   * looked at DATABASE_URL and bailed out of preview before reaching it. The
   * remedy and the guard have to agree.
   */
  const preview = process.env.VERCEL_ENV === "preview" ? process.env.PREVIEW_DATABASE_URL?.trim() : null;
  // Migrations go through the direct connection when a pooled one is also set.
  const url = preview || (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)?.trim();
  if (!url && process.env.VERCEL) {
    console.error("No DATABASE_URL on this Vercel project. Connect a Postgres database (Storage, then Create Database), then redeploy.");
    process.exit(1);
  }
  if (!url) {
    await createPgliteDb(path.join(process.cwd(), ".pglite"));
    console.log("Local database is up to date (.pglite).");
    return;
  }

  /*
   * A preview build must never change the production schema.
   *
   * Only when it has no database of its own. The Neon integration scopes one
   * DATABASE_URL to both Preview and Production unless per-branch databases
   * are set up, so without this every pull request build migrated production
   * and two open pull requests could race each other. With
   * PREVIEW_DATABASE_URL set, the block above has already pointed this run at
   * the branch and there is nothing to refuse.
   */
  if (process.env.VERCEL_ENV === "preview" && !preview && process.env.MIGRATE_ON_PREVIEW !== "1") {
    console.warn(
      "Skipping migrations: this is a preview build with no PREVIEW_DATABASE_URL, and DATABASE_URL is shared with production. Point PREVIEW_DATABASE_URL at a Neon branch and this build will migrate that instead. Set MIGRATE_ON_PREVIEW=1 to migrate production from a preview on purpose.",
    );
    return;
  }

  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  // prepare: false in case this URL turns out to be the pooled one: a
  // transaction-mode pooler rejects named prepared statements, which would
  // fail the whole DDL transaction.
  const client = postgres(url, { max: 1, prepare: false });
  try {
    // Session-scoped, so it is released even if this process is killed.
    await client.unsafe(`select pg_advisory_lock(${MIGRATION_LOCK})`);
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("Migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
