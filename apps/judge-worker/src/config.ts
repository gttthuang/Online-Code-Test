export const config = {
  pollIntervalMs: Number(process.env.JUDGE_POLL_INTERVAL_MS || 800),
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
