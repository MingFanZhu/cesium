import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartographic from "../../../Core/Cartographic.js";
import Ellipsoid from "../../../Core/Ellipsoid.js";
import Rectangle from "../../../Core/Rectangle.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Extent from "../SceneGISPlanarExtent.js";
import CoordinateSystem from "../SceneGISPlanarCoordinateSystem.js";
import TilingScheme from "../SceneGISPlanarTilingScheme.js";

const radius = 6378137;
const halfWidth = Math.PI * radius;
const ellipsoid = Ellipsoid.WGS84;
const eccentricitySquared =
  1 - ellipsoid.radiiSquared.z / ellipsoid.radiiSquared.x;

function latitude(y) {
  return Math.atan(Math.sinh(y / radius));
}

function cartographic(x, y, height = 0, result = new Cartographic()) {
  result.longitude = x / radius;
  result.latitude = latitude(y);
  result.height = height;
  return result;
}

function position(x, y, height = 0, result = new Cartesian3()) {
  return ellipsoid.cartographicToCartesian(cartographic(x, y, height), result);
}

function rectangle(bounds, result = new Rectangle()) {
  result.west = (bounds.minimumX / halfWidth) * Math.PI;
  result.east = (bounds.maximumX / halfWidth) * Math.PI;
  result.south = latitude(bounds.minimumY);
  result.north = latitude(bounds.maximumY);
  return result;
}

function scheme(input) {
  if (input === undefined) {
    input = new TilingScheme({
      coordinateSystem: new CoordinateSystem({
        crs: "EPSG:3857",
        extent: new Extent({
          minimumX: -halfWidth,
          minimumY: -halfWidth,
          maximumX: halfWidth,
          maximumY: halfWidth,
        }),
      }),
    });
  }
  const extent = input?.coordinateSystem?.extent;
  if (
    !(input instanceof TilingScheme) ||
    input.coordinateSystem.crs !== "EPSG:3857" ||
    extent.minimumX !== -halfWidth ||
    extent.minimumY !== -halfWidth ||
    extent.maximumX !== halfWidth ||
    extent.maximumY !== halfWidth
  ) {
    throw new DeveloperError(
      "Globe vector sources require the EPSG:3857 single-root tiling scheme.",
    );
  }
  return input;
}

/** Explicit WebMercator source coordinates and WGS84 surface mapping. @private */
export default {
  radius,
  halfWidth,
  eccentricitySquared,
  latitude,
  cartographic,
  position,
  rectangle,
  scheme,
};
