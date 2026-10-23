/* global process */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-rect-area-light.spec.js",
  outputDir: "../../Build/Specs/e2e/rect-area-light",
  workers: 1,
  retries: 0,
  reporter: "list",
  projects: [{ name: "dev" }, { name: "release" }],
  timeout: 60000,
  use: {
    baseURL: process.env.SCENEGIS_TEST_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: process.platform === "win32" ? ["--use-angle=d3d11"] : [],
    },
  },
});
