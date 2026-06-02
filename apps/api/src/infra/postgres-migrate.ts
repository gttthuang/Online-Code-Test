import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { Pool } from "pg";

const migrationsDirectory = fileURLToPath(
  new URL("../../migrations", import.meta.url)
);

export async function runPostgresMigrations(pool: Pool) {
  await waitForPostgres(pool);
  await ensureMigrationTable(pool);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));

  const appliedMigrations = await pool.query<{ version: string }>(
    `
      select version
      from schema_migrations
      order by version asc
    `
  );
  const appliedVersions = new Set(appliedMigrations.rows.map((row) => row.version));

  for (const fileName of migrationFiles) {
    if (appliedVersions.has(fileName)) {
      continue;
    }

    const sql = await readFile(join(migrationsDirectory, fileName), "utf8");
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        `
          insert into schema_migrations (version)
          values ($1)
        `,
        [fileName]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function ensureMigrationTable(pool: Pool) {
  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function waitForPostgres(pool: Pool) {
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      await delay(1_000);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
