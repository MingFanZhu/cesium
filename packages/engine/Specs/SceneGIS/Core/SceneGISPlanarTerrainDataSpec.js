import { SceneGISPlanarTerrainData } from "../../../index.js";

describe("SceneGIS/Core/SceneGISPlanarTerrainData", function () {
  it("cannot be instantiated directly", function () {
    expect(function () {
      return new SceneGISPlanarTerrainData();
    }).toThrowDeveloperError();
  });

  it("keeps metadata and operations abstract", function () {
    for (const propertyName of [
      "minimumHeight",
      "maximumHeight",
      "credits",
      "waterMask",
      "wasCreatedByUpsampling",
    ]) {
      expect(function () {
        return SceneGISPlanarTerrainData.prototype[propertyName];
      }).toThrowDeveloperError();
    }
    expect(function () {
      SceneGISPlanarTerrainData.prototype.interpolateHeight(undefined, 0, 0);
    }).toThrowDeveloperError();
    expect(function () {
      SceneGISPlanarTerrainData.prototype.isChildAvailable(0, 0, 0, 0);
    }).toThrowDeveloperError();
  });

  it("does not expose mesh, upsample, destroy, or GPU lifecycle methods", function () {
    expect(SceneGISPlanarTerrainData.prototype.createMesh).toBeUndefined();
    expect(SceneGISPlanarTerrainData.prototype.upsample).toBeUndefined();
    expect(SceneGISPlanarTerrainData.prototype.destroy).toBeUndefined();
    expect(SceneGISPlanarTerrainData.prototype.isDestroyed).toBeUndefined();
  });
});
