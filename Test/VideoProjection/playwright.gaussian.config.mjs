import { defineConfig } from "@playwright/test";
import process from "node:process";

export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-gaussian-video-projection.spec.js",
  outputDir:
    process.env.VIDEO_PROJECTION_RELEASE === "1"
      ? "../../Build/Specs/e2e/gaussian-video-release"
      : "../../Build/Specs/e2e/gaussian-video",
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    channel: "chrome",
    baseURL: "http://localhost:8096",
    viewport: { width: 1280, height: 800 },
  },
});
