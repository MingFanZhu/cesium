import {
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  DirectionalLight,
  Event,
  PrimitiveType,
  Ray,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider,
  SceneGISPlanarWorld,
  SceneTransforms,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";
import SceneGISPlanarCamera from "../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js";

function samplePixelNeighborhood(scene, rgba, position) {
  const windowPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    position,
    new Cartesian2(),
  );
  const width = scene.drawingBufferWidth;
  const height = scene.drawingBufferHeight;
  const centerX = Math.floor(windowPosition.x);
  const centerY = height - 1 - Math.floor(windowPosition.y);
  const total = [0, 0, 0, 0];
  let count = 0;
  for (let y = centerY - 1; y <= centerY + 1; ++y) {
    for (let x = centerX - 1; x <= centerX + 1; ++x) {
      if (x < 0 || x >= width || y < 0 || y >= height) {
        continue;
      }
      const offset = (y * width + x) * 4;
      for (let component = 0; component < 4; ++component) {
        total[component] += rgba[offset + component];
      }
      ++count;
    }
  }
  return total.map((value) => value / count);
}

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

    let previousPromotions = world._surface._terrain._debug.promotions;
    let previousTaskStarts = world._surface._terrain._debug.startedMeshTasks;
    await pollToPromise(function () {
      widget.scene.initializeFrame();
      widget.scene.render();
      const promotions = world._surface._terrain._debug.promotions;
      const taskStarts = world._surface._terrain._debug.startedMeshTasks;
      expect(promotions - previousPromotions).toBeLessThanOrEqual(2);
      expect(taskStarts - previousTaskStarts).toBeLessThanOrEqual(2);
      previousPromotions = promotions;
      previousTaskStarts = taskStarts;
      return (
        world._surface._quadtree._renderTiles.length === 4 && world.tilesLoaded
      );
    });
    const tiles = world._surface._quadtree._renderTiles;
    expect(world._surface._terrain._debug.startedMeshTasks).toBeGreaterThan(0);
    expect(world._surface._terrain._debug.completedMeshTasks).toBe(
      world._surface._terrain._debug.startedMeshTasks,
    );
    expect(tiles.length).toBe(4);
    expect(
      tiles.every(
        (tile) =>
          tile.command.primitiveType === PrimitiveType.TRIANGLES &&
          tile.command.vertexArray === tile.terrainEntry.vertexArray &&
          tile.command.vertexArray.numberOfAttributes === 2 &&
          tile.terrainEntry.mesh.octEncodedNormals.byteLength ===
            tile.terrainEntry.mesh.vertexCount * 2 &&
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

    let unlitPixels;
    expect(widget.scene).toRenderAndCall(function (rgba) {
      unlitPixels = Array.from(rgba);
    });
    const surface = world._surface;
    const commandsBeforeLighting = tiles.map((tile) => tile.command);
    expect(
      tiles.every((tile) => tile._lightingCommandNormalMode === "unlit"),
    ).toBe(true);
    const surfaceAllocationsBeforeLighting = {
      buffers: surface._debug.createdBuffers,
      vertexArrays: surface._debug.createdVertexArrays,
      textures: surface._debug.createdTextures,
      commands: surface._debug.createdCommands,
    };
    const terrainAllocationsBeforeLighting = { ...surface._terrain._debug };
    widget.scene.light = new DirectionalLight({
      direction: Cartesian3.UNIT_X,
    });
    world.enableLighting = true;
    let litPixels;
    let aboveLitSample;
    expect(widget.scene).toRenderAndCall(function (rgba) {
      litPixels = Array.from(rgba);
      aboveLitSample = samplePixelNeighborhood(
        widget.scene,
        rgba,
        new Cartesian3(-64.0, 64.0, 5.0),
      );
    });
    expect(litPixels).not.toEqual(unlitPixels);
    expect(litPixels.every(Number.isFinite)).toBe(true);
    expect(
      tiles.every((tile) => tile._lightingCommandNormalMode === "smooth"),
    ).toBe(true);
    expect(surface._shaderPrograms.has("1/1/smooth")).toBe(true);
    expect(tiles.map((tile) => tile.command)).toEqual(commandsBeforeLighting);
    expect(surface._debug.createdBuffers).toBe(
      surfaceAllocationsBeforeLighting.buffers,
    );
    expect(surface._debug.createdVertexArrays).toBe(
      surfaceAllocationsBeforeLighting.vertexArrays,
    );
    expect(surface._debug.createdTextures).toBe(
      surfaceAllocationsBeforeLighting.textures,
    );
    expect(surface._debug.createdCommands).toBe(
      surfaceAllocationsBeforeLighting.commands,
    );
    expect(surface._terrain._debug).toEqual(terrainAllocationsBeforeLighting);

    const litShaderCount = surface._debug.createdShaders;
    const litShaderPrograms = tiles.map((tile) => tile.command.shaderProgram);
    const litUniformMaps = tiles.map((tile) => tile.command.uniformMap);
    expect(widget.scene).toRenderAndCall(function (rgba) {
      expect(Array.from(rgba)).toEqual(litPixels);
    });
    expect(tiles.map((tile) => tile.command)).toEqual(commandsBeforeLighting);
    expect(tiles.map((tile) => tile.command.shaderProgram)).toEqual(
      litShaderPrograms,
    );
    expect(tiles.map((tile) => tile.command.uniformMap)).toEqual(
      litUniformMaps,
    );
    expect(surface._debug.createdShaders).toBe(litShaderCount);
    expect(surface._terrain._debug).toEqual(terrainAllocationsBeforeLighting);

    world.lambertDiffuseMultiplier = 0.0;
    let ambientPixels;
    expect(widget.scene).toRenderAndCall(function (rgba) {
      ambientPixels = Array.from(rgba);
    });
    expect(ambientPixels).not.toEqual(litPixels);
    expect(surface._debug.createdShaders).toBe(litShaderCount);
    expect(tiles.map((tile) => tile.command)).toEqual(commandsBeforeLighting);
    world.lambertDiffuseMultiplier = 0.9;

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

    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, -256.0),
      orientation: {
        direction: Cartesian3.UNIT_Z,
        up: Cartesian3.UNIT_Y,
      },
    });
    expect(widget.scene).toRenderAndCall(function (rgba) {
      expect(rgba).not.toEqual([0, 0, 0, 255]);
      expect(Array.from(rgba).every(Number.isFinite)).toBe(true);
      const belowLitSample = samplePixelNeighborhood(
        widget.scene,
        rgba,
        new Cartesian3(-64.0, 64.0, 5.0),
      );
      for (let component = 0; component < 4; ++component) {
        expect(
          Math.abs(belowLitSample[component] - aboveLitSample[component]),
        ).toBeLessThanOrEqual(8.0);
      }
    });
    expect(tiles.map((candidate) => candidate.command)).toEqual(commands);
    expect(tiles.map((candidate) => candidate.command.shaderProgram)).toEqual(
      litShaderPrograms,
    );
    expect(world._surface._terrain._debug).toEqual(debug);

    const terrain = world._surface._terrain;
    expect(terrain._debug.createdVertexBuffers).toBe(
      terrain._debug.createdVertexArrays * 2,
    );
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

  it("renders quantized terrain with imagery, resident queries, and owned indices", async function () {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -20037508.342789244,
          minimumY: -20037508.342789244,
          maximumX: 20037508.342789244,
          maximumY: 20037508.342789244,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.LIME,
    });
    world.terrainProvider =
      new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider({
        url: "./Data/CesiumTerrainTileJson/QuantizedMesh/tile.terrain",
        tilingScheme: world.tilingScheme,
        minimumHeight: -1000.0,
        maximumHeight: 10000.0,
        maximumLevel: 0,
        levelZeroMaximumGeometricError: 1000.0,
        subdomains: "a",
      });
    const image = document.createElement("canvas");
    image.width = 1;
    image.height = 1;
    const imageContext = image.getContext("2d");
    imageContext.fillStyle = "lime";
    imageContext.fillRect(0, 0, 1, 1);
    world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
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
      destination: new Cartesian3(0.0, 0.0, 45000000.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: new Cartesian3(0.0, 1.0, 0.0),
      },
    });

    await pollToPromise(function () {
      widget.scene.initializeFrame();
      widget.scene.render();
      return world.tilesLoaded;
    });
    const tile = world._surface._quadtree._renderTiles[0];
    const terrain = world._surface._terrain;
    expect(tile.terrainEntry.activeSource).toBe(terrain.Source.DIRECT);
    expect(tile.terrainEntry.activeContent.ownsIndexBuffer).toBe(true);
    expect(tile.command.vertexArray.numberOfAttributes).toBe(2);
    expect(tile.terrainEntry.mesh.octEncodedNormals.byteLength).toBe(
      tile.terrainEntry.mesh.vertexCount * 2,
    );
    expect(terrain._indexBuffers.size).toBe(0);
    expect(tile.imageryBindings.size).toBe(1);
    expect(world._surface._renderCommands).toEqual([tile.command]);
    let unlitPixels;
    expect(widget.scene).toRenderAndCall(function (rgba) {
      unlitPixels = Array.from(rgba);
      expect(unlitPixels).not.toEqual([0, 0, 0, 255]);
    });

    const commands = world._surface._renderCommands.slice();
    const vertexArrays = commands.map((command) => command.vertexArray);
    const debug = { ...terrain._debug };
    widget.scene.light = new DirectionalLight({
      direction: Cartesian3.UNIT_X,
    });
    world.enableLighting = true;
    let litPixels;
    expect(widget.scene).toRenderAndCall(function (rgba) {
      litPixels = Array.from(rgba);
    });
    expect(litPixels.every(Number.isFinite)).toBe(true);
    expect(litPixels).not.toEqual(unlitPixels);
    expect(tile._lightingCommandNormalMode).toBe("smooth");
    expect(world._surface._shaderPrograms.has("1/1/smooth")).toBe(true);
    expect(world._surface._renderCommands).toEqual(commands);
    expect(commands.map((command) => command.vertexArray)).toEqual(
      vertexArrays,
    );
    expect(terrain._debug).toEqual(debug);
    const litShaders = commands.map((command) => command.shaderProgram);
    expect(widget.scene).toRenderAndCall(function (rgba) {
      expect(Array.from(rgba)).toEqual(litPixels);
    });
    expect(world._surface._renderCommands).toEqual(commands);
    expect(commands.map((command) => command.vertexArray)).toEqual(
      vertexArrays,
    );
    expect(commands.map((command) => command.shaderProgram)).toEqual(
      litShaders,
    );
    expect(terrain._debug).toEqual(debug);

    const height = world.getTerrainHeight(new Cartesian3(0.0, 0.0, 0.0));
    expect(height).toBeDefined();
    expect(Number.isFinite(height)).toBe(true);
    const windowPosition = SceneTransforms.worldToWindowCoordinates(
      widget.scene,
      new Cartesian3(0.0, 0.0, height),
      new Cartesian2(),
    );
    const depthPosition = widget.scene.pickPosition(windowPosition);
    const terrainPosition = world.pickTerrainFromWindowPosition(
      windowPosition,
      widget.scene,
      new Cartesian3(),
    );
    expect(depthPosition).toBeDefined();
    expect(terrainPosition).toBeDefined();
    const depthHeight = world.getTerrainHeight(depthPosition);
    expect(depthHeight).toBeDefined();
    expect(Math.abs(depthPosition.z - depthHeight)).toBeLessThan(50.0);
    expect(terrainPosition.x).toBeCloseTo(depthPosition.x, -1);
    expect(terrainPosition.y).toBeCloseTo(depthPosition.y, -1);
    expect(terrainPosition.z).toBeCloseTo(depthHeight, 5);
    expect(Math.abs(terrainPosition.z - depthPosition.z)).toBeLessThan(50.0);
    expect(world._surface._renderCommands).toEqual(commands);
    expect(terrain._debug).toEqual(debug);

    const createdOwnedIndices = terrain._debug.createdOwnedIndexBuffers;
    expect(terrain._debug.createdVertexBuffers).toBe(
      terrain._debug.createdVertexArrays * 2,
    );
    widget = widget.destroy();
    expect(terrain._debug.destroyedOwnedIndexBuffers).toBe(createdOwnedIndices);
    expect(terrain._debug.destroyedIndexBuffers).toBe(
      terrain._debug.createdIndexBuffers,
    );
    expect(terrain._debug.destroyedVertexArrays).toBe(
      terrain._debug.createdVertexArrays,
    );
    expect(terrain._debug.destroyedVertexBuffers).toBe(
      terrain._debug.createdVertexBuffers,
    );
  });
});
