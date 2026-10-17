/**
 * Browser tests (`e2e/`): the real app in Chromium, for behaviour Vitest can't reach (localStorage,
 * what the page shows). Logic stays tested in Vitest under `tests/`.
 */
import { defineConfig, devices } from "@playwright/test";

// Not 3000, so a dev server the DM already has running doesn't get reused by accident.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
