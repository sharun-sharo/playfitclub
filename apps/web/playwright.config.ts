import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/play-screen-ui.spec.ts",
  timeout: 70_000,
  expect: { timeout: 20_000 },
  use: { baseURL: "http://localhost:3000", ...devices["Desktop Chrome"] },
  webServer: [
    {
      command: "npm run dev -w @fitplay/realtime",
      cwd: "../..",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev -w @fitplay/web",
      cwd: "../..",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
