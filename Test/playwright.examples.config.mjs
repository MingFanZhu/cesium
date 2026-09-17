import { defineConfig } from "@playwright/test";

// Connect to the existing root server without starting Sandcastle.
export default defineConfig({
  testDir: "../Specs/e2e",
  testMatch: "scenegis-feature-examples.spec.js",
  outputDir: "../Build/Specs/e2e/feature-examples",
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8080",
    viewport: { width: 1280, height: 800 },
  },
});
