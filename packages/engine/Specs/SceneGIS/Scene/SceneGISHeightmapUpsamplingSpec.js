import {
  GeographicTilingScheme,
  GlobeSurfaceTile,
  HeightmapTerrainData,
  ImageryLayerCollection,
  QuadtreeTile,
  QuadtreeTileLoadState,
  TerrainState,
} from "../../../index.js";
import TerrainTileProcessor from "../../../../../Specs/TerrainTileProcessor.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISHeightmapUpsampling", function () {
  it("advances received ancestors when only missing descendants are scheduled", async function () {
    const tilingScheme = new GeographicTilingScheme();
    const root = QuadtreeTile.createLevelZeroTiles(tilingScheme)[0];
    const imagery = new ImageryLayerCollection();
    const provider = {
      tilingScheme,
      getTileDataAvailable: () => false,
      hasWaterMask: false,
    };
    const frameState = {
      context: { cache: {} },
      verticalExaggeration: 1,
      verticalExaggerationRelativeHeight: 0,
    };
    const processor = new TerrainTileProcessor(frameState, provider, imagery);
    processor.mockWebGL();
    root.state = QuadtreeTileLoadState.LOADING;
    root.data = new GlobeSurfaceTile();
    root.data.terrainState = TerrainState.RECEIVED;
    root.data.terrainData = new HeightmapTerrainData({
      buffer: new Float32Array(25).fill(12),
      width: 5,
      height: 5,
      childTileMask: 0,
    });
    const descendant = root.southwestChild.southwestChild;
    try {
      await pollToPromise(() => {
        GlobeSurfaceTile.processStateMachine(
          descendant,
          frameState,
          provider,
          processor.vectorProvider,
          imagery,
        );
        return descendant.state === QuadtreeTileLoadState.DONE;
      });
      expect(descendant.renderable).toBe(true);
      expect(descendant.data.terrainState).toBe(TerrainState.READY);
      expect(descendant.data.terrainData.wasCreatedByUpsampling()).toBe(true);
      expect(root.data.terrainData._mesh).toBeDefined();
      expect(root.southwestChild.data.terrainData._mesh).toBeDefined();
      const rectangle = descendant.rectangle;
      expect(
        descendant.data.terrainData.interpolateHeight(
          rectangle,
          (rectangle.west + rectangle.east) / 2,
          (rectangle.south + rectangle.north) / 2,
        ),
      ).toEqualEpsilon(12, 0.001);
    } finally {
      root.freeResources();
      imagery.destroy();
    }
  });
});
