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
    "scenegis-deferred-planar.spec.js",
    "scenegis-deferred-materials.spec.js",
    "scenegis-deferred-annotations.spec.js",
    "scenegis-deferred-native-channels.spec.js",
    "scenegis-deferred-default-environment.spec.js",
    "scenegis-deferred-vectors.spec.js",
    "scenegis-deferred-custom-shader.spec.js",
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
