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
  // prepare: false keeps it compatible with transaction-mode poolers.
  const client = postgres(url, { prepare: false, max: 5 });
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
    store.__surkaDb = url
      ? createPostgresDb(url)
      : createPgliteDb(process.env.PGLITE_DIR || path.join(process.cwd(), ".pglite"));
  }
  return store.__surkaDb;
}
