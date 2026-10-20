import { defineConfig, devices } from "@playwright/test";

/** Talks to the dev server that is already running. Does not start another one. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "https://localhost:3000",
    ignoreHTTPSErrors: true,
    actionTimeout: 10_000,
    ...devices["Desktop Chrome"],
  },
});
