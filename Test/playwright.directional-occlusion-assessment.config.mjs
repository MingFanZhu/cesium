import config from "./playwright.examples.config.mjs";

export default {
  ...config,
  testMatch: "scenegis-directional-occlusion-assessment.spec.js",
  outputDir: "../Build/Specs/e2e/directional-occlusion-assessment",
  timeout: 120000,
};
