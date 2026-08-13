import {
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  DirectionalLight,
  Event,
  JulianDate,
  OrthographicFrustum,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
  SceneMode,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidget", function () {
  let container;
  let widget;
  let environment;

  function createSolidImage(cssColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    context.fillStyle = cssColor;
    context.fillRect(0, 0, 2, 2);
    return canvas;
  }

  function createWorld() {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.WHITE,
      enableLighting: true,
      lambertDiffuseMultiplier: 1.0,
    });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([0.0, 96.0, 0.0, 96.0]),
      width: 2,
      height: 2,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0.0,
      maximumHeight: 96.0,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 1.0,
      requestTileGeometry: () => Promise.resolve(terrainData),
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    const layer = world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
      tileWidth: 2,
      tileHeight: 2,
      hasAlphaChannel: false,
      errorEvent: new Event(),
      credit: undefined,
      requestImage: () => Promise.resolve(createSolidImage("white")),
    });
    return { world, layer };
  }

  function createWidget(world) {
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      requestRenderMode: true,
      contextOptions,
    });
    widget.scene.rethrowRenderErrors = true;
    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 400.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });
  }

  function renderFrame(time) {
    widget.scene.initializeFrame();
    widget.scene.render(time);
  }

  function readCenterPixel() {
    return widget.scene.context.readPixels({
      x: Math.floor(widget.scene.drawingBufferWidth / 2),
      y: Math.floor(widget.scene.drawingBufferHeight / 2),
      width: 1,
      height: 1,
    });
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "64px";
    container.style.height = "64px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (
      widget &&
      environment &&
      widget.scene.world.environment === environment
    ) {
      widget.removeController(environment);
    }
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    environment = undefined;
    document.body.removeChild(container);
  });

  it("requests and publishes late first authority in the same host frame", async function () {
    const { world } = createWorld();
    createWidget(world);
    await pollToPromise(function () {
      renderFrame();
      return world.tilesLoaded && world._surface._renderCommands.length === 1;
    });
    renderFrame();
    expect(widget.scene._renderRequested).toBe(false);

    const displacedLight = widget.scene.light;
    const requestRender = spyOn(
      widget.scene,
      "requestRender",
    ).and.callThrough();
    environment = new SceneGISPlanarEnvironment({
      world,
      sunDirection: Cartesian3.UNIT_Z,
      moonDirection: Cartesian3.UNIT_X,
    });
    widget.addController(environment);
    expect(requestRender).not.toHaveBeenCalled();
    expect(widget.scene.light).toBe(displacedLight);

    renderFrame();
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(widget.scene.light).toBe(environment.light);
    expect(world._frameState.light).toBe(environment.light);
    expect(widget.scene._renderRequested).toBe(false);

    renderFrame();
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(widget.scene.light).toBe(environment.light);
    expect(world._frameState.light).toBe(environment.light);
  });

  it("draws explicit signed directions and keeps terrain resources warm", async function () {
    const { world, layer } = createWorld();
    createWidget(world);
    const displacedLight = widget.scene.light;
    environment = new SceneGISPlanarEnvironment({
      world,
      sunDirection: new Cartesian3(-1.0, 0.0, 1.0),
      moonDirection: new Cartesian3(0.0, -1.0, 1.0),
    });
    widget.addController(environment);

    await pollToPromise(function () {
      renderFrame();
      return world.tilesLoaded && world._surface._renderCommands.length === 1;
    });
    expect(widget.scene.light).toBe(environment.light);
    expect(environment.light.direction).toEqual(
      Cartesian3.negate(environment.sunDirection, new Cartesian3()),
    );
    const firstPixel = readCenterPixel();
    const surface = world._surface;
    const tile = surface._quadtree._renderTiles[0];
    const binding = tile.imageryBindings.get(layer);
    const identities = {
      tile,
      command: tile.command,
      shader: tile.command.shaderProgram,
      vertexArray: tile.command.vertexArray,
      mesh: tile.terrainEntry.activeContent.mesh,
      binding,
      texture: binding.desired.texture,
    };
    function expectWarm() {
      expect(surface._quadtree._renderTiles).toEqual([identities.tile]);
      expect(surface._renderCommands).toEqual([identities.command]);
      expect(tile.command.shaderProgram).toBe(identities.shader);
      expect(tile.command.vertexArray).toBe(identities.vertexArray);
      expect(tile.terrainEntry.activeContent.mesh).toBe(identities.mesh);
      expect(tile.imageryBindings.get(layer)).toBe(identities.binding);
      expect(binding.desired.texture).toBe(identities.texture);
    }

    const requestRender = spyOn(
      widget.scene,
      "requestRender",
    ).and.callThrough();
    environment.sunDirection = new Cartesian3(1.0, 0.0, 1.0);
    expect(requestRender).toHaveBeenCalledTimes(1);
    renderFrame();
    const oppositePixel = readCenterPixel();
    expect(oppositePixel[0]).not.toBeCloseTo(firstPixel[0], -1);
    expectWarm();
    expect(requestRender).toHaveBeenCalledTimes(1);

    environment.sunColor = new Color(0.25, 1.0, 0.25, 1.0);
    environment.sunIntensity = 0.5;
    expect(requestRender).toHaveBeenCalledTimes(3);
    renderFrame();
    const colorPixel = readCenterPixel();
    expect(colorPixel[1]).toBeGreaterThan(colorPixel[0]);
    expect(colorPixel[1]).toBeGreaterThan(colorPixel[2]);
    expectWarm();

    const beforeMoon = Cartesian3.clone(environment.light.direction);
    environment.moonDirection = Cartesian3.UNIT_Z;
    expect(requestRender).toHaveBeenCalledTimes(4);
    renderFrame();
    expect(environment.light.direction).toEqual(beforeMoon);
    expect(readCenterPixel()).toEqual(colorPixel);
    expectWarm();

    widget.removeController(environment);
    expect(widget.scene.light).toBe(displacedLight);
    environment = undefined;
  });

  it("conditionally releases and reacquires scene-wide light authority", function () {
    const { world } = createWorld();
    createWidget(world);
    const original = widget.scene.light;
    environment = new SceneGISPlanarEnvironment({
      world,
      sunDirection: Cartesian3.UNIT_Z,
      moonDirection: Cartesian3.UNIT_X,
    });
    widget.addController(environment);
    renderFrame();
    expect(widget.scene.light).toBe(environment.light);
    expect(world.environment).toBe(environment);

    environment.enabled = false;
    expect(widget.scene.light).toBe(original);
    expect(world.environment).toBe(environment);
    environment.sunIntensity = 0.25;
    const replacement = new DirectionalLight({ direction: Cartesian3.UNIT_Y });
    widget.scene.light = replacement;
    environment.enabled = true;
    expect(widget.scene.light).toBe(environment.light);
    expect(environment.light.intensity).toBe(0.25);

    widget.scene.light = replacement;
    environment.enabled = false;
    expect(widget.scene.light).toBe(replacement);
    environment.enabled = true;
    expect(widget.scene.light).toBe(environment.light);
    widget.removeController(environment);
    expect(widget.scene.light).toBe(replacement);
    expect(world.environment).toBeUndefined();
    environment = undefined;
  });

  it("draws astronomical directions from host time and keeps resources warm", async function () {
    const { world, layer } = createWorld();
    createWidget(world);
    const firstTime = JulianDate.fromIso8601("2026-06-21T00:00:00Z");
    const secondTime = JulianDate.fromIso8601("2026-12-21T00:00:00Z");
    environment = new SceneGISPlanarEnvironment({
      world,
      sunDirection: Cartesian3.UNIT_Z,
      moonDirection: Cartesian3.UNIT_X,
      directionMode: "astronomical",
      originLongitude: 2.0943951023931953,
      originLatitude: 0.6108652381980153,
    });
    widget.addController(environment);

    await pollToPromise(function () {
      renderFrame(firstTime);
      return world.tilesLoaded && world._surface._renderCommands.length === 1;
    });
    const firstSun = environment.effectiveSunDirection;
    const firstMoon = environment.effectiveMoonDirection;
    expect(firstSun.x).toBeCloseTo(0.7948554945506935, 13);
    expect(firstSun.y).toBeCloseTo(0.0628769289415441, 13);
    expect(firstSun.z).toBeCloseTo(0.6035322978842579, 13);
    expect(environment.light.direction).toEqual(
      Cartesian3.negate(firstSun, new Cartesian3()),
    );
    const firstPixel = readCenterPixel();
    const surface = world._surface;
    const tile = surface._quadtree._renderTiles[0];
    const binding = tile.imageryBindings.get(layer);
    const identities = {
      tile,
      command: tile.command,
      shader: tile.command.shaderProgram,
      vertexArray: tile.command.vertexArray,
      mesh: tile.terrainEntry.activeContent.mesh,
      binding,
      texture: binding.desired.texture,
      light: environment.light,
    };
    function expectWarm() {
      expect(surface._quadtree._renderTiles).toEqual([identities.tile]);
      expect(surface._renderCommands).toEqual([identities.command]);
      expect(tile.command.shaderProgram).toBe(identities.shader);
      expect(tile.command.vertexArray).toBe(identities.vertexArray);
      expect(tile.terrainEntry.activeContent.mesh).toBe(identities.mesh);
      expect(tile.imageryBindings.get(layer)).toBe(identities.binding);
      expect(binding.desired.texture).toBe(identities.texture);
      expect(environment.light).toBe(identities.light);
      expect(surface._renderCommands.length).toBe(1);
    }

    const requestRender = spyOn(
      widget.scene,
      "requestRender",
    ).and.callThrough();
    renderFrame(firstTime);
    expect(requestRender).not.toHaveBeenCalled();
    expect(environment.effectiveSunDirection).toEqual(firstSun);
    expect(environment.effectiveMoonDirection).toEqual(firstMoon);
    expectWarm();

    renderFrame(secondTime);
    const secondSun = environment.effectiveSunDirection;
    const secondMoon = environment.effectiveMoonDirection;
    const secondPixel = readCenterPixel();
    expect(secondSun).not.toEqual(firstSun);
    expect(secondMoon).not.toEqual(firstMoon);
    expect(secondPixel[0]).not.toBeCloseTo(firstPixel[0], -1);
    expect(requestRender).toHaveBeenCalledTimes(1);
    expectWarm();

    environment.originLongitude = 2.0;
    expect(requestRender).toHaveBeenCalledTimes(2);
    renderFrame(secondTime);
    expect(environment.effectiveSunDirection).not.toEqual(secondSun);
    expect(requestRender).toHaveBeenCalledTimes(2);
    expectWarm();

    environment.sunDirection = new Cartesian3(-1.0, 0.0, 1.0);
    expect(requestRender).toHaveBeenCalledTimes(2);
    environment.directionMode = "manual";
    expect(requestRender).toHaveBeenCalledTimes(3);
    renderFrame(secondTime);
    expect(environment.effectiveSunDirection).toEqual(environment.sunDirection);
    expect(environment.effectiveMoonDirection).toEqual(
      environment.moonDirection,
    );
    expect(environment.light.direction).toEqual(
      Cartesian3.negate(environment.sunDirection, new Cartesian3()),
    );
    expectWarm();
  });

  it("moves a visible astronomical body with native host Clock time", async function () {
    const { world } = createWorld();
    createWidget(world);
    const firstTime = JulianDate.fromIso8601("2026-06-21T00:00:00Z");
    const secondTime = JulianDate.fromIso8601("2026-12-21T00:00:00Z");
    environment = new SceneGISPlanarEnvironment({
      world,
      sunDirection: Cartesian3.UNIT_Z,
      moonDirection: Cartesian3.UNIT_X,
      directionMode: "astronomical",
      originLongitude: 2.0943951023931953,
      originLatitude: 0.6108652381980153,
      showSun: true,
      sunPixelSize: 8.0,
    });
    widget.clock.shouldAnimate = false;
    widget.clock.currentTime = JulianDate.clone(firstTime);
    widget.addController(environment);
    widget.render();
    const firstSun = environment.effectiveSunDirection;
    const celestialUp = Cartesian3.normalize(
      Cartesian3.cross(firstSun, Cartesian3.UNIT_X, new Cartesian3()),
      new Cartesian3(),
    );
    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 400.0),
      orientation: { direction: firstSun, up: celestialUp },
    });
    await pollToPromise(function () {
      widget.render();
      return world._celestialBodyRenderer._shaderProgram !== undefined;
    });
    const renderer = world._celestialBodyRenderer;
    const identities = {
      vertexArray: renderer._vertexArray,
      shaderProgram: renderer._shaderProgram,
      command: renderer._sunCommand,
    };
    const firstCenter = renderer._sun.center.x;
    const firstPixel = readCenterPixel();
    expect(firstPixel[0]).toBeGreaterThan(0);

    const requestRender = spyOn(
      widget.scene,
      "requestRender",
    ).and.callThrough();
    const firstPublishedTime = JulianDate.clone(environment._publishedTime);
    widget.render();
    expect(requestRender).not.toHaveBeenCalled();
    expect(environment.effectiveSunDirection).toEqual(firstSun);
    expect(environment._publishedTime).toEqual(firstPublishedTime);
    expect(renderer._sun.center.x).toBe(firstCenter);
    expect(renderer._vertexArray).toBe(identities.vertexArray);
    expect(renderer._shaderProgram).toBe(identities.shaderProgram);
    expect(renderer._sunCommand).toBe(identities.command);

    widget.clock.currentTime = JulianDate.clone(secondTime);
    widget.render();
    const secondSun = environment.effectiveSunDirection;
    const secondCenter = renderer._sun.center.x;
    const secondPublishedTime = JulianDate.clone(environment._publishedTime);
    expect(secondSun).not.toEqual(firstSun);
    expect(secondCenter).not.toBeCloseTo(firstCenter, 3);
    expect(readCenterPixel()).not.toEqual(firstPixel);
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(renderer._vertexArray).toBe(identities.vertexArray);
    expect(renderer._shaderProgram).toBe(identities.shaderProgram);
    expect(renderer._sunCommand).toBe(identities.command);

    widget.render();
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(environment.effectiveSunDirection).toEqual(secondSun);
    expect(environment._publishedTime).toEqual(secondPublishedTime);
    expect(renderer._sun.center.x).toBe(secondCenter);
    expect(renderer._vertexArray).toBe(identities.vertexArray);
    expect(renderer._shaderProgram).toBe(identities.shaderProgram);
    expect(renderer._sunCommand).toBe(identities.command);
  });

  it("keeps a visible body behind foreground resident terrain", async function () {
    const { world } = createWorld();
    world.enableLighting = false;
    createWidget(world);
    await pollToPromise(function () {
      renderFrame();
      return world.tilesLoaded && world._surface._renderCommands.length === 1;
    });

    const samples = [
      new Cartesian3(-64.0, -64.0, 0.0),
      new Cartesian3(64.0, -64.0, 0.0),
      new Cartesian3(-64.0, 64.0, 0.0),
      new Cartesian3(64.0, 64.0, 0.0),
    ].map((position) => ({
      position,
      height: world.getTerrainHeight(position),
    }));
    samples.sort((left, right) => left.height - right.height);
    const low = samples[0];
    const high = samples[samples.length - 1];
    expect(high.height).toBeGreaterThan(low.height + 5.0);
    const cameraPosition = new Cartesian3(
      low.position.x,
      low.position.y,
      low.height + 5.0,
    );
    const target = new Cartesian3(
      high.position.x,
      high.position.y,
      high.height,
    );
    const bodyDirection = Cartesian3.normalize(
      Cartesian3.subtract(target, cameraPosition, new Cartesian3()),
      new Cartesian3(),
    );
    const right = Cartesian3.normalize(
      Cartesian3.cross(bodyDirection, Cartesian3.UNIT_Z, new Cartesian3()),
      new Cartesian3(),
    );
    const up = Cartesian3.normalize(
      Cartesian3.cross(right, bodyDirection, new Cartesian3()),
      new Cartesian3(),
    );
    widget.scene.camera.setView({
      destination: cameraPosition,
      orientation: { direction: bodyDirection, up },
    });
    widget.scene.requestRender();
    renderFrame();
    const foregroundPixel = readCenterPixel();

    environment = new SceneGISPlanarEnvironment({
      world,
      sunDirection: bodyDirection,
      moonDirection: bodyDirection,
      sunColor: Color.RED,
      showSun: true,
      sunPixelSize: 40.0,
    });
    widget.addController(environment);
    await pollToPromise(function () {
      renderFrame();
      return world._celestialBodyRenderer._sunCommand !== undefined;
    });
    expect(world._celestialBodyRenderer._sun.center.x).toBeCloseTo(0.0, 12);
    expect(world._celestialBodyRenderer._sun.center.y).toBeCloseTo(0.0, 12);
    expect(readCenterPixel()).toEqual(foregroundPixel);
  });

  it("draws opt-in procedural bodies with warm shared resources", async function () {
    const { world } = createWorld();
    createWidget(world);
    await pollToPromise(function () {
      renderFrame();
      return world.tilesLoaded && world._surface._renderCommands.length === 1;
    });
    const terrainPosition = new Cartesian3(-64.0, -64.0, 0.0);
    const residentTerrainHeight = world.getTerrainHeight(terrainPosition);
    expect(Number.isFinite(residentTerrainHeight)).toBe(true);
    const direction = Cartesian3.normalize(
      new Cartesian3(0.0, 1.0, 1.0),
      new Cartesian3(),
    );
    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, -100.0, 100.0),
      orientation: {
        direction,
        up: Cartesian3.normalize(
          new Cartesian3(0.0, -1.0, 1.0),
          new Cartesian3(),
        ),
      },
    });
    environment = new SceneGISPlanarEnvironment({
      world,
      sunDirection: direction,
      moonDirection: direction,
      showSun: true,
      showMoon: true,
      sunPixelSize: 24.0,
      moonPixelSize: 16.0,
    });
    widget.addController(environment);

    await pollToPromise(function () {
      renderFrame();
      return world._celestialBodyRenderer._shaderProgram !== undefined;
    });
    const renderer = world._celestialBodyRenderer;
    const identities = {
      vertexArray: renderer._vertexArray,
      shaderProgram: renderer._shaderProgram,
      sunCommand: renderer._sunCommand,
      moonCommand: renderer._moonCommand,
    };
    const center = readCenterPixel();
    expect(center[0]).toBeGreaterThan(0);
    expect(center[3]).toBe(255);

    const perspective = widget.scene.camera.frustum;
    const orthographic = new OrthographicFrustum({
      width: 200.0,
      aspectRatio: 1.0,
      near: 1.0,
      far: 1000000.0,
    });
    for (const frustum of [perspective, orthographic]) {
      widget.scene.camera.frustum = frustum;
      renderFrame();
      expect(readCenterPixel()[0]).toBeGreaterThan(0);
    }
    widget.scene.camera.frustum = perspective;

    environment.sunPixelSize = 30.0;
    environment.moonColor = Color.RED;
    renderFrame();
    expect(renderer._vertexArray).toBe(identities.vertexArray);
    expect(renderer._shaderProgram).toBe(identities.shaderProgram);
    expect(renderer._sunCommand).toBe(identities.sunCommand);
    expect(renderer._moonCommand).toBe(identities.moonCommand);

    expect(renderer._sunCommand.renderState.depthTest.enabled).toBe(false);
    expect(renderer._sunCommand.renderState.depthMask).toBe(false);

    spyOn(renderer._sunCommand, "execute");
    spyOn(renderer._moonCommand, "execute");
    const originalSun = widget.scene.sun;
    const originalMoon = widget.scene.moon;
    widget.scene.sun = {
      show: false,
      update: jasmine.createSpy("nativeSunUpdate"),
      destroy: jasmine.createSpy("nativeSunDestroy"),
    };
    widget.scene.moon = {
      show: false,
      update: jasmine.createSpy("nativeMoonUpdate"),
      destroy: jasmine.createSpy("nativeMoonDestroy"),
    };
    function expectWarmBodies() {
      expect(renderer._vertexArray).toBe(identities.vertexArray);
      expect(renderer._shaderProgram).toBe(identities.shaderProgram);
      expect(renderer._sunCommand).toBe(identities.sunCommand);
      expect(renderer._moonCommand).toBe(identities.moonCommand);
    }

    const pickPosition = new Cartesian2(32.0, 32.0);
    const commandListLength = widget.scene.frameState.commandList.length;
    const pickBefore = widget.scene.pick(pickPosition);
    const depthBefore = widget.scene.pickPosition(pickPosition);
    expect(widget.scene.pick(pickPosition)).toEqual(pickBefore);
    expect(widget.scene.pickPosition(pickPosition)).toEqual(depthBefore);
    expect(renderer._sunCommand.execute).not.toHaveBeenCalled();
    expect(renderer._moonCommand.execute).not.toHaveBeenCalled();
    expect(widget.scene.frameState.commandList.length).toBe(commandListLength);

    function expectLateNativeConflict(slot) {
      const nativeBody = widget.scene[slot];
      const previousShow = nativeBody.show;
      const removePreRender = widget.scene.preRender.addEventListener(
        function () {
          removePreRender();
          nativeBody.show = true;
        },
      );
      widget.scene.requestRender();
      const sunCalls = renderer._sunCommand.execute.calls.count();
      const moonCalls = renderer._moonCommand.execute.calls.count();
      expect(() => widget.render()).toThrowDeveloperError();
      nativeBody.show = previousShow;
      expect(renderer._sunCommand.execute.calls.count()).toBe(sunCalls);
      expect(renderer._moonCommand.execute.calls.count()).toBe(moonCalls);
      expectWarmBodies();
    }
    expectLateNativeConflict("sun");
    expectLateNativeConflict("moon");

    const removePreRender = widget.scene.preRender.addEventListener(
      function () {
        removePreRender();
        widget.scene.sun.show = false;
        widget.scene.moon.show = false;
      },
    );
    widget.scene.requestRender();
    widget.render();
    expect(renderer._sunCommand.execute).toHaveBeenCalledTimes(1);
    expect(renderer._moonCommand.execute).toHaveBeenCalledTimes(1);
    expectWarmBodies();

    expect(world.getTerrainHeight(terrainPosition)).toBe(residentTerrainHeight);
    const orientation = {
      direction,
      up: Cartesian3.normalize(
        new Cartesian3(0.0, -1.0, 1.0),
        new Cartesian3(),
      ),
    };
    widget.scene.camera.setView({
      destination: new Cartesian3(-64.0, -64.0, residentTerrainHeight - 1.0),
      orientation,
    });
    widget.scene.requestRender();
    widget.render();
    expect(renderer._sunCommand.execute).toHaveBeenCalledTimes(1);
    expect(renderer._moonCommand.execute).toHaveBeenCalledTimes(1);

    widget.scene.camera.setView({
      destination: new Cartesian3(-64.0, -64.0, residentTerrainHeight + 1.0),
      orientation,
    });
    widget.scene.requestRender();
    widget.render();
    expect(renderer._sunCommand.execute).toHaveBeenCalledTimes(2);
    expect(renderer._moonCommand.execute).toHaveBeenCalledTimes(2);
    expectWarmBodies();

    world.show = false;
    widget.scene.requestRender();
    widget.render();
    expect(renderer._sunCommand.execute).toHaveBeenCalledTimes(2);
    expect(renderer._moonCommand.execute).toHaveBeenCalledTimes(2);
    world.show = true;
    environment.enabled = false;
    widget.render();
    expect(renderer._sunCommand.execute).toHaveBeenCalledTimes(2);
    expect(renderer._moonCommand.execute).toHaveBeenCalledTimes(2);
    environment.enabled = true;
    environment.showSun = false;
    environment.showMoon = false;
    widget.render();
    expect(renderer._sunCommand.execute).toHaveBeenCalledTimes(2);
    expect(renderer._moonCommand.execute).toHaveBeenCalledTimes(2);

    environment.showSun = true;
    widget.render();
    expect(renderer._sunCommand.execute).toHaveBeenCalledTimes(3);
    expect(renderer._moonCommand.execute).toHaveBeenCalledTimes(2);
    widget.scene.sun = originalSun;
    widget.scene.moon = originalMoon;
    expectWarmBodies();
  });

  it("keeps real host validation and world-destroy sever failure atomic", function () {
    const { world } = createWorld();
    createWidget(world);
    const original = widget.scene.light;
    environment = new SceneGISPlanarEnvironment({
      world,
      sunDirection: Cartesian3.UNIT_Z,
      moonDirection: Cartesian3.UNIT_X,
    });
    const duplicate = new SceneGISPlanarEnvironment({
      world,
      sunDirection: Cartesian3.UNIT_Y,
      moonDirection: Cartesian3.UNIT_X,
    });
    widget.addController(environment);
    expect(() =>
      duplicate.connectedCallback(container),
    ).toThrowDeveloperError();
    expect(world.environment).toBe(environment);
    expect(widget.scene.light).toBe(original);

    const previousMode = widget.scene._mode;
    widget.scene._mode = SceneMode.SCENE2D;
    expect(() => environment.firstUpdate(widget.scene)).toThrowDeveloperError();
    expect(environment._scene).toBeUndefined();
    expect(widget.scene.light).toBe(original);
    widget.scene._mode = previousMode;

    const otherWorld = createWorld().world;
    const wrongWorldEnvironment = new SceneGISPlanarEnvironment({
      world: otherWorld,
      sunDirection: Cartesian3.UNIT_Z,
      moonDirection: Cartesian3.UNIT_X,
    });
    const otherElement = {};
    wrongWorldEnvironment.connectedCallback(otherElement);
    expect(() =>
      wrongWorldEnvironment.firstUpdate(widget.scene),
    ).toThrowDeveloperError();
    expect(wrongWorldEnvironment._scene).toBeUndefined();
    expect(widget.scene.light).toBe(original);
    wrongWorldEnvironment.disconnectedCallback(otherElement);
    otherWorld.destroy();

    renderFrame();
    expect(widget.scene.light).toBe(environment.light);
    const stableLight = environment.light;
    world.destroy();
    expect(widget.scene.light).toBe(original);
    expect(environment.light).toBe(stableLight);
    expect(environment._scene).toBeUndefined();
    expect(environment._element).toBe(container);
    expect(() => environment.update(widget.scene)).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISPlanarEnvironment({
          world,
          sunDirection: Cartesian3.UNIT_Z,
          moonDirection: Cartesian3.UNIT_X,
        }),
    ).toThrowDeveloperError();
    widget.removeController(environment);
    // This case deliberately destroys the widget-owned world. Prevent the
    // afterEach host teardown from trying to destroy the same instance twice.
    widget.scene._world = undefined;
    environment = undefined;
  });
});
