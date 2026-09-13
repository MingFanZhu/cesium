import { defineConfig } from "@playwright/test";

// Use the existing Cesium dev server; these tests never start Sandcastle.
export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-vector-*.spec.js",
  outputDir: "../../Build/Specs/e2e/vector-artifacts",
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8080",
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: [] },
  },
});
