export const config = {
  pollIntervalMs: Number(process.env.JUDGE_POLL_INTERVAL_MS || 800),
  postgres: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: Number(process.env.POSTGRES_PORT || 5433),
    database: process.env.POSTGRES_DB || "online_code_test",
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "postgres",
    ssl: process.env.POSTGRES_SSL === "true"
  }
};
