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
      enableLighting: true,
      lambertDiffuseMultiplier: 0.0,
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
    const filteredLayer = world.imageryLayers.add(
      new Cesium.SceneGISPlanarImageryLayer(provider("blue"), {
        alpha: 0.5,
        brightness: 0.5,
      }),
    );
    const material = Cesium.Material.fromType(Cesium.Material.ColorType, {
      color: Cesium.Color.fromBytes(0, 255, 0, 128),
    });
    world.material = material;
    function skyFace(color) {
      const canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 4;
      const context = canvas.getContext("2d");
      context.fillStyle = color;
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas;
    }
    const skyBox = new Cesium.SceneGISPlanarSkyBox({
      sources: {
        positiveX: skyFace("#1b2d4a"),
        negativeX: skyFace("#1b2d4a"),
        positiveY: skyFace("#1b2d4a"),
        negativeY: skyFace("#1b2d4a"),
        positiveZ: skyFace("#1b2d4a"),
        negativeZ: skyFace("#1b2d4a"),
      },
    });
    const firstTime = Cesium.JulianDate.fromIso8601("2026-06-21T00:00:00Z");
    const secondTime = Cesium.JulianDate.fromIso8601("2026-12-21T00:00:00Z");
    const environment = new Cesium.SceneGISPlanarEnvironment({
      world,
      sunDirection: Cesium.Cartesian3.UNIT_Z,
      moonDirection: Cesium.Cartesian3.UNIT_X,
      directionMode: "astronomical",
      originLongitude: 2.0943951023931953,
      originLatitude: 0.6108652381980153,
      showSun: true,
      showMoon: true,
      showAtmosphere: true,
      skyBox,
    });
    const viewer = new Cesium.Viewer("cesiumContainer", {
      world,
      useDefaultRenderLoop: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
    });
    viewer.scene.highDynamicRange = false;
    viewer.scene.rethrowRenderErrors = true;
    viewer.scene.pickTranslucentDepth = true;
    viewer.clock.shouldAnimate = false;
    viewer.clock.currentTime = Cesium.JulianDate.clone(firstTime);
    viewer.addController(environment);
    viewer.render();
    function lookAtBody(direction) {
      const right = Cesium.Cartesian3.cross(
        direction,
        Cesium.Cartesian3.UNIT_Z,
        new Cesium.Cartesian3(),
      );
      if (Cesium.Cartesian3.magnitudeSquared(right) < 1e-12) {
        Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_X, right);
      } else {
        Cesium.Cartesian3.normalize(right, right);
      }
      const up = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
        new Cesium.Cartesian3(),
      );
      viewer.scene.camera.setView({
        destination: new Cesium.Cartesian3(0, 0, 512),
        orientation: { direction, up },
      });
    }
    lookAtBody(environment.effectiveSunDirection);
    viewer.render();
    const atmosphereRenderer = world._atmosphereRenderer;
    const celestialRenderer = world._celestialBodyRenderer;
    const environmentCommands = [
      skyBox._panorama._command,
      atmosphereRenderer._command,
      celestialRenderer._sunCommand,
      celestialRenderer._moonCommand,
    ];
    const executionCounts = [0, 0, 0, 0];
    const originalExecutions = environmentCommands.map(
      (command) => command.execute,
    );
    environmentCommands.forEach((command, index) => {
      command.execute = function (...args) {
        executionCounts[index]++;
        return originalExecutions[index].apply(this, args);
      };
    });
    lookAtBody(environment.effectiveSunDirection);
    viewer.render();
    if (environment.effectiveMoonDirection.z > 0.0) {
      lookAtBody(environment.effectiveMoonDirection);
      viewer.render();
    }
    environmentCommands.forEach((command, index) => {
      command.execute = originalExecutions[index];
    });
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
    const surface = world._surface;
    const tile = surface._quadtree._renderTiles[0];
    const binding = tile.imageryBindings.get(filteredLayer);
    const effectiveSun = environment.effectiveSunDirection;
    const effectiveMoon = environment.effectiveMoonDirection;
    window.scenegisP8 = {
      viewer,
      world,
      controller,
      controllerHost,
      filteredLayer,
      material,
      environment,
      skyBox,
      secondTime,
      identities: {
        light: environment.light,
        effectiveSun,
        tile,
        surfaceCommand: tile.command,
        surfaceShader: tile.command.shaderProgram,
        surfaceVertexArray: tile.command.vertexArray,
        binding,
        texture: binding.desired.texture,
        atmosphereVertexArray: atmosphereRenderer._vertexArray,
        atmosphereShaderProgram: atmosphereRenderer._shaderProgram,
        atmosphereCommand: atmosphereRenderer._command,
        celestialVertexArray: celestialRenderer._vertexArray,
        celestialShaderProgram: celestialRenderer._shaderProgram,
        sunCommand: celestialRenderer._sunCommand,
        moonCommand: celestialRenderer._moonCommand,
        skyBoxVertexArray: skyBox._panorama._command.vertexArray,
        skyBoxShaderProgram: skyBox._panorama._command.shaderProgram,
        skyBoxCommand: skyBox._panorama._command,
      },
    };
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
      environmentMatches: controllerHost._controllers.filter(
        (candidate) => candidate === environment,
      ).length,
      legacyInputs: viewer.scene.screenSpaceCameraController.enableInputs,
      filterBrightness: filteredLayer.brightness,
      materialIdentity: world.material === material,
      materialDestroyed: material.isDestroyed(),
      environmentRegistered: world.environment === environment,
      environmentAuthority: viewer.scene.light === environment.light,
      lightDirectionMatches: Cesium.Cartesian3.equalsEpsilon(
        environment.light.direction,
        Cesium.Cartesian3.negate(effectiveSun, new Cesium.Cartesian3()),
        1e-14,
      ),
      effectiveSun: [effectiveSun.x, effectiveSun.y, effectiveSun.z],
      effectiveMoon: [effectiveMoon.x, effectiveMoon.y, effectiveMoon.z],
      showSun: environment.showSun,
      showMoon: environment.showMoon,
      showAtmosphere: environment.showAtmosphere,
      skyBoxIdentity: environment.skyBox === skyBox,
      environmentResources: {
        atmosphere: atmosphereRenderer._command !== undefined,
        sun: celestialRenderer._sunCommand !== undefined,
        moon: celestialRenderer._moonCommand !== undefined,
        skyBox: skyBox._panorama._command !== undefined,
      },
      environmentExecutions: executionCounts,
    };
  });

  expect(initial.pixel[0]).toBeGreaterThanOrEqual(15);
  expect(initial.pixel[0]).toBeLessThanOrEqual(23);
  expect(initial.pixel[1]).toBeGreaterThanOrEqual(34);
  expect(initial.pixel[1]).toBeLessThanOrEqual(42);
  expect(initial.pixel[2]).toBeGreaterThanOrEqual(6);
  expect(initial.pixel[2]).toBeLessThanOrEqual(14);
  expect(initial.tilesLoaded).toBe(true);
  expect(initial.selected).toBeGreaterThanOrEqual(16);
  expect(initial.submitted).toBeGreaterThanOrEqual(16);
  expect(initial.submitted).toBe(initial.selected);
  expect(initial.depth).toBeDefined();
  expect(initial.mathematical).toBeDefined();
  expect(Math.abs(initial.depth[2])).toBeLessThan(1e-3);
  expect(initial.worldIdentity).toBe(true);
  expect(initial.globeUndefined).toBe(true);
  expect(initial.controllerCount).toBe(2);
  expect(initial.controllerMatches).toBe(1);
  expect(initial.environmentMatches).toBe(1);
  expect(initial.legacyInputs).toBe(false);
  expect(initial.filterBrightness).toBe(0.5);
  expect(initial.materialIdentity).toBe(true);
  expect(initial.materialDestroyed).toBe(false);
  expect(initial.environmentRegistered).toBe(true);
  expect(initial.environmentAuthority).toBe(true);
  expect(initial.lightDirectionMatches).toBe(true);
  expect(initial.effectiveSun.every(Number.isFinite)).toBe(true);
  expect(initial.effectiveMoon.every(Number.isFinite)).toBe(true);
  expect(initial.showSun).toBe(true);
  expect(initial.showMoon).toBe(true);
  expect(initial.showAtmosphere).toBe(true);
  expect(initial.skyBoxIdentity).toBe(true);
  expect(initial.environmentResources).toEqual({
    atmosphere: true,
    sun: true,
    moon: true,
    skyBox: true,
  });
  expect(initial.environmentExecutions[0]).toBeGreaterThan(0);
  expect(initial.environmentExecutions[1]).toBeGreaterThan(0);
  expect(initial.environmentExecutions[2]).toBeGreaterThan(0);
  if (initial.effectiveMoon[2] > 0.0) {
    expect(initial.environmentExecutions[3]).toBeGreaterThan(0);
  } else {
    expect(initial.environmentExecutions[3]).toBe(0);
  }
  expect(pageErrors).toEqual([]);

  const timeMutation = await page.evaluate(() => {
    const {
      viewer,
      world,
      filteredLayer,
      environment,
      secondTime,
      identities,
    } = window.scenegisP8;
    viewer.clock.currentTime = Cesium.JulianDate.clone(secondTime);
    viewer.render();
    const tile = world._surface._quadtree._renderTiles[0];
    const binding = tile.imageryBindings.get(filteredLayer);
    return {
      effectiveChanged: !Cesium.Cartesian3.equalsEpsilon(
        environment.effectiveSunDirection,
        identities.effectiveSun,
        1e-14,
      ),
      light: environment.light === identities.light,
      lightAuthority: viewer.scene.light === environment.light,
      tile: tile === identities.tile,
      surfaceCommand: tile.command === identities.surfaceCommand,
      surfaceShader: tile.command.shaderProgram === identities.surfaceShader,
      surfaceVertexArray:
        tile.command.vertexArray === identities.surfaceVertexArray,
      binding: binding === identities.binding,
      texture: binding.desired.texture === identities.texture,
      atmosphere:
        world._atmosphereRenderer._vertexArray ===
          identities.atmosphereVertexArray &&
        world._atmosphereRenderer._shaderProgram ===
          identities.atmosphereShaderProgram &&
        world._atmosphereRenderer._command === identities.atmosphereCommand,
      celestial:
        world._celestialBodyRenderer._vertexArray ===
          identities.celestialVertexArray &&
        world._celestialBodyRenderer._shaderProgram ===
          identities.celestialShaderProgram &&
        world._celestialBodyRenderer._sunCommand === identities.sunCommand &&
        world._celestialBodyRenderer._moonCommand === identities.moonCommand,
      skyBox:
        environment.skyBox._panorama._command.vertexArray ===
          identities.skyBoxVertexArray &&
        environment.skyBox._panorama._command.shaderProgram ===
          identities.skyBoxShaderProgram &&
        environment.skyBox._panorama._command === identities.skyBoxCommand,
    };
  });
  expect(timeMutation).toEqual({
    effectiveChanged: true,
    light: true,
    lightAuthority: true,
    tile: true,
    surfaceCommand: true,
    surfaceShader: true,
    surfaceVertexArray: true,
    binding: true,
    texture: true,
    atmosphere: true,
    celestial: true,
    skyBox: true,
  });

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
    const {
      viewer,
      world,
      controller,
      controllerHost,
      material,
      environment,
      skyBox,
    } = window.scenegisP8;
    const aggregator = controller._aggregator;
    viewer.removeController(environment);
    const environmentRemoved =
      world.environment === undefined &&
      !controllerHost._controllers.includes(environment);
    environment.skyBox = undefined;
    const skyBoxOwnedByCaller = !skyBox.isDestroyed();
    skyBox.destroy();
    const skyBoxDestroyedByCaller = skyBox.isDestroyed();
    viewer.destroy();
    const materialOwnedByCaller = !material.isDestroyed();
    material.destroy();
    return {
      viewer: viewer.isDestroyed(),
      world: world.isDestroyed(),
      children: document.getElementById("cesiumContainer").children.length,
      controllerCount: controllerHost.controllerCount,
      controllerAggregator: controller._aggregator,
      aggregatorDestroyed: aggregator.isDestroyed(),
      materialOwnedByCaller,
      materialDestroyedByCaller: material.isDestroyed(),
      environmentRemoved,
      environmentWorldIdentity: environment.world === world,
      skyBoxOwnedByCaller,
      skyBoxDestroyedByCaller,
      browserErrors: window.scenegisP8BrowserErrors,
    };
  });
  expect(destroyed).toEqual({
    viewer: true,
    world: true,
    children: 0,
    controllerCount: 0,
    controllerAggregator: undefined,
    aggregatorDestroyed: true,
    materialOwnedByCaller: true,
    materialDestroyedByCaller: true,
    environmentRemoved: true,
    environmentWorldIdentity: true,
    skyBoxOwnedByCaller: true,
    skyBoxDestroyedByCaller: true,
    browserErrors: [],
  });
  expect(externalAttempts).toEqual([]);
  expect(badResponses).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("planar API integration qualifies unified public delivery", async ({
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

  const qualification = await page.evaluate(async () => {
    window.scenegisI5BrowserErrors = [];
    window.addEventListener("error", (event) => {
      window.scenegisI5BrowserErrors.push({
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: String(event.error),
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      window.scenegisI5BrowserErrors.push({
        rejection: String(event.reason),
        message: event.reason?.message,
        stack: event.reason?.stack,
      });
    });

    const viewer = new Cesium.Viewer("cesiumContainer", {
      planarWorld: {
        extent: {
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        },
        maximumLevel: 0,
        maximumScreenSpaceError: 0.01,
        tileCacheSize: 4,
        baseColor: Cesium.Color.LIME,
      },
      useDefaultRenderLoop: false,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      selectionIndicator: false,
      infoBox: false,
    });
    const scene = viewer.scene;
    const camera = scene.camera;
    const world = viewer.planarWorld;
    const controller = viewer.planarCameraController;
    const controllerHost = scene.controllerHost;
    scene.highDynamicRange = false;
    scene.rethrowRenderErrors = true;
    scene.pickTranslucentDepth = true;
    viewer.clock.shouldAnimate = false;
    camera.setView({
      destination: new Cesium.Cartesian3(0.0, 0.0, 256.0),
      orientation: {
        heading: 0.0,
        pitch: -Math.PI / 2.0,
        roll: 0.0,
      },
    });
    for (let i = 0; i < 8; ++i) {
      viewer.render();
      await Promise.resolve();
      await Promise.resolve();
    }

    const surface = world._surface;
    const tile = surface._quadtree._renderTiles[0];
    const command = surface._renderCommands[0];
    const shaderProgram = command.shaderProgram;
    const vertexArray = command.vertexArray;
    const initialControllerCount = controllerHost.controllerCount;
    const initialPlanarControllerMatches = controllerHost._controllers.filter(
      (candidate) => candidate === controller,
    ).length;

    const maximumOperationFrames = 120;
    function observeOperationPromise(promise) {
      const observed = {
        settled: false,
        fulfilled: false,
        value: undefined,
        reason: undefined,
      };
      promise.then(
        (value) => {
          observed.settled = true;
          observed.fulfilled = true;
          observed.value = value;
        },
        (reason) => {
          observed.settled = true;
          observed.reason = reason;
        },
      );
      return observed;
    }

    function operationDiagnostics(name, expectedOperation) {
      const currentOperation =
        viewer.cesiumWidget._sceneGISPlanarFramingOperation;
      const currentTracker = viewer.cesiumWidget._sceneGISPlanarEntityTracker;
      const dataSourceDisplay = viewer.dataSourceDisplay;
      const defaultVisualizers =
        dataSourceDisplay._defaultDataSource?._visualizers;
      const defaultPlanarVisualizerGate = defaultVisualizers?.[0];
      return JSON.stringify({
        name,
        currentOperation:
          currentOperation === undefined
            ? undefined
            : {
                isExpected: currentOperation === expectedOperation,
                settled: currentOperation.settled,
                isFlight: currentOperation.isFlight,
                entityCount: currentOperation.entities?.length,
                hasFlight: currentOperation.flight !== undefined,
              },
        cameraFlight: camera._currentFlight !== undefined,
        flightSuspensionCount: controller._flightSuspensionCount,
        dataSourceDisplayReady: dataSourceDisplay._ready,
        defaultPlanarVisualizerGate: {
          exists: defaultPlanarVisualizerGate !== undefined,
          activated: defaultPlanarVisualizerGate?._activated,
          visualizerCount: defaultVisualizers?.length,
        },
        trackedEntity: viewer.trackedEntity?.id,
        tracker:
          currentTracker === undefined
            ? undefined
            : {
                hasAuthority: currentTracker._hasAuthority,
                hasInputToken: currentTracker._inputToken !== undefined,
              },
      });
    }

    async function renderOperationFrame() {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      viewer.render();
      await Promise.resolve();
      await Promise.resolve();
    }

    async function pumpOperationPromise(name, observed, expectedOperation) {
      for (let frame = 0; frame < maximumOperationFrames; ++frame) {
        if (observed.settled) {
          if (!observed.fulfilled) {
            throw observed.reason;
          }
          return observed.value;
        }
        await renderOperationFrame();
      }
      if (observed.settled) {
        if (!observed.fulfilled) {
          throw observed.reason;
        }
        return observed.value;
      }
      throw new Error(
        `Frame pump exhausted before ${name} settled: ${operationDiagnostics(name, expectedOperation)}`,
      );
    }

    async function pumpUntilFlightPublished(name, observed, expectedOperation) {
      for (let frame = 0; frame < maximumOperationFrames; ++frame) {
        if (observed.settled) {
          if (!observed.fulfilled) {
            throw observed.reason;
          }
          throw new Error(
            `${name} settled before publishing a Camera flight: ${operationDiagnostics(name, expectedOperation)}`,
          );
        }
        await renderOperationFrame();
        const currentOperation =
          viewer.cesiumWidget._sceneGISPlanarFramingOperation;
        if (
          currentOperation === expectedOperation &&
          expectedOperation.flight === camera._currentFlight &&
          camera._currentFlight !== undefined
        ) {
          return;
        }
        if (currentOperation !== expectedOperation) {
          throw new Error(
            `${name} was replaced before publishing a Camera flight: ${operationDiagnostics(name, expectedOperation)}`,
          );
        }
      }
      throw new Error(
        `Frame pump exhausted before ${name} published a Camera flight: ${operationDiagnostics(name, expectedOperation)}`,
      );
    }

    camera.viewBoundingSphere(
      new Cesium.BoundingSphere(new Cesium.Cartesian3(16.0, 8.0, 0.0), 12.0),
      new Cesium.HeadingPitchRange(0.25, -0.8, 64.0),
    );
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    camera.flyTo({
      destination: new Cesium.Cartesian3(32.0, -16.0, 128.0),
      orientation: { heading: 0.4, pitch: -0.9, roll: 0.1 },
      duration: 1.0,
    });
    const directFlightStarted = camera._currentFlight !== undefined;
    camera.completeFlight();
    const directFlightCompleted =
      camera._currentFlight === undefined &&
      controller._flightSuspensionCount === 0 &&
      Cesium.Cartesian3.equalsEpsilon(
        camera.positionWC,
        new Cesium.Cartesian3(32.0, -16.0, 128.0),
        1e-12,
      );
    const beforeCancelledFlight = Cesium.Cartesian3.clone(camera.positionWC);
    camera.flyTo({
      destination: new Cesium.Cartesian3(-32.0, 16.0, 96.0),
      duration: 1.0,
    });
    camera.cancelFlight();
    const directFlightCancelled =
      camera._currentFlight === undefined &&
      controller._flightSuspensionCount === 0 &&
      Cesium.Cartesian3.equalsEpsilon(
        camera.positionWC,
        beforeCancelledFlight,
        1e-12,
      );
    camera.flyHome(1.0);
    camera.completeFlight();
    const expectedHomePosition = Cesium.Cartesian3.clone(camera.positionWC);
    const expectedHomeDirection = Cesium.Cartesian3.clone(camera.directionWC);
    const expectedHomeUp = Cesium.Cartesian3.clone(camera.upWC);

    const framingEntity = viewer.entities.add({
      id: "i5-framing-entity",
      position: new Cesium.Cartesian3(24.0, 16.0, 8.0),
      point: { pixelSize: 12.0, color: Cesium.Color.YELLOW },
    });
    const framingDataSource = new Cesium.CustomDataSource(
      "i5-framing-data-source",
    );
    framingDataSource.entities.add({
      id: "i5-framing-west",
      position: new Cesium.Cartesian3(-32.0, -16.0, 4.0),
      point: { pixelSize: 10.0, color: Cesium.Color.CYAN },
    });
    framingDataSource.entities.add({
      id: "i5-framing-east",
      position: new Cesium.Cartesian3(40.0, 24.0, 12.0),
      point: { pixelSize: 10.0, color: Cesium.Color.BLUE },
    });
    await viewer.dataSources.add(framingDataSource);
    for (let i = 0; i < 3; ++i) {
      viewer.render();
      await Promise.resolve();
    }
    const zoomPromise = viewer.zoomTo(
      framingEntity,
      new Cesium.HeadingPitchRange(0.0, -Math.PI / 2.0, 80.0),
    );
    const zoomOperation = viewer.cesiumWidget._sceneGISPlanarFramingOperation;
    const observedZoom = observeOperationPromise(zoomPromise);
    const entityZoomed = await pumpOperationPromise(
      "Entity zoomTo",
      observedZoom,
      zoomOperation,
    );
    const dataSourceFlight = viewer.flyTo(framingDataSource, {
      duration: 1.0,
      offset: new Cesium.HeadingPitchRange(0.2, -0.8, 96.0),
    });
    const dataSourceOperation =
      viewer.cesiumWidget._sceneGISPlanarFramingOperation;
    const observedDataSourceFlight = observeOperationPromise(dataSourceFlight);
    await pumpUntilFlightPublished(
      "DataSource flyTo",
      observedDataSourceFlight,
      dataSourceOperation,
    );
    const framingFlightStarted =
      viewer.cesiumWidget._sceneGISPlanarFramingOperation ===
        dataSourceOperation &&
      dataSourceOperation.flight === camera._currentFlight &&
      camera._currentFlight !== undefined;
    camera.completeFlight();
    const dataSourceFlew = await pumpOperationPromise(
      "DataSource flyTo completion",
      observedDataSourceFlight,
      dataSourceOperation,
    );

    const trackingEpoch = Cesium.JulianDate.fromIso8601("2026-08-14T00:00:00Z");
    const trackingPosition = new Cesium.CallbackPositionProperty(
      (time, result) => {
        const seconds = Cesium.JulianDate.secondsDifference(
          time,
          trackingEpoch,
        );
        return Cesium.Cartesian3.fromElements(
          -16.0 + seconds,
          8.0,
          6.0,
          result,
        );
      },
      false,
      Cesium.ReferenceFrame.FIXED,
    );
    const trackingEntity = viewer.entities.add({
      id: "i5-tracking-entity",
      position: trackingPosition,
      trackingReferenceFrame: Cesium.TrackingReferenceFrame.AUTODETECT,
      viewFrom: new Cesium.Cartesian3(0.0, -48.0, 40.0),
      point: { pixelSize: 12.0, color: Cesium.Color.ORANGE },
    });
    viewer.clock.currentTime = Cesium.JulianDate.clone(trackingEpoch);
    viewer.trackedEntity = trackingEntity;
    viewer.render();
    const trackedStart = Cesium.Cartesian3.clone(camera.positionWC);
    viewer.clock.currentTime = Cesium.JulianDate.addSeconds(
      trackingEpoch,
      12.0,
      new Cesium.JulianDate(),
    );
    viewer.render();
    const trackedEnd = Cesium.Cartesian3.clone(camera.positionWC);
    const tracker = viewer.cesiumWidget._sceneGISPlanarEntityTracker;
    const trackingMoved = !Cesium.Cartesian3.equalsEpsilon(
      trackedStart,
      trackedEnd,
      1e-12,
    );
    const beforeSuppressedWheel = Cesium.Cartesian3.clone(camera.positionWC);
    viewer.canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -120.0, bubbles: true }),
    );
    viewer.render();
    const trackingSuppressedInput = Cesium.Cartesian3.equalsEpsilon(
      camera.positionWC,
      beforeSuppressedWheel,
      1e-12,
    );
    viewer.trackedEntity = undefined;
    viewer.render();
    const beforeRestoredWheel = Cesium.Cartesian3.clone(camera.positionWC);
    viewer.canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -120.0, bubbles: true }),
    );
    viewer.render();
    const trackingRestoredInput = !Cesium.Cartesian3.equalsEpsilon(
      camera.positionWC,
      beforeRestoredWheel,
      1e-12,
    );
    viewer.trackedEntity = trackingEntity;
    viewer.render();
    const trackingClearPromise = viewer.zoomTo(framingEntity);
    const trackingClearOperation =
      viewer.cesiumWidget._sceneGISPlanarFramingOperation;
    const observedTrackingClear = observeOperationPromise(trackingClearPromise);
    const framingClearedTracking =
      (await pumpOperationPromise(
        "tracking-clear Entity zoomTo",
        observedTrackingClear,
        trackingClearOperation,
      )) && viewer.trackedEntity === undefined;
    viewer.trackedEntity = trackingEntity;
    viewer.render();
    viewer.homeButton.viewModel.command();
    const homeClearedTracking = viewer.trackedEntity === undefined;
    const homeStayedFlightFree =
      camera._currentFlight === undefined &&
      controller._flightSuspensionCount === 0;
    const homeApplied =
      Cesium.Cartesian3.equalsEpsilon(
        camera.positionWC,
        expectedHomePosition,
        1e-12,
      ) &&
      Cesium.Cartesian3.equalsEpsilon(
        camera.directionWC,
        expectedHomeDirection,
        1e-12,
      ) &&
      Cesium.Cartesian3.equalsEpsilon(camera.upWC, expectedHomeUp, 1e-12);

    function throwsDeveloperError(callback) {
      try {
        callback();
        return false;
      } catch (error) {
        return error instanceof Cesium.DeveloperError;
      }
    }
    const sample = { longitude: 1.0, latitude: 2.0, height: 3.0 };
    const samples = [sample];
    const clampPosition = new Cesium.Cartesian3(1.0, 2.0, 3.0);
    const clampPositions = [clampPosition];
    const clampResult = new Cesium.Cartesian3(4.0, 5.0, 6.0);
    const heightGuards = [
      throwsDeveloperError(() => scene.sampleHeight(sample)),
      throwsDeveloperError(() => scene.sampleHeightMostDetailed(samples)),
      throwsDeveloperError(() =>
        scene.clampToHeight(clampPosition, undefined, undefined, clampResult),
      ),
      throwsDeveloperError(() =>
        scene.clampToHeightMostDetailed(clampPositions),
      ),
    ];
    const cameraPosition = Cesium.Cartesian3.clone(camera.positionWC);
    const cameraDirection = Cesium.Cartesian3.clone(camera.directionWC);
    const cartesianResult = new Cesium.Cartesian3(7.0, 8.0, 9.0);
    const rectangleResult = new Cesium.Rectangle(0.1, 0.2, 0.3, 0.4);
    const cameraGuards = [
      throwsDeveloperError(() =>
        camera.getRectangleCameraCoordinates(
          Cesium.Rectangle.MAX_VALUE,
          cartesianResult,
        ),
      ),
      throwsDeveloperError(() =>
        camera.pickEllipsoid(
          new Cesium.Cartesian2(480.0, 270.0),
          undefined,
          cartesianResult,
        ),
      ),
      throwsDeveloperError(() =>
        camera.computeViewRectangle(undefined, rectangleResult),
      ),
    ];
    const guardInputsUnchanged =
      samples.length === 1 &&
      samples[0] === sample &&
      clampPositions.length === 1 &&
      clampPositions[0] === clampPosition &&
      Cesium.Cartesian3.equals(clampResult, new Cesium.Cartesian3(4, 5, 6)) &&
      Cesium.Cartesian3.equals(
        cartesianResult,
        new Cesium.Cartesian3(7, 8, 9),
      ) &&
      Cesium.Rectangle.equals(
        rectangleResult,
        new Cesium.Rectangle(0.1, 0.2, 0.3, 0.4),
      ) &&
      Cesium.Cartesian3.equals(camera.positionWC, cameraPosition) &&
      Cesium.Cartesian3.equals(camera.directionWC, cameraDirection);

    const removeLateFog = scene.preRender.addEventListener(() => {
      removeLateFog();
      scene.fog.enabled = true;
    });
    const showRenderLoopErrors = viewer.cesiumWidget._showRenderLoopErrors;
    let fogRejected = false;
    let fogErrorPanelRestored;
    viewer.cesiumWidget._showRenderLoopErrors = false;
    try {
      try {
        viewer.render();
      } catch (error) {
        fogRejected = error instanceof Cesium.DeveloperError;
      }
    } finally {
      viewer.cesiumWidget._showRenderLoopErrors = showRenderLoopErrors;
      fogErrorPanelRestored =
        viewer.cesiumWidget._showRenderLoopErrors === showRenderLoopErrors;
    }
    scene.fog.enabled = false;
    viewer.render();

    camera.setView({
      destination: new Cesium.Cartesian3(0.0, 0.0, 256.0),
      orientation: {
        heading: 0.0,
        pitch: -Math.PI / 2.0,
        roll: 0.0,
      },
    });
    viewer.render();
    const center = new Cesium.Cartesian2(480.0, 270.0);
    const terrain = world.pickFromWindowPosition(center, scene);
    const canvas = scene.cartesianToCanvasCoordinates(terrain);
    const ray = camera.getPickRay(center);
    const depth = scene.pickPositionSupported
      ? scene.pickPosition(center)
      : undefined;
    const currentTile = surface._quadtree._renderTiles[0];
    const currentCommand = surface._renderCommands[0];
    const warmResources =
      currentTile === tile &&
      currentCommand === command &&
      currentCommand.shaderProgram === shaderProgram &&
      currentCommand.vertexArray === vertexArray;
    const noStaleAuthority =
      camera._currentFlight === undefined &&
      controller._flightSuspensionCount === 0 &&
      controller._trackingSuspensionCount === 0 &&
      viewer.cesiumWidget._sceneGISPlanarFramingOperation === undefined &&
      tracker._inputToken === undefined;
    const planarControllerMatches = controllerHost._controllers.filter(
      (candidate) => candidate === controller,
    ).length;
    const controllerCountBeforeDestroy = controllerHost.controllerCount;
    const aggregator = controller._aggregator;
    window.scenegisI5 = {
      viewer,
      world,
      controller,
      controllerHost,
      aggregator,
    };

    return {
      worldIdentity: scene.world === world,
      declarativeWorldIdentity: viewer.planarWorld === world,
      globeUndefined: scene.globe === undefined,
      initialControllerCount,
      initialPlanarControllerMatches,
      planarControllerMatches,
      controllerCountBeforeDestroy,
      legacyInputs: scene.screenSpaceCameraController.enableInputs,
      tilesLoaded: world.tilesLoaded,
      directFlightStarted,
      directFlightCompleted,
      directFlightCancelled,
      entityZoomed,
      framingFlightStarted,
      dataSourceFlew,
      trackingMoved,
      trackingSuppressedInput,
      trackingRestoredInput,
      framingClearedTracking,
      homeClearedTracking,
      homeApplied,
      homeStayedFlightFree,
      capabilityFlags: [
        scene.sampleHeightSupported,
        scene.clampToHeightSupported,
      ],
      heightGuards,
      cameraGuards,
      guardInputsUnchanged,
      fogRejected,
      fogErrorPanelRestored,
      fogRecovered: scene.fog.enabled === false,
      cartesianQualification:
        terrain !== undefined &&
        canvas !== undefined &&
        Number.isFinite(canvas.x) &&
        Number.isFinite(canvas.y) &&
        ray !== undefined &&
        (!scene.pickPositionSupported || depth !== undefined),
      warmResources,
      noStaleAuthority,
      browserErrors: window.scenegisI5BrowserErrors,
    };
  });

  expect(qualification).toEqual({
    worldIdentity: true,
    declarativeWorldIdentity: true,
    globeUndefined: true,
    initialControllerCount: 1,
    initialPlanarControllerMatches: 1,
    planarControllerMatches: 1,
    controllerCountBeforeDestroy: 2,
    legacyInputs: false,
    tilesLoaded: true,
    directFlightStarted: true,
    directFlightCompleted: true,
    directFlightCancelled: true,
    entityZoomed: true,
    framingFlightStarted: true,
    dataSourceFlew: true,
    trackingMoved: true,
    trackingSuppressedInput: true,
    trackingRestoredInput: true,
    framingClearedTracking: true,
    homeClearedTracking: true,
    homeApplied: true,
    homeStayedFlightFree: true,
    capabilityFlags: [false, false],
    heightGuards: [true, true, true, true],
    cameraGuards: [true, true, true],
    guardInputsUnchanged: true,
    fogRejected: true,
    fogErrorPanelRestored: true,
    fogRecovered: true,
    cartesianQualification: true,
    warmResources: true,
    noStaleAuthority: true,
    browserErrors: [],
  });

  const destroyed = await page.evaluate(() => {
    const { viewer, world, controller, controllerHost, aggregator } =
      window.scenegisI5;
    viewer.destroy();
    return {
      viewer: viewer.isDestroyed(),
      world: world.isDestroyed(),
      children: document.getElementById("cesiumContainer").children.length,
      controllerCount: controllerHost.controllerCount,
      controllerAggregator: controller._aggregator,
      aggregatorDestroyed: aggregator.isDestroyed(),
      browserErrors: window.scenegisI5BrowserErrors,
    };
  });
  expect(destroyed).toEqual({
    viewer: true,
    world: true,
    children: 0,
    controllerCount: 0,
    controllerAggregator: undefined,
    aggregatorDestroyed: true,
    browserErrors: [],
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
