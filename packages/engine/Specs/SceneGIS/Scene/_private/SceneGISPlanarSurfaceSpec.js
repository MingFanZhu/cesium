import {
  Cartesian3,
  Cartesian2,
  Color,
  ColorGeometryInstanceAttribute,
  DirectionalLight,
  Event,
  Intersect,
  HeightReference,
  Material,
  OrthographicFrustum,
  PerspectiveFrustum,
  PerInstanceColorAppearance,
  PolylineMaterialAppearance,
  PrimitiveType,
  Scene,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarGroundPrimitive,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarPolylineGeometry,
  SceneGISPlanarWorld,
} from "../../../../index.js";
import createCanvas from "../../../../../../Specs/createCanvas.js";
import getWebGLStub from "../../../../../../Specs/getWebGLStub.js";

describe("SceneGIS/Scene/SceneGISPlanarSurface", function () {
  let scene;

  function createWorld(options = {}) {
    const minimum = options.minimum ?? -128.0;
    const size = options.size ?? 256.0;
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: minimum,
          minimumY: minimum,
          maximumX: minimum + size,
          maximumY: minimum + size,
        }),
      }),
      maximumLevel: options.maximumLevel ?? 3,
      maximumScreenSpaceError: options.maximumScreenSpaceError ?? 2.0,
      tileCacheSize: options.tileCacheSize ?? 100,
      baseColor: options.baseColor ?? Color.RED,
      enableLighting: options.enableLighting,
      lambertDiffuseMultiplier: options.lambertDiffuseMultiplier,
    });
  }

  function createPlanarScene(world, width, height) {
    const canvas = createCanvas(width, height);
    const contextOptions = { webgl: { antialias: false, stencil: true } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    const result = new Scene({ canvas, contextOptions });
    result._initializeWorld(world);
    result.highDynamicRange = false;
    result.destroyForSpecs = function () {
      const sceneCanvas = this.canvas;
      this.destroy();
      document.body.removeChild(sceneCanvas);
    };
    result.renderForSpecs = function (time) {
      this.initializeFrame();
      this.render(time);
    };
    return result;
  }

  function pointCameraAt(world, height = 64.0) {
    const extent = world.coordinateSystem.extent;
    const centerX = extent.minimumX + extent.width * 0.5;
    const centerY = extent.minimumY + extent.height * 0.5;
    Cartesian3.fromElements(centerX, centerY, height, scene.camera.position);
    Cartesian3.clone(Cartesian3.UNIT_X, scene.camera.right);
    Cartesian3.clone(Cartesian3.UNIT_Y, scene.camera.up);
    Cartesian3.negate(Cartesian3.UNIT_Z, scene.camera.direction);
  }

  afterEach(function () {
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
  });

  it("publishes flat actual cover only for same-pass ground registration", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    scene.frameState.scene3DOnly = true;
    pointCameraAt(world);
    scene.renderForSpecs();
    expect(world._surface._groundRenderSnapshotCount).toBe(0);
    expect(world._surface._groundRenderSnapshot).toBeUndefined();
    expect(world._groundPrimitives).toBeUndefined();
    const primitive = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [new Cartesian3(-64, 0, 0), new Cartesian3(64, 0, 0)],
          width: 3,
        }),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType(Material.ColorType, {
            color: Color.WHITE,
          }),
        }),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        id: "ground",
      }),
    );
    scene.renderForSpecs();
    expect(world._surface._groundRenderSnapshotCount).toBe(1);
    expect(world._surface._groundRenderSnapshot[0].source).toBe("FLAT");
    expect(primitive._current).toBeDefined();
    expect(scene).toRender([255, 255, 255, 255]);
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    expect(scene.pick(center).id).toBe("ground");
    if (scene.pickPositionSupported) {
      expect(scene.pickPosition(center).z).toBeCloseTo(0.0, 4);
    }
    const snapshot = world._surface._groundRenderSnapshot;
    const entry = snapshot[0];
    scene.primitives.remove(primitive);
    scene.renderForSpecs();
    expect(world._surface._groundRenderSnapshot).toBe(snapshot);
    expect(world._surface._groundRenderSnapshotCount).toBe(0);
    expect(entry.tile).toBeUndefined();
    expect(entry.extent).toBeUndefined();
  });

  it("lazily creates one shared unit quad and renders the base color", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    scene.backgroundColor = Color.BLACK;
    pointCameraAt(world);

    expect(world._surface._vertexArray).toBeUndefined();
    expect(world._surface._terrain).toBeUndefined();
    expect(scene).toRender([255, 0, 0, 255]);

    const surface = world._surface;
    expect(surface._debug.createdBuffers).toBe(1);
    expect(surface._debug.createdVertexArrays).toBe(1);
    expect(surface._debug.createdShaders).toBe(1);
    expect(Math.min(...surface._unitQuad)).toBe(-0.5);
    expect(Math.max(...surface._unitQuad)).toBe(0.5);
    expect(surface._vertexArray._attributes[0].vertexBuffer.sizeInBytes).toBe(
      12 * Float32Array.BYTES_PER_ELEMENT,
    );
    const tile = surface._quadtree._idealTiles[0];
    expect(tile._imagerySlots).toBeUndefined();
    expect(tile.imageryBindings).toBeUndefined();
    expect(tile._imageryRelease).toBeUndefined();
    expect(tile.command.boundingVolume).toBe(tile.commandBoundingVolume);
    expect(tile.command.boundingVolume).not.toBe(tile.boundingVolume);
    expect(tile.terrainEntry).toBeUndefined();
    expect(tile._terrainRelease).toBeUndefined();
  });

  it("changes a pending flat tile to one indexed terrain command on normal render", async function () {
    const world = createWorld({ maximumLevel: 0 });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-20.0, 20.0, 40.0, 80.0]),
      width: 2,
      height: 2,
    });
    const provider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -20.0,
      maximumHeight: 80.0,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 4.0,
      requestTileGeometry: () => Promise.resolve(terrainData),
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    world.terrainProvider = provider;
    scene = createPlanarScene(world);
    pointCameraAt(world, 256.0);

    scene.renderForSpecs();
    const tile = world._surface._quadtree._idealTiles[0];
    expect(tile.command.primitiveType).toBe(PrimitiveType.TRIANGLE_STRIP);
    expect(world.tilesLoaded).toBe(false);
    await Promise.resolve();
    scene.renderForSpecs();

    expect(tile.terrainEntry.state).toBe(world._surface._terrain.State.READY);
    expect(tile.command.primitiveType).toBe(PrimitiveType.TRIANGLES);
    expect(tile.command.vertexArray).toBe(tile.terrainEntry.vertexArray);
    expect(tile.command.count).toBe(30);
    expect(tile.boundingVolume.halfAxes[8]).toBe(50.0);
    expect(world.tilesLoaded).toBe(true);
    const snapshot = world._surface._terrainQuerySnapshot;
    const snapshotEntry = snapshot[0];
    expect(world._surface._terrainQuerySnapshotCount).toBe(1);
    expect(snapshotEntry.tile).toBe(tile);
    expect(snapshotEntry.content).toBe(tile.terrainEntry.activeContent);
    expect(snapshotEntry.mesh).toBe(tile.terrainEntry.activeContent.mesh);
    const debug = { ...world._surface._terrain._debug };
    const command = tile.command;
    scene.renderForSpecs();
    expect(tile.command).toBe(command);
    expect(world._surface._terrain._debug).toEqual(debug);
    expect(world._surface._terrainQuerySnapshot).toBe(snapshot);
    expect(world._surface._terrainQuerySnapshot[0]).toBe(snapshotEntry);

    const cachedCommands = world._surface._renderCommands.slice();
    const replayFrameState = {
      context: scene.context,
      passes: { pick: true, depth: true },
      commandList: [],
    };
    world.render(replayFrameState);
    expect(replayFrameState.commandList).toEqual(cachedCommands);
    expect(replayFrameState.commandList[0]).toBe(command);
    expect(world._surface._terrain._debug).toEqual(debug);

    const oldTile = snapshotEntry.tile;
    const oldContent = snapshotEntry.content;
    const oldMesh = snapshotEntry.mesh;
    const replacement = { ...provider, errorEvent: new Event() };
    world.terrainProvider = replacement;
    expect(world._surface._terrainQuerySnapshotCount).toBe(0);
    expect(snapshotEntry.tile).toBeUndefined();
    expect(snapshotEntry.content).toBeUndefined();
    expect(snapshotEntry.mesh).toBeUndefined();
    expect(snapshotEntry.tile).not.toBe(oldTile);
    expect(snapshotEntry.content).not.toBe(oldContent);
    expect(snapshotEntry.mesh).not.toBe(oldMesh);

    scene.renderForSpecs();
    await Promise.resolve();
    scene.renderForSpecs();
    expect(world._surface._terrainQuerySnapshot[0]).toBe(snapshotEntry);
    expect(snapshotEntry.tile).toBeDefined();
    expect(snapshotEntry.content).toBeDefined();
    expect(snapshotEntry.mesh).toBeDefined();
    world.terrainProvider = undefined;
    expect(world._surface._terrainQuerySnapshotCount).toBe(0);
    expect(snapshotEntry.tile).toBeUndefined();
    expect(snapshotEntry.content).toBeUndefined();
    expect(snapshotEntry.mesh).toBeUndefined();
  });

  it("drapes through an interior terrain peak with linear and logarithmic depth", async function () {
    const world = createWorld({ maximumLevel: 0 });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([0, 0, 0, 0, 48, 0, 0, 0, 0]),
      width: 3,
      height: 3,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0,
      maximumHeight: 48,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 1,
      requestTileGeometry: () => Promise.resolve(terrainData),
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    scene = createPlanarScene(world, 64, 64);
    scene.frameState.scene3DOnly = true;
    pointCameraAt(world, 256);
    const primitive = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [new Cartesian3(-96, 0, 0), new Cartesian3(96, 0, 0)],
          width: 8,
        }),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType(Material.ColorType, {
            color: Color.WHITE,
          }),
        }),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        id: "terrain-ground",
      }),
    );
    scene.renderForSpecs();
    await Promise.resolve();
    scene.renderForSpecs();
    scene.renderForSpecs();
    const center = new Cartesian2(32, 32);
    expect(world.getTerrainHeight(new Cartesian3(0, 0, 0))).toBeCloseTo(48, 5);
    expect(scene.pick(center).id).toBe("terrain-ground");
    if (scene.pickPositionSupported) {
      const mathematical = world.pickFromWindowPosition(center, scene);
      expect(
        Math.abs(
          scene.pickPosition(center).z - world.getTerrainHeight(mathematical),
        ),
      ).toBeLessThan(1.0);
    }
    const current = primitive._current;
    scene.logarithmicDepthBuffer = false;
    scene.renderForSpecs();
    expect(primitive._current).toBe(current);
    if (scene.context.fragmentDepth) {
      scene.logarithmicDepthBuffer = true;
      scene.renderForSpecs();
      expect(scene.pick(center).id).toBe("terrain-ground");
    }

    scene.primitives.remove(primitive);
    const polygon = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolygonGeometry({
          positions: [
            new Cartesian3(-24, -24, 0),
            new Cartesian3(24, -24, 0),
            new Cartesian3(24, 24, 0),
            new Cartesian3(-24, 24, 0),
          ],
          bottomPositions: [
            new Cartesian3(-24, -24, -8),
            new Cartesian3(24, -24, -8),
            new Cartesian3(24, 24, -8),
            new Cartesian3(-24, 24, -8),
          ],
        }),
        appearance: new PerInstanceColorAppearance({ flat: true }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.YELLOW),
        },
        heightReference: HeightReference.CLAMP_TO_GROUND,
        extrudedHeightReference: HeightReference.NONE,
        id: "terrain-ground-polygon",
      }),
    );
    scene.renderForSpecs();
    expect(polygon.ready).toBeTrue();
    expect(scene.pick(center).id).toBe("terrain-ground-polygon");
    if (scene.pickPositionSupported) {
      expect(Math.abs(scene.pickPosition(center).z - 48)).toBeLessThan(1);
    }
  });

  it("clears strong references across snapshot shrink and no-cover invalidation", function () {
    const world = createWorld();
    const surface = world._surface;
    const entries = [{}, {}, {}];
    surface._terrainQuerySnapshot.push(...entries);
    for (let i = 0; i < entries.length; ++i) {
      Object.assign(entries[i], {
        tile: { id: `tile-${i}` },
        content: { id: `content-${i}` },
        mesh: { positions: new Float32Array(1024) },
        source: "DIRECT",
        revision: i,
        key: `0/${i}/0`,
      });
    }
    surface._terrainQuerySnapshotCount = entries.length;

    surface.invalidateTerrainQuerySnapshot();

    expect(surface._terrainQuerySnapshot).toEqual(entries);
    for (const entry of entries) {
      expect(entry.tile).toBeUndefined();
      expect(entry.content).toBeUndefined();
      expect(entry.mesh).toBeUndefined();
      expect(entry.source).toBeUndefined();
      expect(entry.revision).toBeUndefined();
      expect(entry.key).toBeUndefined();
    }

    Object.assign(entries[0], {
      tile: {},
      content: {},
      mesh: { positions: new Float32Array(16) },
      source: "UPSAMPLED",
      revision: 4,
      key: "0/0/0",
    });
    surface._terrainQuerySnapshotCount = 1;
    surface.invalidateTerrainQuerySnapshot();
    expect(surface._terrainQuerySnapshot[0]).toBe(entries[0]);
    expect(entries[0].mesh).toBeUndefined();
    expect(entries[1].mesh).toBeUndefined();
    expect(entries[2].mesh).toBeUndefined();
    world.destroy();
  });

  it("keeps direct content over a stale fallback refresh after the four-child gate", async function () {
    const world = createWorld({ maximumLevel: 1 });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-20.0, 20.0, 40.0, 80.0]),
      width: 2,
      height: 2,
    });
    let resolveDeferred;
    const provider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -20.0,
      maximumHeight: 80.0,
      maximumLevel: 1,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 4.0,
      requestTileGeometry: (x, y, level) => {
        if (level === 1 && x === 1 && y === 1) {
          return new Promise((resolve) => {
            resolveDeferred = resolve;
          });
        }
        return Promise.resolve(terrainData);
      },
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    world.terrainProvider = provider;
    scene = createPlanarScene(world);
    pointCameraAt(world, 64.0);

    scene.renderForSpecs();
    await Promise.resolve();
    scene.renderForSpecs();
    expect(world._surface._renderCommands.length).toBe(1);
    expect(world._surface._renderCommands[0].owner).toBe(world._surface);
    expect(world._surface._quadtree._renderTiles[0].key).toBe("0/0/0");

    scene.renderForSpecs();
    expect(
      world._surface._quadtree._renderTiles.map((tile) => tile.key),
    ).toEqual(["0/0/0"]);
    scene.renderForSpecs();
    const children = world._surface._quadtree._renderTiles;
    expect(children.map((tile) => tile.key)).toEqual([
      "1/0/0",
      "1/1/0",
      "1/0/1",
      "1/1/1",
    ]);
    expect(
      children.some(
        (tile) =>
          tile.terrainEntry.activeSource ===
          world._surface._terrain.Source.UPSAMPLED,
      ),
    ).toBe(true);
    expect(children.some((tile) => tile.key === "0/0/0")).toBe(false);

    const deferred = children.find((tile) => tile.key === "1/1/1");
    const fallbackVertexArray = deferred.terrainEntry.vertexArray;
    const destroyFallback = spyOn(
      fallbackVertexArray,
      "destroy",
    ).and.callThrough();
    const command = deferred.command;
    const parent = world._surface._quadtree._tiles.get("0/0/0");
    parent.terrainEntry.revision =
      parent.terrainEntry.activeContent.revision + 1;
    const beforeDirect = { ...world._surface._terrain._debug };
    resolveDeferred(terrainData);
    await Promise.resolve();
    scene.renderForSpecs();
    expect(deferred.terrainEntry.activeSource).toBe(
      world._surface._terrain.Source.DIRECT,
    );
    expect(deferred.terrainEntry.fallbackContent).toBeUndefined();
    expect(deferred.terrainEntry.fallbackState).toBe(
      world._surface._terrain.FallbackState.NONE,
    );
    expect(deferred.command).toBe(command);
    expect(deferred.terrainEntry.vertexArray).not.toBe(fallbackVertexArray);
    expect(fallbackVertexArray.isDestroyed()).toBe(true);
    expect(destroyFallback).toHaveBeenCalledTimes(1);
    expect(world._surface._terrain._debug.createdUpsampledData).toBe(
      beforeDirect.createdUpsampledData,
    );

    const afterDirect = { ...world._surface._terrain._debug };
    scene.renderForSpecs();
    expect(deferred.terrainEntry.activeSource).toBe(
      world._surface._terrain.Source.DIRECT,
    );
    expect(world._surface._terrain._debug).toEqual(afterDirect);
    const replayFrameState = {
      context: scene.context,
      passes: { pick: true, depth: true },
      commandList: [],
    };
    world.render(replayFrameState);
    expect(replayFrameState.commandList).toEqual(
      world._surface._renderCommands,
    );
    expect(deferred.terrainEntry.activeSource).toBe(
      world._surface._terrain.Source.DIRECT,
    );
    expect(world._surface._terrain._debug).toEqual(afterDirect);
  });

  it("defers culled bridge direct work until it enters the visible chain", async function () {
    const world = createWorld({
      maximumLevel: 1,
      maximumScreenSpaceError: 0.01,
    });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-20.0, 20.0, 40.0, 80.0]),
      width: 2,
      height: 2,
    });
    const requests = [];
    const provider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -20.0,
      maximumHeight: 80.0,
      maximumLevel: 1,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 4.0,
      requestTileGeometry: (x, y, level) => {
        requests.push(`${level}/${x}/${y}`);
        return Promise.resolve(terrainData);
      },
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    world.terrainProvider = provider;
    scene = createPlanarScene(world);

    let includeBridge = false;
    const frameState = {
      frameNumber: 0,
      context: scene.context,
      pixelRatio: 1.0,
      passes: { render: true },
      commandList: [],
      cullingVolume: {
        computeVisibility: (volume) =>
          !includeBridge && volume.center.x > 0.0 && volume.center.y < 0.0
            ? Intersect.OUTSIDE
            : Intersect.INSIDE,
      },
      camera: {
        positionWC: new Cartesian3(0.0, 0.0, 64.0),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3.0,
          aspectRatio: 1.0,
          near: 1.0,
          far: 1000.0,
        }),
      },
      creditDisplay: { addCreditToNextFrame: function () {} },
    };
    const render = () => {
      ++frameState.frameNumber;
      frameState.commandList.length = 0;
      world.beginFrame(frameState);
      world.render(frameState);
    };

    let bridge;
    let observedBlockingCoverage = false;
    let observedSettledChildCover = false;
    for (let i = 0; i < 8; ++i) {
      render();
      bridge ??= Array.from(world._surface._quadtree._tiles.values()).find(
        (tile) =>
          tile.level === 1 &&
          tile.boundingVolume.center.x > 0.0 &&
          tile.boundingVolume.center.y < 0.0,
      );
      if (
        bridge?.terrainEntry.fallbackState ===
          world._surface._terrain.FallbackState.QUEUED &&
        !bridge.terrainEntry.activeContent
      ) {
        observedBlockingCoverage = true;
        expect(
          world._surface._quadtree._renderTiles.map((tile) => tile.key),
        ).toEqual(["0/0/0"]);
        expect(world.tilesLoaded).toBe(false);
      }
      if (
        bridge?.terrainEntry.activeContent &&
        !world._surface._quadtree._renderTiles.some(
          (tile) => tile.key === "0/0/0",
        ) &&
        world.tilesLoaded
      ) {
        observedSettledChildCover = true;
      }
      await Promise.resolve();
    }
    expect(bridge).toBeDefined();
    expect(observedBlockingCoverage).toBe(true);
    expect(observedSettledChildCover).toBe(true);
    expect(requests).not.toContain(bridge.key);
    expect(bridge.terrainEntry.state).toBe(
      world._surface._terrain.State.UNLOADED,
    );
    expect(bridge.terrainEntry.activeSource).toBe(
      world._surface._terrain.Source.UPSAMPLED,
    );
    expect(world.tilesLoaded).toBe(true);
    expect(
      world._surface._quadtree._renderTiles.map((tile) => tile.key),
    ).not.toContain("0/0/0");

    const promotionsBeforeMove = world._surface._terrain._debug.promotions;
    includeBridge = true;
    render();
    expect(requests).toContain(bridge.key);
    expect(bridge.terrainEntry.state).toBe(
      world._surface._terrain.State.LOADING,
    );
    expect(world._surface._terrain._debug.promotions).toBe(
      promotionsBeforeMove,
    );
    expect(world._surface._quadtree._renderTiles.length).toBe(4);
    expect(
      world._surface._quadtree._renderTiles.map((tile) => tile.key),
    ).not.toContain("0/0/0");

    await Promise.resolve();
    render();
    expect(bridge.terrainEntry.activeSource).toBe(
      world._surface._terrain.Source.DIRECT,
    );
    expect(world.tilesLoaded).toBe(true);
    expect(world._surface._quadtree._renderTiles.length).toBe(4);
  });

  it("keeps fresh zero-layer imagery state absent and only clears existing slots", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();

    const tile = world._surface._quadtree._idealTiles[0];
    expect(tile._imagerySlots).toBeUndefined();
    expect(tile.imageryBindings).toBeUndefined();
    expect(tile._imageryRelease).toBeUndefined();

    world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: true,
      errorEvent: new Event(),
      credit: undefined,
      requestImage: () => undefined,
    });
    scene.renderForSpecs();
    const slots = tile._imagerySlots;
    expect(slots.length).toBe(1);
    expect(tile.imageryBindings).toBeDefined();
    expect(tile._imageryRelease).toBeDefined();

    world.imageryLayers.removeAll();
    scene.renderForSpecs();
    expect(tile._imagerySlots).toBe(slots);
    expect(tile._imagerySlots.length).toBe(0);
  });

  it("uses the exact tile volume for quadtree visibility", function () {
    const world = createWorld({ maximumLevel: 0 });
    let testedVolume;
    const frameState = {
      frameNumber: 1,
      passes: { render: true },
      context: { drawingBufferWidth: 1, drawingBufferHeight: 1 },
      pixelRatio: 1.0,
      commandList: [],
      cullingVolume: {
        computeVisibility: (volume) => {
          testedVolume = volume;
          return Intersect.OUTSIDE;
        },
      },
      camera: {
        positionWC: new Cartesian3(0.0, 0.0, 64.0),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3.0,
          aspectRatio: 1.0,
          near: 1.0,
          far: 1000.0,
        }),
      },
    };

    world.beginFrame(frameState);
    world._surface._terrainQuerySnapshotCount = 1;
    world.render(frameState);

    const tile = world._surface._quadtree._tiles.get("0/0/0");
    expect(testedVolume).toBe(tile.boundingVolume);
    expect(testedVolume).not.toBe(tile.commandBoundingVolume);
    expect(world._surface._terrainQuerySnapshotCount).toBe(0);
    world.destroy();
  });

  it("fits the nadir plane strictly inside the command-volume frustum interval", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();

    const tile = world._surface._quadtree._idealTiles[0];
    const distance = scene.camera.positionWC.z;
    const interval = tile.commandBoundingVolume.computePlaneDistances(
      scene.camera.positionWC,
      scene.camera.directionWC,
    );
    expect(interval.start).toBeLessThan(distance);
    expect(interval.stop).toBeGreaterThan(distance);

    const frustum = scene._view.frustumCommandsList[0];
    expect(frustum.near).toBeLessThan(distance);
    expect(frustum.far).toBeGreaterThan(distance);
  });

  it("does not select or allocate for a zero-sized drawing buffer", function () {
    const world = createWorld();
    const frameState = {
      frameNumber: 1,
      passes: { render: true },
      context: { drawingBufferWidth: 0, drawingBufferHeight: 0 },
      commandList: [],
    };

    world.beginFrame(frameState);
    world._surface._terrainQuerySnapshotCount = 1;
    world.render(frameState);

    expect(frameState.commandList).toEqual([]);
    expect(world._surface._quadtree._debug.visited).toBe(0);
    expect(world._surface._vertexArray).toBeUndefined();
    expect(world._surface._context).toBeUndefined();
    expect(world._surface._terrainQuerySnapshotCount).toBe(0);

    frameState.frameNumber = 2;
    frameState.context = { drawingBufferWidth: 1, drawingBufferHeight: 1 };
    frameState.pixelRatio = 1.0;
    frameState.cullingVolume = {
      computeVisibility: () => Intersect.OUTSIDE,
    };
    frameState.camera = {
      positionWC: new Cartesian3(0.0, 0.0, 64.0),
      frustum: new PerspectiveFrustum({
        fov: Math.PI / 3.0,
        aspectRatio: 1.0,
        near: 1.0,
        far: 1000.0,
      }),
    };
    world.beginFrame(frameState);
    world.render(frameState);
    expect(world._surface._context).toBeUndefined();
    world.destroy();
  });

  it("submits no command while hidden and reuses resources after restore", function () {
    const world = createWorld();
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const before = { ...world._surface._debug };

    world.show = false;
    scene.renderForSpecs();
    expect(world._surface._debug.submittedCommands).toBe(0);
    expect(world._surface._terrainQuerySnapshotCount).toBe(0);

    world.show = true;
    scene.renderForSpecs();
    expect(world._surface._debug.createdBuffers).toBe(before.createdBuffers);
    expect(world._surface._debug.createdShaders).toBe(before.createdShaders);
  });

  it("has zero allocation deltas on an identical warm frame", function () {
    const world = createWorld();
    scene = createPlanarScene(world);
    pointCameraAt(world, 128.0);
    scene.renderForSpecs();
    const surface = world._surface;
    expect(surface._quadtree._debug.visited).toBe(1);
    expect(surface._quadtree._debug.culled).toBe(0);
    expect(surface._quadtree._debug.selected).toBe(1);
    expect(surface._debug.submittedCommands).toBe(1);
    expect(surface._quadtree._tiles.size).toBe(1);
    const before = {
      tiles: surface._quadtree._debug.createdTiles,
      commands: surface._debug.createdCommands,
      buffers: surface._debug.createdBuffers,
      shaders: surface._debug.createdShaders,
      resident: surface._quadtree._tiles.size,
    };

    scene.renderForSpecs();

    expect(surface._quadtree._debug.createdTiles).toBe(before.tiles);
    expect(surface._debug.createdCommands).toBe(before.commands);
    expect(surface._debug.createdBuffers).toBe(before.buffers);
    expect(surface._debug.createdShaders).toBe(before.shaders);
    expect(surface._quadtree._tiles.size).toBe(before.resident);
  });

  it("switches lighting variants on the existing command and replays the lit command", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world, 128.0);
    scene.light = new DirectionalLight({
      direction: Cartesian3.normalize(
        new Cartesian3(1.0, 0.0, 1.0),
        new Cartesian3(),
      ),
    });
    scene.renderForSpecs();

    const surface = world._surface;
    const tile = surface._quadtree._renderTiles[0];
    const command = tile.command;
    const unlitShader = command.shaderProgram;
    const allocationBefore = {
      commands: surface._debug.createdCommands,
      buffers: surface._debug.createdBuffers,
      vertexArrays: surface._debug.createdVertexArrays,
      textures: surface._debug.createdTextures,
      tiles: surface._quadtree._debug.createdTiles,
    };

    world.enableLighting = true;
    scene.renderForSpecs();
    const litShader = command.shaderProgram;
    expect(tile.command).toBe(command);
    expect(litShader).not.toBe(unlitShader);
    expect(surface._shaderPrograms.size).toBe(2);
    expect(command.uniformMap.u_lambertDiffuseMultiplier()).toBe(0.9);
    expect(surface._debug.createdCommands).toBe(allocationBefore.commands);
    expect(surface._debug.createdBuffers).toBe(allocationBefore.buffers);
    expect(surface._debug.createdVertexArrays).toBe(
      allocationBefore.vertexArrays,
    );
    expect(surface._debug.createdTextures).toBe(allocationBefore.textures);
    expect(surface._quadtree._debug.createdTiles).toBe(allocationBefore.tiles);

    const createdShaders = surface._debug.createdShaders;
    world.lambertDiffuseMultiplier = 0.25;
    scene.renderForSpecs();
    expect(tile.command).toBe(command);
    expect(command.shaderProgram).toBe(litShader);
    expect(command.uniformMap.u_lambertDiffuseMultiplier()).toBe(0.25);
    expect(surface._debug.createdShaders).toBe(createdShaders);

    const depthFrameState = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      commandList: [],
    };
    const quadtreeDebug = { ...surface._quadtree._debug };
    world.render(depthFrameState);
    expect(depthFrameState.commandList).toEqual([command]);
    expect(depthFrameState.commandList[0]).toBe(command);
    expect(surface._quadtree._debug).toEqual(quadtreeDebug);
    expect(surface._debug.createdShaders).toBe(createdShaders);

    world.enableLighting = false;
    scene.renderForSpecs();
    expect(tile.command).toBe(command);
    expect(command.shaderProgram).toBe(unlitShader);
    expect(surface._shaderPrograms.size).toBe(2);
  });

  it("does not duplicate commands when render is repeated in one frame", function () {
    const world = createWorld();
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const commandCount = scene.frameState.commandList.length;

    world.render(scene.frameState);

    expect(scene.frameState.commandList.length).toBe(commandCount);
  });

  it("replays the last normal render commands for depth picking without mutation", function () {
    const world = createWorld({ maximumLevel: 1 });
    scene = createPlanarScene(world);
    pointCameraAt(world, 64.0);
    scene.renderForSpecs();
    const surface = world._surface;
    const commands = surface._renderCommands.slice();
    const debugBefore = { ...surface._debug };
    const quadtreeDebugBefore = { ...surface._quadtree._debug };
    const idealBefore = surface._quadtree._idealTiles.slice();
    const protectedBefore = new Set(surface._quadtree._protectedKeys);
    const tileStateBefore = Array.from(surface._quadtree._tiles.values()).map(
      (tile) => ({
        tile,
        lastUsedFrame: tile.lastUsedFrame,
        command: tile.command,
      }),
    );

    const depthFrameState = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      commandList: [],
    };
    world.render(depthFrameState);

    expect(depthFrameState.commandList).toEqual(commands);
    for (let i = 0; i < commands.length; ++i) {
      expect(depthFrameState.commandList[i]).toBe(commands[i]);
    }
    expect(surface._debug.submittedCommands).toBe(
      debugBefore.submittedCommands,
    );
    expect(surface._debug.depthSubmittedCommands).toBe(commands.length);
    expect(surface._debug.createdCommands).toBe(debugBefore.createdCommands);
    expect(surface._debug.createdBuffers).toBe(debugBefore.createdBuffers);
    expect(surface._debug.createdShaders).toBe(debugBefore.createdShaders);
    expect(surface._quadtree._debug).toEqual(quadtreeDebugBefore);
    expect(surface._quadtree._idealTiles).toEqual(idealBefore);
    expect(surface._quadtree._protectedKeys).toEqual(protectedBefore);
    expect(
      Array.from(surface._quadtree._tiles.values()).map((tile) => ({
        tile,
        lastUsedFrame: tile.lastUsedFrame,
        command: tile.command,
      })),
    ).toEqual(tileStateBefore);

    depthFrameState.commandList.length = 0;
    world.render(depthFrameState);
    expect(depthFrameState.commandList).toEqual(commands);
    expect(surface._debug.depthSubmittedCommands).toBe(commands.length * 2);
    expect(surface._debug.createdCommands).toBe(debugBefore.createdCommands);
    expect(surface._quadtree._debug).toEqual(quadtreeDebugBefore);
  });

  it("does not bind or allocate when a depth pass has no normal-render cache", function () {
    const world = createWorld();
    const frameState = {
      frameNumber: 1,
      passes: { render: false, pick: true, depth: true },
      context: { drawingBufferWidth: 1, drawingBufferHeight: 1 },
      commandList: [],
    };

    world.render(frameState);

    expect(frameState.commandList).toEqual([]);
    expect(world._surface._context).toBeUndefined();
    expect(world._surface._vertexArray).toBeUndefined();
    expect(world._surface._debug.createdCommands).toBe(0);
    expect(world._surface._quadtree._debug.visited).toBe(0);
    world.destroy();
  });

  it("validates Context before a cached depth-pass replay", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const commands = world._surface._renderCommands.slice();
    const depthFrameState = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      context: { drawingBufferWidth: 1, drawingBufferHeight: 1 },
      commandList: [],
    };

    expect(() => world.render(depthFrameState)).toThrowDeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );
    expect(depthFrameState.commandList).toEqual([]);
    expect(world._surface._renderCommands).toEqual(commands);
  });

  it("refines perspective and orthographic views deterministically", function () {
    const world = createWorld({ maximumLevel: 3 });
    scene = createPlanarScene(world);
    const frameState = {
      frameNumber: 1,
      context: scene.context,
      pixelRatio: 1.0,
      passes: { render: true },
      commandList: [],
      cullingVolume: {
        computeVisibility: () => Intersect.INSIDE,
      },
      camera: {
        positionWC: new Cartesian3(0.0, 0.0, 1.0e8),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3.0,
          aspectRatio: 1.0,
          near: 1.0,
          far: 2.0e8,
        }),
      },
    };
    world.beginFrame(frameState);
    world.render(frameState);
    const farLevel = Math.max(
      ...world._surface._quadtree._idealTiles.map((tile) => tile.level),
    );

    ++frameState.frameNumber;
    frameState.commandList.length = 0;
    frameState.camera.positionWC.z = 0.01;
    world.beginFrame(frameState);
    world.render(frameState);
    const nearLevel = Math.max(
      ...world._surface._quadtree._idealTiles.map((tile) => tile.level),
    );
    expect(nearLevel).toBeGreaterThan(farLevel);

    ++frameState.frameNumber;
    frameState.commandList.length = 0;
    frameState.camera.frustum = new OrthographicFrustum({
      width: 1024.0,
      aspectRatio: 1.0,
      near: 1.0,
      far: 10000.0,
    });
    world.beginFrame(frameState);
    world.render(frameState);
    const wideLevel = Math.max(
      ...world._surface._quadtree._idealTiles.map((tile) => tile.level),
    );

    ++frameState.frameNumber;
    frameState.commandList.length = 0;
    frameState.camera.frustum.width = 0.01;
    frameState.camera.positionWC.z = 1000.0;
    world.beginFrame(frameState);
    world.render(frameState);
    const narrowLevel = Math.max(
      ...world._surface._quadtree._idealTiles.map((tile) => tile.level),
    );
    expect(narrowLevel).toBeGreaterThan(wideLevel);
  });

  it("leaves pixels outside the configured world extent at background", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world, 3, 1);
    scene.backgroundColor = Color.BLACK;
    scene.camera.frustum = new OrthographicFrustum({
      width: 768.0,
      aspectRatio: 3.0,
      near: 1.0,
      far: 1000.0,
    });
    pointCameraAt(world);

    scene.renderForSpecs();

    expect(scene.context.readPixels()).toEqual([
      0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255,
    ]);
  });

  it("does not release shared GPU resources during tile eviction", function () {
    const world = createWorld({ maximumLevel: 1, tileCacheSize: 0 });
    scene = createPlanarScene(world);
    const surface = world._surface;
    const frameState = {
      frameNumber: 1,
      context: scene.context,
      pixelRatio: 1.0,
      passes: { render: true },
      commandList: [],
      cullingVolume: {
        computeVisibility: () => Intersect.INSIDE,
      },
      camera: {
        positionWC: new Cartesian3(0.0, 0.0, 0.0),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3.0,
          aspectRatio: 1.0,
          near: 1.0,
          far: 2.0e8,
        }),
      },
    };
    world.beginFrame(frameState);
    world.render(frameState);
    world.endFrame(frameState);
    const vertexArray = surface._vertexArray;
    const shaderProgram = surface._shaderProgram;

    ++frameState.frameNumber;
    frameState.commandList.length = 0;
    frameState.camera.positionWC.z = 1.0e8;
    world.beginFrame(frameState);
    world.render(frameState);
    world.endFrame(frameState);

    expect(surface._quadtree._debug.evictedTiles).toBe(4);
    expect(surface._vertexArray).toBe(vertexArray);
    expect(surface._shaderProgram).toBe(shaderProgram);
    expect(surface._debug.createdBuffers).toBe(1);
    expect(surface._debug.createdShaders).toBe(1);
    expect(surface._debug.destroyedVertexArrays).toBe(0);
    expect(surface._debug.destroyedBuffers).toBe(0);
    expect(surface._debug.destroyedShaders).toBe(0);
  });

  it("changes color without rebuilding shared resources", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    expect(scene).toRender([255, 0, 0, 255]);
    const surface = world._surface;

    world.baseColor = Color.BLUE;
    expect(scene).toRender([0, 0, 255, 255]);
    expect(surface._debug.createdBuffers).toBe(1);
    expect(surface._debug.createdShaders).toBe(1);
  });

  it("renders large absolute coordinates through a finite model matrix", function () {
    const world = createWorld({
      minimum: 1.0e9,
      size: 1024.0,
      maximumLevel: 1,
    });
    scene = createPlanarScene(world);
    pointCameraAt(world, 256.0);

    expect(scene).toRender([255, 0, 0, 255]);
    for (const tile of world._surface._quadtree._idealTiles) {
      for (let i = 0; i < 16; ++i) {
        expect(Number.isFinite(tile.modelMatrix[i])).toBe(true);
      }
    }
  });

  it("destroys owned GPU resources exactly once with the Scene", function () {
    const world = createWorld();
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const surface = world._surface;
    surface._terrainQuerySnapshot.push({});
    surface._terrainQuerySnapshotCount = 1;

    scene.destroyForSpecs();
    scene = undefined;

    expect(world.isDestroyed()).toBe(true);
    expect(surface.isDestroyed()).toBe(true);
    expect(surface._debug.destroyedVertexArrays).toBe(1);
    expect(surface._debug.destroyedBuffers).toBe(1);
    expect(surface._debug.destroyedShaders).toBe(1);
    expect(surface._quadtree._tiles.size).toBe(0);
    expect(surface._terrainQuerySnapshot.length).toBe(0);
    expect(surface._terrainQuerySnapshotCount).toBe(0);
  });

  it("rejects rendering shared resources with a second Context", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();

    const secondScene = createPlanarScene(createWorld({ maximumLevel: 0 }));
    const secondWorld = secondScene.world;
    try {
      secondScene.camera.setView({
        destination: new Cartesian3(0.0, 0.0, 64.0),
        orientation: {
          direction: new Cartesian3(0.0, 0.0, -1.0),
          up: new Cartesian3(0.0, 1.0, 0.0),
        },
      });
      secondScene.renderForSpecs();
      const frameState = secondScene.frameState;
      frameState.frameNumber = scene.frameState.frameNumber + 100;
      expect(() => {
        world.beginFrame(frameState);
        world.render(frameState);
      }).toThrowDeveloperError(
        "SceneGISPlanarWorld cannot render with more than one Context.",
      );
    } finally {
      secondScene.destroyForSpecs();
      expect(secondWorld.isDestroyed()).toBe(true);
    }
  });

  it("rejects zero-buffer and offscreen second Contexts before mutation", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const surface = world._surface;
    const frameNumber = surface._frameNumber;
    const visited = surface._quadtree._debug.visited;
    const renderedFrameNumber = surface._renderedFrameNumber;

    const zeroBuffer = {
      frameNumber: frameNumber + 1,
      context: { drawingBufferWidth: 0, drawingBufferHeight: 0 },
      passes: { render: true },
      commandList: [],
    };
    expect(() => world.beginFrame(zeroBuffer)).toThrowDeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );
    expect(() => world.render(zeroBuffer)).toThrowDeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );

    const offscreen = {
      frameNumber: frameNumber + 2,
      context: { drawingBufferWidth: 1, drawingBufferHeight: 1 },
      pixelRatio: 1.0,
      passes: { render: true },
      commandList: [],
      cullingVolume: {
        computeVisibility: () => Intersect.OUTSIDE,
      },
      camera: {
        positionWC: new Cartesian3(0.0, 0.0, 64.0),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3.0,
          aspectRatio: 1.0,
          near: 1.0,
          far: 1000.0,
        }),
      },
    };
    expect(() => world.beginFrame(offscreen)).toThrowDeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );
    expect(() => world.render(offscreen)).toThrowDeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );
    expect(surface._frameNumber).toBe(frameNumber);
    expect(surface._renderedFrameNumber).toBe(renderedFrameNumber);
    expect(surface._quadtree._debug.visited).toBe(visited);
  });

  it("rejects a second Context before imagery state mutation", function () {
    const world = createWorld({ maximumLevel: 0 });
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValue(undefined);
    world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: true,
      errorEvent: new Event(),
      credit: undefined,
      requestImage,
    });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const surface = world._surface;
    const imageryDebug = { ...surface._imagery._debug };
    const runtimes = surface._imagery._runtimes;
    const tile = surface._quadtree._idealTiles[0];
    const bindings = tile.imageryBindings;

    const secondScene = createPlanarScene(createWorld({ maximumLevel: 0 }));
    try {
      secondScene.camera.setView({
        destination: new Cartesian3(0.0, 0.0, 64.0),
        orientation: {
          direction: new Cartesian3(0.0, 0.0, -1.0),
          up: new Cartesian3(0.0, 1.0, 0.0),
        },
      });
      secondScene.renderForSpecs();
      const frameState = secondScene.frameState;
      frameState.frameNumber = scene.frameState.frameNumber + 100;
      expect(() => world.beginFrame(frameState)).toThrowDeveloperError(
        "SceneGISPlanarWorld cannot render with more than one Context.",
      );
      expect(() => world.render(frameState)).toThrowDeveloperError(
        "SceneGISPlanarWorld cannot render with more than one Context.",
      );
      expect(surface._imagery._debug).toEqual(imageryDebug);
      expect(surface._imagery._runtimes).toBe(runtimes);
      expect(tile.imageryBindings).toBe(bindings);
      expect(requestImage).toHaveBeenCalledTimes(1);
    } finally {
      secondScene.destroyForSpecs();
    }
  });
});
