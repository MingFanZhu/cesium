import {
  Cartesian3,
  Intersect,
  OrthographicFrustum,
  PerspectiveFrustum,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
  SceneGISVectorTileSource,
} from "../../../../index.js";
import cover from "../../../../Source/SceneGIS/Scene/_private/_SceneGISVectorTileCover.js";
import PlanarQuadtree from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarQuadtree.js";

describe("SceneGIS/Scene/_private/SceneGISVectorTileCover", function () {
  function source(minimumLevel = 0, maximumLevel = 22) {
    return new SceneGISVectorTileSource({
      url: "/{z}/{x}/{y}",
      minimumLevel,
      maximumLevel,
      tilingScheme: new SceneGISPlanarTilingScheme({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          crs: "local-metres",
          extent: new SceneGISPlanarExtent({
            minimumX: 1000000000,
            minimumY: 1000000000,
            maximumX: 1000001024,
            maximumY: 1000001024,
          }),
        }),
      }),
    });
  }
  it("uses the imagery/terrain leaf criterion without mutating its quadtree", function () {
    const tiles = source(0, 4);
    const frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 1,
      far: 4000,
    });
    const position = new Cartesian3(1000000512, 1000000400, 100);
    const direction = Cartesian3.normalize(
      new Cartesian3(0, 1, -0.2),
      new Cartesian3(),
    );
    const up = Cartesian3.normalize(
      new Cartesian3(0, 0.2, 1),
      new Cartesian3(),
    );
    const frame = {
      camera: { positionWC: position, frustum },
      context: { drawingBufferWidth: 256, drawingBufferHeight: 256 },
      pixelRatio: 1,
      cullingVolume: frustum.computeCullingVolume(position, direction, up),
    };
    const quadtree = new PlanarQuadtree(tiles.tilingScheme);
    try {
      quadtree.beginFrame(1);
      const keys = quadtree
        .selectTiles(frame, 4, 2, [2, 1, 0.5, 0.25, 0.125])
        .map((tile) => tile.key)
        .sort();
      const debug = { ...quadtree._debug };
      expect(
        cover
          .select(frame, tiles, 128)
          .map((tile) => tile.key)
          .sort(),
      ).toEqual(keys);
      expect(quadtree._debug).toEqual(debug);
      frame.pixelRatio = 2;
      frame.context.drawingBufferHeight *= 2;
      frame.context.drawingBufferWidth *= 2;
      expect(
        cover
          .select(frame, tiles, 128)
          .map((tile) => tile.key)
          .sort(),
      ).toEqual(keys);
    } finally {
      quadtree.destroy();
    }
  });
  it("bounds high-LOD traversal and coarsens to the source availability without building the full tree", function () {
    const visibility = jasmine
      .createSpy("visibility")
      .and.returnValue(Intersect.INSIDE);
    const frame = {
      camera: {
        frustum: new OrthographicFrustum({ width: 1, aspectRatio: 1 }),
      },
      context: { drawingBufferHeight: 512 },
      pixelRatio: 1,
      cullingVolume: { computeVisibility: visibility },
    };
    const selected = cover.select(frame, source(), 4);
    expect(selected.map((tile) => tile.key)).toEqual([
      "1/0/0",
      "1/1/0",
      "1/0/1",
      "1/1/1",
    ]);
    expect(visibility.calls.count()).toBeLessThan(500);
    expect(selected[0].bounds.minimumX).toBe(1000000000);
    expect(() => cover.select(frame, source(2), 4)).toThrowDeveloperError();
    visibility.and.returnValue(Intersect.OUTSIDE);
    expect(cover.select(frame, source(), 4)).toEqual([]);
  });
  it("uses CSS pixels for zoom independently of drawing-buffer resolution", function () {
    const frame = {
      camera: {
        positionWC: new Cartesian3(10, 20, 100),
        directionWC: new Cartesian3(0, 0, -1),
        getPixelSize: () => 2,
      },
      context: { drawingBufferWidth: 800, drawingBufferHeight: 600 },
      pixelRatio: 1,
    };
    const zoom = cover.computeZoom(frame, 8192);
    frame.context.drawingBufferWidth *= 2;
    frame.context.drawingBufferHeight *= 2;
    // Camera.getPixelSize already applies scene.pixelRatio.
    frame.camera.getPixelSize = () => 2;
    frame.pixelRatio = 2;
    expect(cover.computeZoom(frame, 8192)).toBe(zoom);
    frame.context.drawingBufferHeight = 0;
    expect(cover.computeZoom(frame, 8192)).toBeUndefined();
  });
});
