import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    headless: true,
  },
  webServer: {
    command: "npm run dev -- --host localhost --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});