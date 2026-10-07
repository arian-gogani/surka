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

/** The app's shared database handle, reused across hot reloads. */
export function getDb(): Promise<Db> {
  if (!store.__surkaDb) {
    const url = process.env.DATABASE_URL?.trim();
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
