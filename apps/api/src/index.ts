import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 定義路徑
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 載入環境變數
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

console.log("REDIS_HOST from env:", process.env.REDIS_HOST);

import { buildApp } from "./app.js";
// ... 以下保持不變
import { config } from "./config.js";

const app = await buildApp();

await app.listen({
  port: config.port,
  host: "0.0.0.0"
});
