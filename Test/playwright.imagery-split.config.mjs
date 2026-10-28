import { defineConfig } from "@playwright/test";
import process from "node:process";

export default defineConfig({
  testDir: "../Specs/e2e",
  testMatch: [
    "scenegis-planar-imagery-split.spec.js",
    "scenegis-top-bottom-split.spec.js",
  ],
  outputDir: "../Build/Specs/e2e/imagery-split",
  timeout: 90000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    channel: process.env.CESIUM_TEST_BROWSER ?? "chromium",
    baseURL: process.env.CESIUM_TEST_URL ?? "http://localhost:8080",
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 2,
  },
});
