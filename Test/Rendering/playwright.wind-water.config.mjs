/* global process */
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-wind-water.spec.js",
  outputDir: "../../Build/Specs/e2e/wind-water",
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    channel: "chromium",
    baseURL: process.env.SCENEGIS_TEST_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 1185, height: 667 },
  },
});
