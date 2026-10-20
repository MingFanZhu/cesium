import Cartesian3 from "../../../Core/Cartesian3.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";

function validateWorld(world) {
  if (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed()) {
    throw new DeveloperError(
      "planar.world must be a live SceneGISPlanarWorld.",
    );
  }
}

/**
 * Keeps native GeoJSON parsing in one explicit, instance-owned coordinate domain.
 * @private
 */
const SceneGISPlanarGeoJson = {
  prepare(dataSource, options) {
    let context = dataSource._sceneGISGeoJson;
    if (defined(context)) {
      if (
        defined(options) &&
        (context.world !== options.world ||
          context.projectCoordinates !== options.projectCoordinates ||
          !defined(context.world))
      ) {
        throw new DeveloperError(
          "GeoJSON coordinate mode, planar world, and projectCoordinates cannot change. Create a new GeoJsonDataSource.",
        );
      }
    } else {
      if (defined(options)) {
        validateWorld(options.world);
        if (typeof options.projectCoordinates !== "function") {
          throw new DeveloperError("planar.projectCoordinates is required.");
        }
      }
      context = Object.freeze({
        world: options?.world,
        projectCoordinates: options?.projectCoordinates,
      });
      dataSource._sceneGISGeoJson = context;
    }
    if (defined(context.world)) {
      validateWorld(context.world);
      return context;
    }
    return undefined;
  },

  createCrsFunction(context, crs) {
    validateWorld(context.world);
    if (crs === null) {
      return null;
    }
    return function (coordinates) {
      const position = context.projectCoordinates(coordinates, crs);
      if (
        !(position instanceof Cartesian3) ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y) ||
        !Number.isFinite(position.z)
      ) {
        throw new DeveloperError(
          "planar.projectCoordinates must return a finite Cartesian3 in world meters.",
        );
      }
      return Cartesian3.clone(position);
    };
  },
};

export default SceneGISPlanarGeoJson;
