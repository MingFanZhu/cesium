import {
  Cartesian3,
  Intersect,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
  SceneGISVectorTileSource,
} from "../../../../index.js";
import cover from "../../../../Source/SceneGIS/Scene/_private/_SceneGISVectorTileCover.js";

describe("SceneGIS/Scene/_private/SceneGISVectorTileCover", function () {
  function source(minimumLevel = 0) {
    return new SceneGISVectorTileSource({
      url: "/{z}/{x}/{y}",
      minimumLevel,
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
  it("bounds high-LOD traversal and coarsens to the source availability without building the full tree", function () {
    const visibility = jasmine
      .createSpy("visibility")
      .and.returnValue(Intersect.INSIDE);
    const frame = { cullingVolume: { computeVisibility: visibility } };
    const selected = cover.select(frame, source(), 22, 4);
    expect(selected.map((tile) => tile.key)).toEqual([
      "1/0/0",
      "1/1/0",
      "1/0/1",
      "1/1/1",
    ]);
    expect(visibility.calls.count()).toBeLessThan(500);
    expect(selected[0].bounds.minimumX).toBe(1000000000);
    expect(() => cover.select(frame, source(2), 22, 4)).toThrowDeveloperError();
    visibility.and.returnValue(Intersect.OUTSIDE);
    expect(cover.select(frame, source(), 22, 4)).toEqual([]);
  });
  it("uses CSS pixels for zoom independently of drawing-buffer resolution", function () {
    const frame = {
      camera: {
        positionWC: new Cartesian3(10, 20, 100),
        getPixelSize: () => 2,
      },
      context: { drawingBufferWidth: 800, drawingBufferHeight: 600 },
      pixelRatio: 1,
    };
    const zoom = cover.computeZoom(frame, 8192);
    frame.context.drawingBufferWidth *= 2;
    frame.context.drawingBufferHeight *= 2;
    frame.camera.getPixelSize = () => 1;
    frame.pixelRatio = 2;
    expect(cover.computeZoom(frame, 8192)).toBe(zoom);
    frame.context.drawingBufferHeight = 0;
    expect(cover.computeZoom(frame, 8192)).toBeUndefined();
  });
});
