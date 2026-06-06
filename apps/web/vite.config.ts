/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    proxy: {
      "/auth": apiProxyTarget,
      "/me": apiProxyTarget,
      "/admin": apiProxyTarget,
      "/healthz": apiProxyTarget,
      "/readyz": apiProxyTarget,
      "/metrics": apiProxyTarget,
      "/openapi.json": apiProxyTarget,
      "/internal": apiProxyTarget
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-setup.ts"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 75,
        branches: 75
      }
    }
  }
});
