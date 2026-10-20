import {
  Cartesian3,
  GeoJsonDataSource,
  SceneGISPlanarWorld,
} from "@cesium/engine";

declare const world: SceneGISPlanarWorld;
const projectCoordinates: GeoJsonDataSource.ProjectCoordinates = (
  coordinates: number[],
  crs: object | undefined,
): Cartesian3 => {
  if (crs !== undefined) {
    throw new Error("Expected local coordinates without a CRS override.");
  }
  return new Cartesian3(coordinates[0], coordinates[1], coordinates[2] ?? 0);
};

const planar: GeoJsonDataSource.PlanarOptions = { world, projectCoordinates };
const options: GeoJsonDataSource.LoadOptions = { planar, clampToGround: true };
const loaded: Promise<GeoJsonDataSource> = GeoJsonDataSource.load({}, options);
loaded.then((source) =>
  source.process({ type: "FeatureCollection", features: [] }),
);
