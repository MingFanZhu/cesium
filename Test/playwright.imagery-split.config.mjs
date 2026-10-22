import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../Specs/e2e",
  testMatch: "scenegis-planar-imagery-split.spec.js",
  outputDir: "../Build/Specs/e2e/imagery-split",
  timeout: 90000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    channel: "chromium",
    baseURL: "http://localhost:8080",
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 2,
  },
});
