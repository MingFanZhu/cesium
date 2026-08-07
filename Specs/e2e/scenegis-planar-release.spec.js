import { test, expect } from "./test.js";

test("planar Viewer qualifies local imagery, picking, wheel, Home, and destroy", async ({
  cesiumPage,
  page,
}) => {
  const externalAttempts = [];
  const badResponses = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    ) {
      externalAttempts.push(request.url());
    }
  });
  page.on("pageerror", (error) =>
    pageErrors.push({
      name: error.name,
      message: error.message,
      stack: error.stack,
      text: String(error),
    }),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      badResponses.push({ status: response.status(), url: response.url() });
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
  await cesiumPage.goto();

  const initial = await page.evaluate(async () => {
    window.scenegisP8BrowserErrors = [];
    window.addEventListener("error", (event) => {
      window.scenegisP8BrowserErrors.push({
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: String(event.error),
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      window.scenegisP8BrowserErrors.push({
        rejection: String(event.reason),
        message: event.reason?.message,
        stack: event.reason?.stack,
      });
    });
    const extent = new Cesium.SceneGISPlanarExtent({
      minimumX: -128,
      minimumY: -128,
      maximumX: 128,
      maximumY: 128,
    });
    const world = new Cesium.SceneGISPlanarWorld({
      coordinateSystem: new Cesium.SceneGISPlanarCoordinateSystem({ extent }),
      maximumLevel: 2,
      maximumScreenSpaceError: 0.01,
      tileCacheSize: 16,
      baseColor: Cesium.Color.BLACK,
    });
    function image(color) {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext("2d");
      context.fillStyle = color;
      context.fillRect(0, 0, 2, 2);
      return canvas;
    }
    function provider(color) {
      return {
        tilingScheme: world.tilingScheme,
        minimumLevel: 0,
        maximumLevel: 2,
        tileWidth: 2,
        tileHeight: 2,
        hasAlphaChannel: true,
        errorEvent: new Cesium.Event(),
        requestImage: () => Promise.resolve(image(color)),
      };
    }
    world.imageryLayers.addImageryProvider(provider("red"));
    world.imageryLayers.add(
      new Cesium.SceneGISPlanarImageryLayer(provider("blue"), { alpha: 0.5 }),
    );
    const viewer = new Cesium.Viewer("cesiumContainer", {
      world,
      useDefaultRenderLoop: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
    });
    viewer.scene.highDynamicRange = false;
    viewer.scene.pickTranslucentDepth = true;
    viewer.planarCameraController.viewHome(viewer.scene);
    for (let i = 0; i < 8; ++i) {
      viewer.render();
      await Promise.resolve();
      await Promise.resolve();
    }
    const pixel = Array.from(
      viewer.scene.context.readPixels({ x: 480, y: 270, width: 1, height: 1 }),
    );
    const windowPosition = new Cesium.Cartesian2(480, 270);
    const mathematical = world.pickFromWindowPosition(
      windowPosition,
      viewer.scene,
    );
    const depth = viewer.scene.pickPosition(windowPosition);
    const controller = viewer.planarCameraController;
    const controllerHost = viewer.scene.controllerHost;
    window.scenegisP8 = { viewer, world, controller, controllerHost };
    return {
      pixel,
      tilesLoaded: world.tilesLoaded,
      selected: world._surface._quadtree._debug.selected,
      submitted: world._surface._debug.submittedCommands,
      mathematical: mathematical && [
        mathematical.x,
        mathematical.y,
        mathematical.z,
      ],
      depth: depth && [depth.x, depth.y, depth.z],
      range: viewer.scene.camera.position.z,
      worldIdentity: viewer.scene.world === world,
      globeUndefined: viewer.scene.globe === undefined,
      controllerCount: controllerHost.controllerCount,
      controllerMatches: controllerHost._controllers.filter(
        (candidate) => candidate === controller,
      ).length,
      legacyInputs: viewer.scene.screenSpaceCameraController.enableInputs,
    };
  });

  expect(initial.pixel[0]).toBeGreaterThanOrEqual(126);
  expect(initial.pixel[2]).toBeGreaterThanOrEqual(126);
  expect(initial.tilesLoaded).toBe(true);
  expect(initial.selected).toBeGreaterThanOrEqual(16);
  expect(initial.submitted).toBeGreaterThanOrEqual(16);
  expect(initial.depth).toBeDefined();
  expect(initial.mathematical).toBeDefined();
  expect(Math.abs(initial.depth[2])).toBeLessThan(1e-3);
  expect(initial.worldIdentity).toBe(true);
  expect(initial.globeUndefined).toBe(true);
  expect(initial.controllerCount).toBe(1);
  expect(initial.controllerMatches).toBe(1);
  expect(initial.legacyInputs).toBe(false);
  expect(pageErrors).toEqual([]);

  await page.mouse.move(480, 270);
  await page.mouse.wheel(0, -120);
  const zoomed = await page.evaluate(() => {
    window.scenegisP8.viewer.render();
    return {
      range: window.scenegisP8.viewer.scene.camera.position.z,
      browserErrors: window.scenegisP8BrowserErrors,
    };
  });
  expect(zoomed.range).toBeLessThan(initial.range);
  expect(badResponses).toEqual([]);
  expect(zoomed.browserErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  const homeRange = await page.evaluate(() => {
    const { viewer } = window.scenegisP8;
    viewer.homeButton.viewModel.command();
    viewer.render();
    return viewer.scene.camera.position.z;
  });
  expect(homeRange).toBeGreaterThan(zoomed.range);
  expect(pageErrors).toEqual([]);

  const destroyed = await page.evaluate(() => {
    const { viewer, world, controller, controllerHost } = window.scenegisP8;
    const aggregator = controller._aggregator;
    viewer.destroy();
    return {
      viewer: viewer.isDestroyed(),
      world: world.isDestroyed(),
      children: document.getElementById("cesiumContainer").children.length,
      controllerCount: controllerHost.controllerCount,
      controllerAggregator: controller._aggregator,
      aggregatorDestroyed: aggregator.isDestroyed(),
    };
  });
  expect(destroyed).toEqual({
    viewer: true,
    world: true,
    children: 0,
    controllerCount: 0,
    controllerAggregator: undefined,
    aggregatorDestroyed: true,
  });
  expect(externalAttempts).toEqual([]);
  expect(badResponses).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("records the fixed release timing protocol", async ({
  cesiumPage,
  page,
}) => {
  test.skip(!process.env.release, "Release bundle timing only.");
  test.setTimeout(60000);
  const externalAttempts = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    ) {
      externalAttempts.push(request.url());
    }
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
  page.on("pageerror", (error) =>
    pageErrors.push({
      name: error.name,
      message: error.message,
      stack: error.stack,
      text: String(error),
    }),
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await cesiumPage.goto();
  const result = await page.evaluate(async () => {
    const world = new Cesium.SceneGISPlanarWorld({
      coordinateSystem: new Cesium.SceneGISPlanarCoordinateSystem({
        extent: new Cesium.SceneGISPlanarExtent({
          minimumX: -128,
          minimumY: -128,
          maximumX: 128,
          maximumY: 128,
        }),
      }),
      maximumLevel: 2,
      maximumScreenSpaceError: 0.01,
      tileCacheSize: 16,
      baseColor: Cesium.Color.BLACK,
    });
    const viewer = new Cesium.Viewer("cesiumContainer", {
      world,
      useDefaultRenderLoop: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
    });
    viewer.scene.highDynamicRange = false;
    viewer.scene.camera.setView({
      destination: new Cesium.Cartesian3(0, 0, 512),
      orientation: {
        direction: new Cesium.Cartesian3(0, 0, -1),
        up: new Cesium.Cartesian3(0, 1, 0),
      },
    });
    function image(color) {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext("2d");
      context.fillStyle = color;
      context.fillRect(0, 0, 2, 2);
      return canvas;
    }
    function provider(color) {
      return {
        tilingScheme: world.tilingScheme,
        minimumLevel: 0,
        maximumLevel: 2,
        tileWidth: 2,
        tileHeight: 2,
        hasAlphaChannel: true,
        errorEvent: new Cesium.Event(),
        requestImage: () => Promise.resolve(image(color)),
      };
    }
    function percentile(sorted, fraction) {
      return sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
      ];
    }
    function snapshotPersistent() {
      const surface = world._surface;
      return JSON.stringify({
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
      });
    }
    function assertPrecondition(label, requiresImagery) {
      const selected = world._surface._quadtree._debug.selected;
      const submitted = world._surface._debug.submittedCommands;
      if (selected < 16 || submitted < 16) {
        throw new Error(
          `${label} timing precondition failed: selected=${selected}, submitted=${submitted}.`,
        );
      }
      if (requiresImagery && !world.tilesLoaded) {
        throw new Error(
          `${label} timing precondition failed: imagery pending.`,
        );
      }
      return { selected, submitted, tilesLoaded: world.tilesLoaded };
    }
    function measure(label, requiresImagery, beforeSample) {
      const batchSize = 20;
      const runs = [];
      for (let run = 0; run < 5; ++run) {
        for (let frame = 0; frame < 120; ++frame) {
          viewer.render();
        }
        const precondition = assertPrecondition(label, requiresImagery);
        const persistent = snapshotPersistent();
        const samples = [];
        for (let sample = 0; sample < 300; ++sample) {
          beforeSample?.(sample);
          const start = performance.now();
          for (let frame = 0; frame < batchSize; ++frame) {
            viewer.render();
          }
          samples.push((performance.now() - start) / batchSize);
        }
        if (snapshotPersistent() !== persistent) {
          throw new Error(`${label} persistent counters changed while timing.`);
        }
        samples.sort((left, right) => left - right);
        runs.push({
          median: percentile(samples, 0.5),
          p95: percentile(samples, 0.95),
          max: samples[samples.length - 1],
          precondition,
        });
      }
      return runs;
    }
    viewer.render();
    const bare = measure("bare-steady", false);
    world.imageryLayers.addImageryProvider(provider("red"));
    world.imageryLayers.addImageryProvider(provider("blue"));
    for (let i = 0; i < 8; ++i) {
      viewer.render();
      await Promise.resolve();
      await Promise.resolve();
    }
    const imagery = measure("imagery-steady", true);
    for (const offset of [-32, 32]) {
      viewer.scene.camera.setView({
        destination: new Cesium.Cartesian3(offset, 0, 512),
        orientation: {
          direction: new Cesium.Cartesian3(0, 0, -1),
          up: new Cesium.Cartesian3(0, 1, 0),
        },
      });
      viewer.render();
    }
    const motion = measure("imagery-motion", true, (frame) => {
      viewer.scene.camera.setView({
        destination: new Cesium.Cartesian3(frame % 2 === 0 ? -32 : 32, 0, 512),
        orientation: {
          direction: new Cesium.Cartesian3(0, 0, -1),
          up: new Cesium.Cartesian3(0, 1, 0),
        },
      });
    });
    const gl = viewer.scene.context._gl;
    const debugRenderer = gl.getExtension("WEBGL_debug_renderer_info");
    const environment = {
      userAgent: navigator.userAgent,
      devicePixelRatio,
      drawingBuffer: [
        viewer.scene.drawingBufferWidth,
        viewer.scene.drawingBufferHeight,
      ],
      renderer: debugRenderer
        ? gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      selected: world._surface._quadtree._debug.selected,
      submitted: world._surface._debug.submittedCommands,
    };
    viewer.destroy();
    return { environment, bare, imagery, motion };
  });
  console.log(`SCENEGIS_P8_RELEASE_TIMING ${JSON.stringify(result)}`);
  expect(result.environment.selected).toBeGreaterThanOrEqual(16);
  expect(result.environment.submitted).toBeGreaterThanOrEqual(16);
  for (const scenario of [result.bare, result.imagery, result.motion]) {
    expect(scenario).toHaveLength(5);
    for (const run of scenario) {
      expect(run.precondition.selected).toBeGreaterThanOrEqual(16);
      expect(run.precondition.submitted).toBeGreaterThanOrEqual(16);
      expect(run.median).toBeGreaterThanOrEqual(0);
      expect(run.p95).toBeGreaterThanOrEqual(run.median);
      expect(run.max).toBeGreaterThanOrEqual(run.p95);
    }
  }
  expect(externalAttempts).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
