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
    max: 5,
    connectionTimeoutMillis: 1_500
  });
}
