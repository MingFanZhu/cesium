/* global process */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: [
    "scenegis-deferred-lighting.spec.js",
    "scenegis-tiled-lighting.spec.js",
    "scenegis-deferred-styling.spec.js",
    "scenegis-deferred-primitives.spec.js",
    "scenegis-deferred-globe.spec.js",
  ],
  outputDir: "../../Build/Specs/e2e/deferred",
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
