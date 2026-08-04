import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/edituber/" : "/",
  plugins: [react()],
  server: {
    port: 4318,
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
  preview: { port: 4318 },
});
