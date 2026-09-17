import {
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
  SceneGISVectorTileCoordinates,
  SceneGISVectorTileStyle,
} from "../../../../index.js";
import geometry from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorTileGeometry.js";

describe("SceneGIS/Core/_private/SceneGISVectorTileGeometry", function () {
  const coordinates = new SceneGISVectorTileCoordinates({
    tilingScheme: new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        crs: "local-metres",
        extent: new SceneGISPlanarExtent({
          minimumX: 1000000000,
          minimumY: 2000000000,
          maximumX: 1000004096,
          maximumY: 2000004096,
        }),
      }),
    }),
    x: 0,
    y: 0,
    level: 0,
    extent: 4096,
  });
  function prepare(type, feature) {
    const definition = { id: type, type, source: "s", "source-layer": "data" };
    const style = new SceneGISVectorTileStyle({
      version: 8,
      sources: { s: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
      layers: [definition],
    });
    return geometry.build(
      { name: "data", features: [feature] },
      definition,
      style,
      coordinates,
      1,
      { x: 0, y: 0, level: 0 },
    );
  }
  it("triangulates multiple polygons and holes without changing buffered source coordinates", function () {
    const feature = {
      type: 3,
      properties: {},
      geometry: {
        parts: [
          [-10, -10, 10, -10, 10, 10, -10, 10],
          [-5, -5, -5, 5, 5, 5, 5, -5],
          [20, 20, 30, 20, 30, 30, 20, 30],
        ].map((part) => new Float64Array(part)),
        polygonStarts: new Uint32Array([0, 2]),
      },
    };
    const before = feature.geometry.parts.map((part) => Array.from(part));
    const result = prepare("fill", feature)[0].instances[0];
    const positions = result.geometry.attributes.position.values;
    const indices = result.geometry.indices;
    let area = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i + 1] * 3;
      const c = indices[i + 2] * 3;
      area +=
        Math.abs(
          (positions[b] - positions[a]) *
            (positions[c + 1] - positions[a + 1]) -
            (positions[c] - positions[a]) *
              (positions[b + 1] - positions[a + 1]),
        ) / 2;
    }
    expect(area).toBe(400);
    expect(positions[0]).toBe(-10);
    expect(positions[1]).toBe(10);
    expect(feature.geometry.parts.map((part) => Array.from(part))).toEqual(
      before,
    );
    expect(result.id.featureId).toBeUndefined();
    expect(Object.isFrozen(result.id.tile)).toBeTrue();
  });
  it("keeps multipart line identity while preparing a single style batch", function () {
    const feature = {
      id: "42",
      type: 2,
      properties: { name: "roads" },
      geometry: {
        parts: [
          [0, 0, 0, 0],
          [0, 0, 10, 10],
          [20, 20, 30, 30],
        ].map((part) => new Float64Array(part)),
        polygonStarts: new Uint32Array(),
      },
    };
    const groups = prepare("line", feature);
    expect(groups.length).toBe(1);
    expect(groups[0].instances.length).toBe(2);
    expect(groups[0].instances[0].id).toBe(groups[0].instances[1].id);
  });
});
