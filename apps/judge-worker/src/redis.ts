import { Redis } from "ioredis";

type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  db: number;
};


export function createRedisConnection(config: RedisConfig) {
  // 自動判斷是否為本地環境
  console.log("DEBUG: Connecting to Redis with:", JSON.stringify(config, null, 2));
  const isLocal = config.host === "localhost" || config.host === "127.0.0.1";

  return new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    // 只有非本地環境才啟用 TLS
    tls: isLocal ? undefined : {
      rejectUnauthorized: false,
      servername: config.host
    },
    maxRetriesPerRequest: null,
    connectTimeout: 10000
  });
}
