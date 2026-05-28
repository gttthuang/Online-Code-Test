import { Redis } from "ioredis";

type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  db: number;
};

export function createRedisConnection(config: RedisConfig) {
  return new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    maxRetriesPerRequest: null
  });
}
