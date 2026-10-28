/* global process */
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-water-optics.spec.js",
  outputDir: "../../Build/Specs/e2e/water-optics",
  timeout: 90000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    channel: process.env.CESIUM_TEST_BROWSER ?? "chrome",
    baseURL: process.env.SCENEGIS_TEST_BASE_URL ?? "http://localhost:8083",
    viewport: { width: 1185, height: 800 },
  },
});
