import {
  DeveloperError,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "@cesium/engine";

/**
 * Creates the planar world described by a Viewer configuration object.
 *
 * @param {object} options The declarative planar world options.
 * @returns {SceneGISPlanarWorld} The resolved planar world.
 * @private
 */
function createSceneGISPlanarViewerWorld(options) {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new DeveloperError("options.planarWorld must be an object.");
  }

  const extent = new SceneGISPlanarExtent(options.extent);
  const coordinateSystem = new SceneGISPlanarCoordinateSystem({
    extent,
    crs: options.crs,
  });

  return new SceneGISPlanarWorld({
    coordinateSystem,
    maximumLevel: options.maximumLevel,
    maximumScreenSpaceError: options.maximumScreenSpaceError,
    tileCacheSize: options.tileCacheSize,
    baseColor: options.baseColor,
    enableLighting: options.enableLighting,
    lambertDiffuseMultiplier: options.lambertDiffuseMultiplier,
  });
}

export default createSceneGISPlanarViewerWorld;
