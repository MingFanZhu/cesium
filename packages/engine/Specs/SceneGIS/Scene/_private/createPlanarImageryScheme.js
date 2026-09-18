import {
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
} from "../../../../index.js";

export default function createPlanarImageryScheme(crs = "LOCAL:TEST") {
  return new SceneGISPlanarTilingScheme({
    coordinateSystem: new SceneGISPlanarCoordinateSystem({
      crs,
      extent: new SceneGISPlanarExtent({
        minimumX: 1000,
        minimumY: 2000,
        maximumX: 1256,
        maximumY: 2256,
      }),
    }),
  });
}
