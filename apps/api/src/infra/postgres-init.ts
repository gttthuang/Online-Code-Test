import { runPostgresMigrations } from "./postgres-migrate.js";
import { seedPostgres } from "./postgres-seed.js";
import type { Pool } from "pg";

export async function initializePostgres(pool: Pool) {
  await runPostgresMigrations(pool);
  await seedPostgres(pool);
}
