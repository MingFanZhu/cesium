import { defineConfig } from "@playwright/test";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  testDir: "../../Specs/e2e",
  testMatch: "scenegis-distribution.spec.js",
  outputDir: "../../Build/Specs/e2e/distribution",
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    channel: "chrome",
    baseURL: "http://127.0.0.1:8104",
    viewport: { width: 960, height: 640 },
  },
  webServer: {
    command: "node scripts/scenegis/distribution-server.mjs",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://127.0.0.1:8104/package.json",
    reuseExistingServer: false,
  },
});
