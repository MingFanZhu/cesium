import {
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  DirectionalLight,
  Event,
  JulianDate,
  Ray,
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarUrlTemplateHeightmapTerrainProvider,
  SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider,
  SceneGISPlanarWorld,
  SceneTransforms,
} from "../../../index.js";
import CameraEventType from "../../../Source/Scene/CameraEventType.js";
import SceneGISPlanarCamera from "../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Widget/SceneGISPlanarTerrainAdvancedQualification", function () {
  let container;
  let widget;
  let controller;
  let inputSequence;

  function queueMovement(type, start, end) {
    const aggregator = controller._aggregator;
    const key = `${type}`;
    if (type !== CameraEventType.WHEEL && !aggregator._isDown[key]) {
      aggregator._isDown[key] = true;
      aggregator._buttonsDown++;
      aggregator._pressTime[key] = new Date(++inputSequence);
      Cartesian2.clone(start, aggregator._eventStartPosition[key]);
    }
    Cartesian2.clone(
      type === CameraEventType.WHEEL ? Cartesian2.ZERO : start,
      aggregator._movement[key].startPosition,
    );
    Cartesian2.clone(end, aggregator._movement[key].endPosition);
    aggregator._update[key] = false;
    Cartesian2.clone(start, aggregator._currentMousePosition);
  }

  function releaseButton(type) {
    const aggregator = controller._aggregator;
    const key = `${type}`;
    aggregator._isDown[key] = false;
    aggregator._buttonsDown--;
    aggregator._releaseTime[key] = new Date(++inputSequence);
  }

  function renderFrame(scene) {
    scene.initializeFrame();
    scene.render();
  }

  async function waitForTerrain(scene, world) {
    let previousTaskStarts = world._surface._terrain._debug.startedMeshTasks;
    let previousPromotions = world._surface._terrain._debug.promotions;
    await pollToPromise(
      function () {
        renderFrame(scene);
        const terrainDebug = world._surface._terrain._debug;
        expect(
          terrainDebug.startedMeshTasks - previousTaskStarts,
        ).toBeLessThanOrEqual(2);
        expect(
          terrainDebug.promotions - previousPromotions,
        ).toBeLessThanOrEqual(2);
        previousTaskStarts = terrainDebug.startedMeshTasks;
        previousPromotions = terrainDebug.promotions;
        return world.tilesLoaded && world._surface._renderCommands.length > 0;
      },
      { timeout: 30000 },
    );
  }

  async function verifyWarmFrames(scene, world, count) {
    const surface = world._surface;
    const terrain = surface._terrain;
    const commands = surface._renderCommands.slice();
    const vertexArrays = commands.map((command) => command.vertexArray);
    const shaders = commands.map((command) => command.shaderProgram);
    const terrainDebug = { ...terrain._debug };
    const surfaceAllocations = {
      buffers: surface._debug.createdBuffers,
      vertexArrays: surface._debug.createdVertexArrays,
      textures: surface._debug.createdTextures,
      commands: surface._debug.createdCommands,
      shaders: surface._debug.createdShaders,
    };
    const timings = [];
    for (let i = 0; i < count; ++i) {
      const start = performance.now();
      renderFrame(scene);
      timings.push(performance.now() - start);
      await Promise.resolve();
      expect(world.tilesLoaded).toBe(true);
      expect(surface._renderCommands).toEqual(commands);
      expect(commands.map((command) => command.vertexArray)).toEqual(
        vertexArrays,
      );
      expect(commands.map((command) => command.shaderProgram)).toEqual(shaders);
      expect(terrain._debug).toEqual(terrainDebug);
      expect({
        buffers: surface._debug.createdBuffers,
        vertexArrays: surface._debug.createdVertexArrays,
        textures: surface._debug.createdTextures,
        commands: surface._debug.createdCommands,
        shaders: surface._debug.createdShaders,
      }).toEqual(surfaceAllocations);
    }
    timings.sort((left, right) => left - right);
    return {
      median: timings[Math.floor(timings.length * 0.5)],
      p95: timings[Math.floor(timings.length * 0.95)],
    };
  }

  function countIsolatedLightingOutliers(rgba, width, height) {
    let count = 0;
    for (let y = 2; y < height - 2; ++y) {
      for (let x = 2; x < width - 2; ++x) {
        const offset = (y * width + x) * 4;
        const neighbors = [
          rgba[offset - width * 4 + 1],
          rgba[offset - 4 + 1],
          rgba[offset + 4 + 1],
          rgba[offset + width * 4 + 1],
        ].sort((left, right) => left - right);
        const median = (neighbors[1] + neighbors[2]) * 0.5;
        if (Math.abs(rgba[offset + 1] - median) > 48) {
          ++count;
        }
      }
    }
    return count;
  }

  beforeEach(function () {
    inputSequence = 0;
    container = document.createElement("div");
    container.style.width = "128px";
    container.style.height = "128px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      if (controller && controller._aggregator) {
        widget.removeController(controller);
      }
      widget = widget.destroy();
    }
    document.body.removeChild(container);
  });

  it("qualifies local worker terrain, navigation, lighting, replacement, and lifecycle", async function () {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -20037508.342789244,
          minimumY: -20037508.342789244,
          maximumX: 20037508.342789244,
          maximumY: 20037508.342789244,
        }),
        crs: "EPSG:3857",
      }),
      maximumLevel: 0,
      baseColor: Color.DARKGREEN,
    });
    const heightmapProvider =
      new SceneGISPlanarUrlTemplateHeightmapTerrainProvider({
        url: "./Data/ArcGIS/9_214_379/tile_9_214_379.tile",
        tilingScheme: world.tilingScheme,
        maximumLevel: 0,
        heightmapWidth: 257,
        heightmapHeight: 257,
        minimumHeight: -1000.0,
        maximumHeight: 9000.0,
        format: "lerc",
        levelZeroMaximumGeometricError: 1000.0,
      });
    world.terrainProvider = heightmapProvider;

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
    const scene = widget.scene;
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 45000000.0),
      orientation: {
        direction: Cartesian3.negate(Cartesian3.UNIT_Z, new Cartesian3()),
        up: Cartesian3.UNIT_Y,
      },
    });

    await waitForTerrain(scene, world);
    const terrain = world._surface._terrain;
    expect(terrain._debug.startedMeshTasks).toBeGreaterThan(0);
    expect(terrain._debug.completedMeshTasks).toBe(
      terrain._debug.startedMeshTasks,
    );
    expect(world._surface._quadtree._renderTiles.length).toBe(1);
    expect(
      world._surface._quadtree._renderTiles.every(
        (tile) =>
          tile.terrainEntry.mesh.octEncodedNormals.byteLength ===
            tile.terrainEntry.mesh.vertexCount * 2 &&
          tile.imageryBindings.size === 1,
      ),
    ).toBe(true);

    let unlitPixels;
    expect(scene).toRenderAndCall(function (rgba) {
      unlitPixels = Array.from(rgba);
      expect(unlitPixels).not.toEqual([0, 0, 0, 255]);
    });
    scene.light = new DirectionalLight({ direction: Cartesian3.UNIT_X });
    world.enableLighting = true;
    let litPixels;
    expect(scene).toRenderAndCall(function (rgba) {
      litPixels = Array.from(rgba);
    });
    expect(litPixels).not.toEqual(unlitPixels);
    expect(
      countIsolatedLightingOutliers(
        litPixels,
        scene.drawingBufferWidth,
        scene.drawingBufferHeight,
      ),
    ).toBeLessThanOrEqual(8);
    expect(
      world._surface._quadtree._renderTiles.every(
        (tile) => tile._lightingCommandNormalMode === "smooth",
      ),
    ).toBe(true);

    const centerHeight = world.getTerrainHeight(Cartesian3.ZERO);
    expect(centerHeight).toBeDefined();
    const centerPosition = new Cartesian3(0.0, 0.0, centerHeight);
    const centerWindow = SceneTransforms.worldToWindowCoordinates(
      scene,
      centerPosition,
      new Cartesian2(),
    );
    const terrainPick = world.pickTerrainFromWindowPosition(
      centerWindow,
      scene,
      new Cartesian3(),
    );
    expect(terrainPick).toBeDefined();
    expect(terrainPick.z).toEqualEpsilon(centerHeight, 1e-3);
    const ray = SceneGISPlanarCamera.getWindowRay(
      scene.camera,
      scene.canvas,
      centerWindow,
      new Ray(),
    );
    expect(world.pick(ray, new Cartesian3()).z).toBe(0.0);
    if (scene.pickPositionSupported && !window.webglStub) {
      const depthPosition = scene.pickPosition(centerWindow, new Cartesian3());
      expect(depthPosition).toBeDefined();
      const depthHeight = world.getTerrainHeight(depthPosition);
      expect(depthHeight).toBeDefined();
      expect(Math.abs(depthPosition.z - depthHeight)).toBeLessThan(50.0);
    }

    scene.screenSpaceCameraController.enableInputs = false;
    controller = new SceneGISPlanarCameraController({
      world,
      minimumTerrainClearance: 3.0,
    });
    widget.addController(controller);
    controller.firstUpdate(scene, JulianDate.now());
    spyOn(controller, "viewHome").and.callThrough();
    const canvasCenter = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );

    const churn = [
      () => {
        queueMovement(
          CameraEventType.LEFT_DRAG,
          canvasCenter,
          new Cartesian2(canvasCenter.x + 3.0, canvasCenter.y + 2.0),
        );
        controller.update(scene, JulianDate.now());
        releaseButton(CameraEventType.LEFT_DRAG);
        controller.update(scene, JulianDate.now());
      },
      () => {
        queueMovement(
          CameraEventType.MIDDLE_DRAG,
          canvasCenter,
          new Cartesian2(canvasCenter.x + 4.0, canvasCenter.y + 3.0),
        );
        controller.update(scene, JulianDate.now());
        releaseButton(CameraEventType.MIDDLE_DRAG);
        controller.update(scene, JulianDate.now());
      },
      () => {
        queueMovement(
          CameraEventType.WHEEL,
          canvasCenter,
          new Cartesian2(0.0, 12.0),
        );
        controller.update(scene, JulianDate.now());
        world.enableLighting = false;
        renderFrame(scene);
        world.enableLighting = true;
      },
    ];
    for (const applyChurn of churn) {
      applyChurn();
      await waitForTerrain(scene, world);
      const localSurfaceHeight =
        world.getTerrainHeight(scene.camera.positionWC) ?? 0.0;
      expect(scene.camera.positionWC.z).toBeGreaterThanOrEqual(
        localSurfaceHeight + controller.minimumTerrainClearance - 1e-5,
      );
      expect(controller.viewHome).not.toHaveBeenCalled();
    }

    const heightmapTiming = await verifyWarmFrames(scene, world, 30);
    expect(Number.isFinite(heightmapTiming.median)).toBe(true);
    expect(Number.isFinite(heightmapTiming.p95)).toBe(true);

    const surfaceHeight = world.getTerrainHeight(Cartesian3.ZERO);
    controller.navigationMode = "underground";
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, surfaceHeight - 256.0),
      orientation: {
        direction: Cartesian3.UNIT_Z,
        up: Cartesian3.UNIT_Y,
      },
    });
    controller.update(scene, JulianDate.now());
    queueMovement(
      CameraEventType.MIDDLE_DRAG,
      canvasCenter,
      new Cartesian2(canvasCenter.x + 3.0, canvasCenter.y - 3.0),
    );
    controller.update(scene, JulianDate.now());
    const crossingPivot = Cartesian3.clone(controller._rotatePivot);
    const crossingStart = new Cartesian2(
      canvasCenter.x + 3.0,
      canvasCenter.y - 3.0,
    );
    const crossingEnd = new Cartesian2(crossingStart.x, crossingStart.y + 80.0);
    queueMovement(CameraEventType.MIDDLE_DRAG, crossingStart, crossingEnd);
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeGreaterThan(crossingPivot.z);
    queueMovement(
      CameraEventType.MIDDLE_DRAG,
      crossingEnd,
      new Cartesian2(crossingEnd.x, crossingEnd.y - 80.0),
    );
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeLessThan(crossingPivot.z);
    releaseButton(CameraEventType.MIDDLE_DRAG);
    controller.update(scene, JulianDate.now());
    expect(controller.navigationMode).toBe("underground");
    expect(controller.viewHome).not.toHaveBeenCalled();

    controller.navigationMode = "surface";
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 45000000.0),
      orientation: {
        direction: Cartesian3.negate(Cartesian3.UNIT_Z, new Cartesian3()),
        up: Cartesian3.UNIT_Y,
      },
    });
    controller.update(scene, JulianDate.now());
    const oldVertexArrays = world._surface._renderCommands.map(
      (command) => command.vertexArray,
    );
    const quantizedProvider =
      new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider({
        url: "./Data/CesiumTerrainTileJson/QuantizedMesh/tile.terrain",
        tilingScheme: world.tilingScheme,
        minimumHeight: -1000.0,
        maximumHeight: 10000.0,
        maximumLevel: 0,
        levelZeroMaximumGeometricError: 1000.0,
      });
    world.terrainProvider = quantizedProvider;
    expect(world.tilesLoaded).toBe(false);
    await waitForTerrain(scene, world);
    expect(world.terrainProvider).toBe(quantizedProvider);
    expect(
      world._surface._quadtree._renderTiles.every(
        (tile) =>
          tile.terrainEntry.mesh.octEncodedNormals.byteLength ===
            tile.terrainEntry.mesh.vertexCount * 2 &&
          tile.terrainEntry.activeContent.ownsIndexBuffer,
      ),
    ).toBe(true);
    expect(
      world._surface._renderCommands.some(
        (command) => oldVertexArrays.indexOf(command.vertexArray) !== -1,
      ),
    ).toBe(false);
    expect(terrain._debug.destroyedVertexArrays).toBeGreaterThan(0);
    expect(terrain._debug.startedUpsampleTasks).toBe(0);

    const quantizedTiming = await verifyWarmFrames(scene, world, 30);
    expect(Number.isFinite(quantizedTiming.median)).toBe(true);
    expect(Number.isFinite(quantizedTiming.p95)).toBe(true);
    expect(world._surface._renderCommands.length).toBe(
      world._surface._quadtree._renderTiles.length,
    );

    widget.removeController(controller);
    controller = undefined;
    widget = widget.destroy();
    expect(terrain._debug.destroyedVertexArrays).toBe(
      terrain._debug.createdVertexArrays,
    );
    expect(terrain._debug.destroyedVertexBuffers).toBe(
      terrain._debug.createdVertexBuffers,
    );
    expect(terrain._debug.destroyedIndexBuffers).toBe(
      terrain._debug.createdIndexBuffers,
    );
    expect(terrain._debug.releasedIndexReferences).toBe(
      terrain._debug.acquiredIndexReferences,
    );
    expect(terrain._debug.destroyedOwnedIndexBuffers).toBe(
      terrain._debug.createdOwnedIndexBuffers,
    );
    expect(heightmapProvider.tilingScheme).toBe(world.tilingScheme);
    expect(quantizedProvider.tilingScheme).toBe(world.tilingScheme);
  });
});
