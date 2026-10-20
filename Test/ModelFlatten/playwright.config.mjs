import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-model-flatten.spec.js",
  outputDir: "../../Build/Specs/e2e/model-flatten",
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    channel: "chromium",
    baseURL: "http://localhost:8080",
    viewport: { width: 1280, height: 800 },
  },
});
