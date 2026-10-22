import config from "./playwright.examples.config.mjs";

export default {
  ...config,
  testMatch: "scenegis-material-lighting-audit.spec.js",
  outputDir: "../Build/Specs/e2e/material-lighting-audit",
  timeout: 120000,
};
