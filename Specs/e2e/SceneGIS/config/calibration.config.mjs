import config from "./examples.config.mjs";

export default {
  ...config,
  testMatch: "scenegis-pbr-calibration.spec.js",
  outputDir: "../../../../Build/Specs/e2e/calibration",
  timeout: 120000,
};
