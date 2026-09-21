/* global process */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-pbr-reference.spec.js",
  outputDir: "../../Build/Specs/e2e/pbr-reference",
  timeout: 120000,
  expect: { timeout: 60000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    channel: "chromium",
    baseURL: process.env.SCENEGIS_TEST_BASE_URL ?? "http://localhost:8082",
    viewport: { width: 1280, height: 800 },
  },
});
