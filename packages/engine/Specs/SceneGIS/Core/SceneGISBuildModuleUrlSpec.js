import { buildModuleUrl } from "../../../index.js";

describe("SceneGIS/Core/buildModuleUrl", function () {
  let previousNew;
  let previousLegacy;
  beforeEach(function () {
    previousNew = window.SCENEGIS_BASE_URL;
    previousLegacy = window.CESIUM_BASE_URL;
    buildModuleUrl._clearBaseResource();
  });
  afterEach(function () {
    window.SCENEGIS_BASE_URL = previousNew;
    window.CESIUM_BASE_URL = previousLegacy;
    buildModuleUrl._clearBaseResource();
  });

  it("recognizes branded script paths and query/fragment suffixes", function () {
    const expression = buildModuleUrl._cesiumScriptRegex;
    expect(expression.exec("SceneGIS.js")[1]).toEqual("");
    expect(expression.exec("/vendor/maps/SceneGIS.js?v=1#main")[1]).toEqual(
      "/vendor/maps/",
    );
    expect(
      expression.exec("https://example.invalid/maps/SceneGIS.js#main")[1],
    ).toEqual("https://example.invalid/maps/");
    expect(expression.exec("OtherSceneGIS.js")).toBeNull();
    expect(expression.exec("scenegis.js")).toBeNull();
  });

  it("prefers the SceneGIS resource root and normalizes its slash", function () {
    window.SCENEGIS_BASE_URL = "https://example.invalid/vendor/maps";
    window.CESIUM_BASE_URL = "https://example.invalid/legacy/";
    expect(buildModuleUrl("Workers/createGeometry.js")).toEqual(
      "https://example.invalid/vendor/maps/Workers/createGeometry.js",
    );
  });

  it("retains an explicit setBaseUrl override", function () {
    window.SCENEGIS_BASE_URL = "https://example.invalid/vendor/maps/";
    buildModuleUrl.setBaseUrl("https://example.invalid/explicit/");
    expect(buildModuleUrl("Assets/test.png")).toEqual(
      "https://example.invalid/explicit/Assets/test.png",
    );
  });
});
