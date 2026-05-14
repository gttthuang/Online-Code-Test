import "dotenv/config";

import { config } from "../config.js";
import { createPostgresPool, ensurePostgresDatabase } from "../infra/postgres.js";
import { runPostgresMigrations } from "../infra/postgres-migrate.js";

await ensurePostgresDatabase(config.postgres);
const pool = createPostgresPool(config.postgres);

try {
  await runPostgresMigrations(pool);
  console.log(`migrations applied for ${config.postgres.database}`);
} finally {
  await pool.end();
}
