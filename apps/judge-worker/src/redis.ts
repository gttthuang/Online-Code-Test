import { Redis } from "ioredis";

type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  db: number;
  tls?: boolean;
};

export function createRedisConnection(config: RedisConfig) {
  return new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    tls: config.tls ? {
      rejectUnauthorized: false,
      servername: config.host
    } : undefined,
    maxRetriesPerRequest: null,
    connectTimeout: 10000
  });
}
