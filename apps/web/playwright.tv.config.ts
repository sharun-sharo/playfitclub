import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "tv-browser.spec.ts",
  timeout: 70_000,
  expect: { timeout: 20_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "https://127.0.0.1:3000",
    ignoreHTTPSErrors: true,
  },
});
