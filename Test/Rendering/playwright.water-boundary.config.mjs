import { defineConfig } from "@playwright/test";
import process from "node:process";
export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-water-boundary.spec.js",
  outputDir: "../../Build/Specs/e2e/water-boundary",
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    channel: "chrome",
    baseURL: process.env.SCENEGIS_TEST_BASE_URL ?? "http://127.0.0.1:8093",
    viewport: { width: 1185, height: 800 },
  },
});
