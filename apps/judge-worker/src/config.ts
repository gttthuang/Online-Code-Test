export const config = {
  heartbeatIntervalMs: Number(process.env.JUDGE_HEARTBEAT_INTERVAL_MS || 2_000),
  staleThresholdMs: Number(process.env.JUDGE_STALE_THRESHOLD_MS || 30_000),
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    // tls: {}
  },
  queueConcurrency: Number(process.env.JUDGE_QUEUE_CONCURRENCY || 2),
  postgres: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: Number(process.env.POSTGRES_PORT || 5433),
    database: process.env.POSTGRES_DB || "online_code_test",
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "postgres",
    ssl: process.env.POSTGRES_SSL === "true"
  },
  sandbox: {
    workRoot: process.env.JUDGE_SANDBOX_WORK_ROOT || ".judge-work",
    pythonImage: process.env.JUDGE_PYTHON_IMAGE || "python:3.13-slim",
    cppImage: process.env.JUDGE_CPP_IMAGE || "gcc:13",
    cpuLimit: process.env.JUDGE_SANDBOX_CPUS || "1",
    memoryLimitMb: Number(process.env.JUDGE_SANDBOX_MEMORY_MB || 256),
    pidsLimit: Number(process.env.JUDGE_SANDBOX_PIDS_LIMIT || 64)
  }
};
