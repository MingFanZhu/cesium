import config from "./playwright.examples.config.mjs";

export default {
  ...config,
  testMatch: "scenegis-directional-occlusion.spec.js",
  outputDir: "../Build/Specs/e2e/directional-occlusion",
  timeout: 120000,
};
