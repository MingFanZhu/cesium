import {
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  Event,
  PrimitiveType,
  Ray,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
  SceneTransforms,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import SceneGISPlanarCamera from "../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js";

describe("SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget", function () {
  let container;
  let widget;

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "128px";
    container.style.height = "128px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    document.body.removeChild(container);
  });

  it("uploads and reuses one indexed terrain command in a real Context", async function () {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
      }),
      maximumLevel: 1,
      baseColor: Color.LIME,
    });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-20.0, 20.0, 40.0, 80.0]),
      width: 2,
      height: 2,
    });
    const requestedLevels = [];
    const provider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -20.0,
      maximumHeight: 80.0,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: (level) => 1000.0 / 2 ** level,
      requestTileGeometry: (x, y, level) => {
        requestedLevels.push(level);
        return Promise.resolve(terrainData);
      },
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    world.terrainProvider = provider;
    const image = document.createElement("canvas");
    image.width = 1;
    image.height = 1;
    const imageContext = image.getContext("2d");
    imageContext.fillStyle = "lime";
    imageContext.fillRect(0, 0, 1, 1);
    world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 1,
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: false,
      errorEvent: new Event(),
      credit: undefined,
      requestImage: () => Promise.resolve(image),
    });
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 256.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: new Cartesian3(0.0, 1.0, 0.0),
      },
    });

    widget.scene.initializeFrame();
    widget.scene.render();
    await Promise.resolve();
    let previousPromotions = world._surface._terrain._debug.promotions;
    for (let i = 0; i < 8; ++i) {
      widget.scene.initializeFrame();
      widget.scene.render();
      const promotions = world._surface._terrain._debug.promotions;
      expect(promotions - previousPromotions).toBeLessThanOrEqual(2);
      previousPromotions = promotions;
      await Promise.resolve();
    }
    const tiles = world._surface._quadtree._renderTiles;
    expect(tiles.length).toBe(4);
    expect(
      tiles.every(
        (tile) =>
          tile.command.primitiveType === PrimitiveType.TRIANGLES &&
          tile.command.vertexArray === tile.terrainEntry.vertexArray &&
          tile.imageryBindings.size === 1,
      ),
    ).toBe(true);
    expect(world._surface._renderCommands).toEqual(
      tiles.map((tile) => tile.command),
    );
    expect(world._surface._terrain._indexBuffers.size).toBe(1);
    expect(requestedLevels).toEqual([0]);
    expect(
      tiles.every(
        (tile) =>
          tile.terrainEntry.activeSource ===
          world._surface._terrain.Source.UPSAMPLED,
      ),
    ).toBe(true);
    expect(
      tiles.every(
        (tile) => tile.command.boundingVolume === tile.commandBoundingVolume,
      ),
    ).toBe(true);
    expect(
      tiles.some(
        (tile) =>
          tile.terrainEntry.mesh.skirtMinimumHeight < tile.minimumHeight,
      ),
    ).toBe(true);
    expect(world.tilesLoaded).toBe(true);

    const debug = { ...world._surface._terrain._debug };
    const commands = tiles.map((tile) => tile.command);
    expect(widget.scene).toRenderAndCall(function (rgba) {
      let foundTerrainPixel = false;
      for (let i = 0; i < rgba.length; i += 4) {
        foundTerrainPixel ||= rgba[i] === 0 && rgba[i + 1] > 0;
      }
      expect(foundTerrainPixel).toBe(true);
    });
    expect(tiles.map((tile) => tile.command)).toEqual(commands);
    expect(world._surface._terrain._debug).toEqual(debug);

    const tile = tiles.find(
      (candidate) =>
        candidate.extent.minimumX === -128.0 &&
        candidate.extent.minimumY === 0.0,
    );
    const sampleX = -64.0;
    const sampleY = 64.0;
    const renderedTerrainData = tile.terrainEntry.activeContent.terrainData;
    const sampleHeight = renderedTerrainData.interpolateHeight(
      tile.extent,
      sampleX,
      sampleY,
    );
    expect(sampleHeight).toBe(5.0);
    const windowPosition = SceneTransforms.worldToWindowCoordinates(
      widget.scene,
      new Cartesian3(sampleX, sampleY, sampleHeight),
      new Cartesian2(),
    );
    const renderedPosition = widget.scene.pickPosition(windowPosition);
    expect(renderedPosition).toBeDefined();
    expect(renderedPosition.x).toBeCloseTo(sampleX, 0);
    expect(renderedPosition.y).toBeCloseTo(sampleY, 0);
    expect(renderedPosition.z).toBeCloseTo(
      renderedTerrainData.interpolateHeight(
        tile.extent,
        renderedPosition.x,
        renderedPosition.y,
      ),
      0,
    );

    const queryDebug = { ...world._surface._terrain._debug };
    expect(
      world.getTerrainHeight(new Cartesian3(sampleX, sampleY, 12345.0)),
    ).toBeCloseTo(sampleHeight, 6);
    const terrainWindowPosition = world.pickTerrainFromWindowPosition(
      windowPosition,
      widget.scene,
      new Cartesian3(),
    );
    expect(terrainWindowPosition).toBeDefined();
    expect(terrainWindowPosition.x).toBeCloseTo(renderedPosition.x, 0);
    expect(terrainWindowPosition.y).toBeCloseTo(renderedPosition.y, 0);
    expect(terrainWindowPosition.z).toBeCloseTo(renderedPosition.z, 0);
    expect(world._surface._terrain._debug).toEqual(queryDebug);

    const ray = SceneGISPlanarCamera.getWindowRay(
      widget.scene.camera,
      widget.scene.canvas,
      windowPosition,
      new Ray(),
    );
    const referencePosition = world.pick(ray, new Cartesian3());
    expect(referencePosition).toBeDefined();
    expect(referencePosition.z).toBe(0.0);
    expect(world.pickTerrain(ray, new Cartesian3())).toEqual(
      terrainWindowPosition,
    );

    const terrain = world._surface._terrain;
    widget = widget.destroy();
    expect(terrain._debug.destroyedVertexArrays).toBe(
      terrain._debug.createdVertexArrays,
    );
    expect(terrain._debug.destroyedIndexBuffers).toBe(
      terrain._debug.createdIndexBuffers,
    );
    expect(terrain._debug.releasedIndexReferences).toBe(
      terrain._debug.acquiredIndexReferences,
    );
    expect(terrain._debug.destroyedVertexBuffers).toBe(
      terrain._debug.createdVertexBuffers,
    );
  });
});
