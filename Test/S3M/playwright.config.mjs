import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-s3m-layer.spec.js",
  outputDir: "../../Build/Specs/e2e/s3m",
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    channel: "chromium",
    baseURL: "http://localhost:8080",
    viewport: { width: 960, height: 540 },
  },
});
