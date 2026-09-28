import config from "./playwright.examples.config.mjs";

export default {
  ...config,
  testMatch: [
    "scenegis-pbr-calibration.spec.js",
    "scenegis-pbr-reference.spec.js",
  ],
  outputDir: "../Build/Specs/e2e/calibration",
  timeout: 120000,
};
