import {
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  Event,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarWorld,
  SceneMode,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";

describe("SceneGIS/Widget/SceneGISPlanarReleaseQualification", function () {
  let container;
  let widget;

  function createWorld(options = {}) {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128,
          minimumY: -128,
          maximumX: 128,
          maximumY: 128,
        }),
      }),
      maximumLevel: options.maximumLevel ?? 2,
      maximumScreenSpaceError: options.maximumScreenSpaceError ?? 0.01,
      tileCacheSize: options.tileCacheSize ?? 16,
      baseColor: options.baseColor ?? Color.BLACK,
    });
  }

  function createImage(cssColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    context.fillStyle = cssColor;
    context.fillRect(0, 0, 2, 2);
    return canvas;
  }

  function createProvider(world, cssColor) {
    return {
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: world.maximumLevel,
      tileWidth: 2,
      tileHeight: 2,
      hasAlphaChannel: true,
      errorEvent: new Event(),
      requestImage: function () {
        return Promise.resolve(createImage(cssColor));
      },
    };
  }

  function createProviderFromRequest(world, requestImage) {
    const provider = createProvider(world, "black");
    provider.requestImage = requestImage;
    return provider;
  }

  function createWidget(world) {
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    widget.scene.highDynamicRange = false;
    widget.scene.rethrowRenderErrors = true;
    setCamera(world, 0.0, 0.0, 512.0);
  }

  function setCamera(world, x, y, height) {
    widget.scene.camera.setView({
      destination: new Cartesian3(x, y, height),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: new Cartesian3(0, 1, 0),
      },
    });
  }

  async function settleImagery(world) {
    for (let i = 0; i < 24 && !world.tilesLoaded; ++i) {
      await Promise.resolve();
      await Promise.resolve();
      widget.render();
    }
    expect(world.tilesLoaded).toBe(true);
  }

  function snapshotPersistent(world) {
    const surface = world._surface;
    return {
      buffers: surface._debug.createdBuffers,
      vertexArrays: surface._debug.createdVertexArrays,
      shaders: surface._debug.createdShaders,
      surfaceTextures: surface._debug.createdTextures,
      commands: surface._debug.createdCommands,
      tiles: surface._quadtree._debug.createdTiles,
      evictedTiles: surface._quadtree._debug.evictedTiles,
      bindings: surface._imagery._debug.createdBindings,
      requests: surface._imagery._debug.createdRequests,
      imageryTextures: surface._imagery._debug.createdTextures,
    };
  }

  function snapshotFrameSignature(world) {
    const surface = world._surface;
    const quadtree = surface._quadtree;
    return {
      visited: quadtree._debug.visited,
      culled: quadtree._debug.culled,
      selected: quadtree._debug.selected,
      sseComputations: quadtree._debug.sseComputations,
      submittedCommands: surface._debug.submittedCommands,
      residentTiles: quadtree._tiles.size,
      idealKeys: quadtree._idealTiles.map((tile) => tile.key),
      protectedKeys: Array.from(quadtree._protectedKeys),
      commandCount: surface._renderCommands.length,
    };
  }

  function expectCacheBounded(world) {
    const quadtree = world._surface._quadtree;
    expect(quadtree._tiles.size).toBeLessThanOrEqual(
      world.tileCacheSize + quadtree._protectedKeys.size,
    );
  }

  function expectImageryConverged(world) {
    expect(world.tilesLoaded).toBe(true);
    for (const runtime of world._surface._imagery._runtimes.values()) {
      for (const entry of runtime.entries.values()) {
        expect(entry.request).toBeUndefined();
        expect(entry.references).toBeGreaterThan(0);
      }
    }
  }

  function renderFrames(count) {
    for (let i = 0; i < count; ++i) {
      widget.render();
    }
  }

  function percentile(sorted, fraction) {
    return sorted[
      Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
    ];
  }

  function measureFrames(label, requiresImagery, beforeSample) {
    const batchSize = 20;
    const runs = [];
    for (let run = 0; run < 5; ++run) {
      renderFrames(120);
      expect(
        widget.scene.world._surface._quadtree._debug.selected,
      ).toBeGreaterThanOrEqual(16);
      expect(
        widget.scene.world._surface._debug.submittedCommands,
      ).toBeGreaterThanOrEqual(16);
      if (requiresImagery) {
        expect(widget.scene.world.tilesLoaded).toBe(true);
      }
      const persistent = snapshotPersistent(widget.scene.world);
      const samples = [];
      for (let sample = 0; sample < 300; ++sample) {
        beforeSample?.(sample);
        const start = performance.now();
        renderFrames(batchSize);
        samples.push((performance.now() - start) / batchSize);
      }
      expect(snapshotPersistent(widget.scene.world)).toEqual(persistent);
      samples.sort((left, right) => left - right);
      runs.push({
        median: percentile(samples, 0.5),
        p95: percentile(samples, 0.95),
        max: samples[samples.length - 1],
      });
    }
    console.warn(`SCENEGIS_P8_TIMING ${label} ${JSON.stringify(runs)}`);
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "960px";
    container.style.height = "540px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    widget = undefined;
    document.body.removeChild(container);
  });

  it("keeps a sixteen-tile bare surface allocation-stable for 120 warm frames", function () {
    const world = createWorld();
    createWidget(world);
    widget.render();
    expect(world._surface._quadtree._debug.selected).toBeGreaterThanOrEqual(16);
    expect(world._surface._debug.submittedCommands).toBeGreaterThanOrEqual(16);
    const persistent = snapshotPersistent(world);
    const signature = snapshotFrameSignature(world);
    for (let frame = 0; frame < 120; ++frame) {
      widget.render();
      expect(snapshotPersistent(world)).toEqual(persistent);
      expect(snapshotFrameSignature(world)).toEqual(signature);
      expectCacheBounded(world);
    }
  });

  it("keeps two ready local layers allocation-stable for 120 warm frames", async function () {
    const world = createWorld();
    world.imageryLayers.addImageryProvider(createProvider(world, "red"));
    world.imageryLayers.add(
      new SceneGISPlanarImageryLayer(createProvider(world, "blue"), {
        alpha: 0.5,
      }),
    );
    createWidget(world);
    widget.render();
    await settleImagery(world);
    const persistent = snapshotPersistent(world);
    const signature = snapshotFrameSignature(world);
    for (let frame = 0; frame < 120; ++frame) {
      widget.render();
      expect(snapshotPersistent(world)).toEqual(persistent);
      expect(snapshotFrameSignature(world)).toEqual(signature);
      expectImageryConverged(world);
      expectCacheBounded(world);
    }
    expect(world._surface._debug.submittedCommands).toBeGreaterThanOrEqual(16);
  });

  it("records the fixed release timing protocol for bare, imagery, and motion", async function () {
    const bare = createWorld();
    createWidget(bare);
    widget.render();
    measureFrames("bare-steady", false);
    widget = widget.destroy();

    const imagery = createWorld();
    imagery.imageryLayers.addImageryProvider(createProvider(imagery, "red"));
    imagery.imageryLayers.addImageryProvider(createProvider(imagery, "blue"));
    createWidget(imagery);
    widget.render();
    await settleImagery(imagery);
    measureFrames("imagery-steady", true);
    measureFrames("imagery-motion", true, function (frame) {
      const offset = frame % 2 === 0 ? -32.0 : 32.0;
      setCamera(imagery, offset, 0.0, 512.0);
    });
  });

  it("converges after five multi-axis and multi-level imagery churn rounds", async function () {
    const world = createWorld({
      maximumLevel: 3,
      maximumScreenSpaceError: 2.0,
      tileCacheSize: 24,
    });
    world.imageryLayers.addImageryProvider(createProvider(world, "red"));
    world.imageryLayers.addImageryProvider(createProvider(world, "blue"));
    createWidget(world);
    const keyframes = [
      [0.0, 0.0, 1000000.0],
      [0.0, 0.0, 50000.0],
      [0.0, 0.0, 512.0],
      [-96.0, 0.0, 192.0],
      [96.0, 0.0, 192.0],
      [0.0, -96.0, 192.0],
      [0.0, 96.0, 192.0],
      [-96.0, -96.0, 192.0],
      [96.0, -96.0, 192.0],
      [-96.0, 96.0, 192.0],
      [96.0, 96.0, 192.0],
    ];
    for (let round = 0; round < 5; ++round) {
      for (const [x, y, height] of keyframes) {
        setCamera(world, x, y, height);
        widget.render();
        await settleImagery(world);
        expectImageryConverged(world);
        expectCacheBounded(world);
      }
    }
    world.tileCacheSize = 64;
    setCamera(world, 0.0, 0.0, 512.0);
    widget.render();
    await settleImagery(world);
    const persistent = snapshotPersistent(world);
    const signature = snapshotFrameSignature(world);
    for (let frame = 0; frame < 120; ++frame) {
      widget.render();
      expect(snapshotPersistent(world)).toEqual(persistent);
      expect(snapshotFrameSignature(world)).toEqual(signature);
      expectImageryConverged(world);
      expectCacheBounded(world);
    }
  });

  it("replays depth sixty times without selection or allocation mutation", function () {
    if (!!window.webglStub) {
      pending("Requires real WebGL depth textures.");
      return;
    }
    const world = createWorld();
    createWidget(world);
    widget.render();
    if (!widget.scene.pickPositionSupported) {
      pending("Depth textures are unavailable.");
      return;
    }
    widget.scene.pickTranslucentDepth = true;
    const before = snapshotPersistent(world);
    const quadtree = { ...world._surface._quadtree._debug };
    const protectedKeys = Array.from(world._surface._quadtree._protectedKeys);
    const idealKeys = world._surface._quadtree._idealTiles.map(
      (tile) => tile.key,
    );
    const lastUsedFrames = Array.from(
      world._surface._quadtree._tiles,
      ([key, tile]) => [key, tile.lastUsedFrame],
    );
    const commands = world._surface._renderCommands.slice();
    const depthBefore = world._surface._debug.depthSubmittedCommands;
    const center = new Cartesian2(
      widget.scene.canvas.clientWidth * 0.5,
      widget.scene.canvas.clientHeight * 0.5,
    );
    expect(world.pickFromWindowPosition(center, widget.scene)).toBeDefined();
    for (let i = 0; i < 60; ++i) {
      const position = new Cartesian2(
        center.x + ((i % 10) - 4.5) * 2.0,
        center.y + (Math.floor(i / 10) - 2.5) * 2.0,
      );
      expect(widget.scene.pickPosition(position)).toBeDefined();
    }
    expect(snapshotPersistent(world)).toEqual(before);
    expect(world._surface._quadtree._debug).toEqual(quadtree);
    expect(Array.from(world._surface._quadtree._protectedKeys)).toEqual(
      protectedKeys,
    );
    expect(
      world._surface._quadtree._idealTiles.map((tile) => tile.key),
    ).toEqual(idealKeys);
    expect(
      Array.from(world._surface._quadtree._tiles, ([key, tile]) => [
        key,
        tile.lastUsedFrame,
      ]),
    ).toEqual(lastUsedFrames);
    expect(world._surface._renderCommands.length).toBe(commands.length);
    for (let i = 0; i < commands.length; ++i) {
      expect(world._surface._renderCommands[i]).toBe(commands[i]);
    }
    expect(world._surface._debug.depthSubmittedCommands - depthBefore).toBe(
      60 * commands.length,
    );
  });

  it("isolates late imagery settlement and releases ready resources", async function () {
    const world = createWorld();
    const failureEvent = new Event();
    let reportedFailure;
    failureEvent.addEventListener(function (error) {
      reportedFailure = error;
      error.retry = false;
    });
    const failedProvider = createProviderFromRequest(world, () =>
      Promise.reject(new Error("Expected qualification failure.")),
    );
    failedProvider.errorEvent = failureEvent;
    const failedLayer = world.imageryLayers.addImageryProvider(failedProvider);
    createWidget(world);
    widget.render();
    await settleImagery(world);
    expect(reportedFailure).toBeDefined();
    expect(world.tilesLoaded).toBe(true);
    expect(world.imageryLayers.remove(failedLayer)).toBe(true);

    let resolvePending;
    const pendingLayer = world.imageryLayers.addImageryProvider(
      createProviderFromRequest(
        world,
        () =>
          new Promise((resolve) => {
            resolvePending = resolve;
          }),
      ),
    );
    widget.render();
    expect(resolvePending).toBeDefined();
    expect(world.imageryLayers.remove(pendingLayer)).toBe(true);
    const beforeLate = { ...world._surface._imagery._debug };
    resolvePending(createImage("red"));
    await Promise.resolve();
    await Promise.resolve();
    widget.render();
    expect(world._surface._imagery._debug.createdTextures).toBe(
      beforeLate.createdTextures,
    );

    const readyLayer = world.imageryLayers.addImageryProvider(
      createProvider(world, "blue"),
    );
    widget.render();
    await settleImagery(world);
    const runtime = world._surface._imagery._runtimes.get(readyLayer);
    const readyEntryCount = runtime.entries.size;
    const destroyedBefore = world._surface._imagery._debug.destroyedTextures;
    expect(world.imageryLayers.remove(readyLayer)).toBe(true);
    expect(
      world._surface._imagery._debug.destroyedTextures - destroyedBefore,
    ).toBe(readyEntryCount);
    expect(world._surface._imagery._runtimes.has(readyLayer)).toBe(false);
  });

  it("completes fifty lightweight ownership cycles", function () {
    for (let i = 0; i < 50; ++i) {
      const world = createWorld();
      const provider = createProvider(world, "red");
      provider.destroy = jasmine.createSpy("providerDestroy");
      const layer = world.imageryLayers.addImageryProvider(provider);
      expect(world.imageryLayers.remove(layer, false)).toBe(true);
      layer.destroy();
      const frameState = {
        mode: SceneMode.SCENE3D,
        frameNumber: i,
        context: { drawingBufferWidth: 0, drawingBufferHeight: 0 },
        passes: { render: false, pick: false, depth: false },
        commandList: [],
      };
      world.update(frameState);
      world.beginFrame(frameState);
      world.render(frameState);
      world.endFrame(frameState);
      world.destroy();
      expect(world.isDestroyed()).toBe(true);
      expect(provider.isDestroyed).toBeUndefined();
      expect(provider.destroy).not.toHaveBeenCalled();
    }
  });

  it("completes eight real CesiumWidget imagery ownership cycles", async function () {
    for (let i = 0; i < 8; ++i) {
      const world = createWorld();
      const provider = createProvider(world, "red");
      provider.destroy = jasmine.createSpy(`providerDestroy${i}`);
      const pendingResolvers = [];
      if (i === 7) {
        provider.requestImage = function () {
          return new Promise((resolve) => {
            pendingResolvers.push(resolve);
          });
        };
      }
      world.imageryLayers.addImageryProvider(provider);
      createWidget(world);
      widget.render();
      if (i !== 7) {
        await settleImagery(world);
      }
      const surface = world._surface;
      const quadtree = surface._quadtree;
      const imagery = surface._imagery;
      expect(quadtree._debug.createdTiles).toBeGreaterThan(0);
      expect(imagery._debug.createdBindings).toBeGreaterThan(0);
      expect(imagery._debug.createdRequests).toBeGreaterThan(0);
      if (i === 7) {
        expect(pendingResolvers.length).toBeGreaterThan(0);
        expect(imagery._debug.createdTextures).toBe(0);
      } else {
        expect(imagery._debug.createdTextures).toBeGreaterThan(0);
        for (const runtime of imagery._runtimes.values()) {
          for (const entry of runtime.entries.values()) {
            expect(entry.request).toBeUndefined();
          }
        }
      }
      widget = widget.destroy();
      expect(world.isDestroyed()).toBe(true);
      expect(provider.destroy).not.toHaveBeenCalled();
      expect(quadtree._tiles.size).toBe(0);
      expect(quadtree._protectedKeys.size).toBe(0);
      expect(quadtree._debug.destroyedTiles).toBe(quadtree._debug.createdTiles);
      expect(imagery._runtimes.size).toBe(0);
      expect(imagery._debug.destroyedTextures).toBe(
        imagery._debug.createdTextures,
      );
      expect(surface._debug.destroyedBuffers).toBe(
        surface._debug.createdBuffers,
      );
      expect(surface._debug.destroyedVertexArrays).toBe(
        surface._debug.createdVertexArrays,
      );
      expect(surface._debug.destroyedShaders).toBe(
        surface._debug.createdShaders,
      );
      expect(surface._debug.destroyedTextures).toBe(
        surface._debug.createdTextures,
      );
      expect(surface._renderCommands.length).toBe(0);
      if (i === 7) {
        expect(imagery._debug.cancelledRequests).toBe(
          imagery._debug.createdRequests,
        );
        for (const resolve of pendingResolvers) {
          resolve(createImage("blue"));
        }
        await Promise.resolve();
        await Promise.resolve();
        expect(imagery._debug.createdTextures).toBe(0);
        expect(imagery._runtimes.size).toBe(0);
        expect(quadtree._tiles.size).toBe(0);
      }
    }
  });
});
