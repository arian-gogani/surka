/**
 * Applies migrations to the database in DATABASE_URL. Without DATABASE_URL,
 * opening the local PGlite database migrates it automatically.
 */
import path from "node:path";
import { createPgliteDb } from "../src/db/client";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    await createPgliteDb(path.join(process.cwd(), ".pglite"));
    console.log("Local database is up to date (.pglite).");
    return;
  }
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await client.end();
  console.log("Migrations applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
