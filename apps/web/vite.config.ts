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
      "/internal": apiProxyTarget
    }
  }
});
