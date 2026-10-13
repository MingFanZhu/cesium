/* global process */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-gbuffer.spec.js",
  outputDir: "../../Build/Specs/e2e/gbuffer",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.SCENEGIS_TEST_BASE_URL ?? "http://localhost:8080",
    channel: process.env.SCENEGIS_TEST_BROWSER_CHANNEL ?? "chromium",
    launchOptions: {
      args: process.platform === "win32" ? ["--use-angle=d3d11"] : [],
    },
  },
});
