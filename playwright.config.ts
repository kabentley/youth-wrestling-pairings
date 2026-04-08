import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3005);
const DATABASE_URL = `file:${process.cwd()}/prisma/e2e.db`;

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `cross-env PORT=${PORT} DATABASE_URL="${DATABASE_URL}" NEXT_TELEMETRY_DISABLED=1 npm run db:sqlite && npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});

// Set DATABASE_URL for test workers
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
}
