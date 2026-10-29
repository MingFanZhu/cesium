/* global process */
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-curved-water.spec.js",
  outputDir: "../../Build/Specs/e2e/curved-water",
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    channel: process.env.CESIUM_TEST_BROWSER ?? "chromium",
    baseURL: process.env.SCENEGIS_TEST_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 1185, height: 800 },
  },
});
