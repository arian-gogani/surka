import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/** Either driver: PGlite locally and in tests, Postgres in production. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/**
 * Embedded Postgres (WebAssembly). Pass a directory to persist between
 * restarts, or nothing for a throwaway in-memory database. Migrations run on
 * open, so a fresh checkout works with no setup.
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}

/** Hosted Postgres (Neon, Supabase, RDS). Run `npm run db:migrate` first. */
export async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(url, {
    // Compatible with transaction-mode poolers, which reject named statements.
    prepare: false,
    max: 5,
    // Fluid Compute reuses an instance across concurrent requests and keeps it
    // warm, so without these each instance pins five sockets for as long as it
    // lives, and a frozen one holds sockets the database has already dropped.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });
  return drizzle(client, { schema }) as unknown as Db;
}

const store = globalThis as unknown as { __surkaDb?: Promise<Db> };

/**
 * Which database this deployment may open.
 *
 * The Neon integration scopes one DATABASE_URL to both Preview and Production
 * unless per-branch databases are set up, so a preview deployment read and
 * wrote the live data: a pull request could create listings, approve them,
 * accept swaps, and verify commitments against the record real businesses are
 * judged on. Preview builds no longer migrate that database, which was the
 * half that could break a deploy, but reading and writing it was the half that
 * could corrupt it.
 *
 * Preview now needs its own URL and refuses to fall back. Breaking previews
 * until a branch database exists is the right failure: a broken preview costs
 * a few minutes, and nothing in the product can tell a preview's writes from a
 * real founder's afterwards.
 *
 * Set PREVIEW_DATABASE_URL to a Neon branch, or ALLOW_PRODUCTION_DB_IN_PREVIEW
 * to 1 if you genuinely want a preview pointed at live data and have decided
 * that on purpose.
 */
function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  if (process.env.VERCEL_ENV !== "preview") return url;

  const preview = process.env.PREVIEW_DATABASE_URL?.trim();
  if (preview) return preview;
  if (process.env.ALLOW_PRODUCTION_DB_IN_PREVIEW === "1") return url;
  throw new Error(
    "This is a preview deployment and PREVIEW_DATABASE_URL is not set. DATABASE_URL is shared with production, so a preview would read and write live swaps. Point PREVIEW_DATABASE_URL at a Neon branch, or set ALLOW_PRODUCTION_DB_IN_PREVIEW=1 to accept that.",
  );
}

/** The app's shared database handle, reused across hot reloads. */
export function getDb(): Promise<Db> {
  if (!store.__surkaDb) {
    const url = databaseUrl();
    if (!url && process.env.VERCEL) {
      // Serverless functions can't keep a local database; fail clearly instead.
      throw new Error(
        "DATABASE_URL is not set. Add a Postgres database to this Vercel project from the Marketplace (Storage, then Create Database, then Neon) and redeploy.",
      );
    }
    // Clear the slot if init rejects. Caching the rejected promise meant every
    // later request on that instance got the same failure, and under Fluid
    // Compute an instance lives a long time.
    const opening = url
      ? createPostgresDb(url)
      : createPgliteDb(process.env.PGLITE_DIR || path.join(process.cwd(), ".pglite"));
    store.__surkaDb = opening.catch((error) => {
      store.__surkaDb = undefined;
      throw error;
    });
  }
  return store.__surkaDb;
}
