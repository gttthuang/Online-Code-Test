import { Pool } from "pg";

type PostgresConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

export function createPostgresPool(config: PostgresConfig) {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    connectionTimeoutMillis: 1_500
  });
}

export async function ensurePostgresDatabase(config: PostgresConfig) {
  const adminPool = new Pool({
    host: config.host,
    port: config.port,
    database: "postgres",
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 1_500
  });

  try {
    const result = await adminPool.query<{ exists: boolean }>(
      `select exists(select 1 from pg_database where datname = $1) as exists`,
      [config.database]
    );

    if (!result.rows[0]?.exists) {
      const databaseName = toIdentifier(config.database);
      await adminPool.query(`create database "${databaseName}"`);
    }
  } finally {
    await adminPool.end();
  }
}

export async function pingPostgres(pool: Pool) {
  const client = await pool.connect();

  try {
    await client.query("select 1");
    return true;
  } finally {
    client.release();
  }
}

function toIdentifier(value: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`Invalid postgres identifier: ${value}`);
  }

  return value;
}
