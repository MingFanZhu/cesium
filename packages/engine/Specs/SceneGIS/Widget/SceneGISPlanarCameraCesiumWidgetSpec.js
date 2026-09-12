import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  Event,
  HeadingPitchRange,
  Matrix4,
  OrthographicFrustum,
  Rectangle,
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Widget/SceneGISPlanarCameraCesiumWidget", function () {
  let container;
  let widget;
  let controller;
  let environment;

  function createSolidImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, 2, 2);
    return canvas;
  }

  function createWorld() {
    return new SceneGISPlanarWorld({
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
    });
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
    widget.scene.screenSpaceCameraController.enableInputs = false;
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
  }

  function installLocalTerrainAndImagery(world) {
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([0.0, 16.0, 0.0, 16.0]),
      width: 2,
      height: 2,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0.0,
      maximumHeight: 16.0,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 1.0,
      requestTileGeometry: () => Promise.resolve(terrainData),
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    return world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
      tileWidth: 2,
      tileHeight: 2,
      hasAlphaChannel: false,
      errorEvent: new Event(),
      credit: undefined,
      requestImage: () => Promise.resolve(createSolidImage()),
    });
  }

  function renderFrame() {
    widget.scene.initializeFrame();
    widget.scene.render();
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "96px";
    container.style.height = "96px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && controller && controller._aggregator) {
      widget.removeController(controller);
    }
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
    controller = undefined;
    environment = undefined;
    widget = undefined;
    document.body.removeChild(container);
  });

  it("uses public planar view and actual tween frames while keeping render resources warm", async function () {
    const world = createWorld();
    const layer = installLocalTerrainAndImagery(world);
    createWidget(world);
    environment = new SceneGISPlanarEnvironment({
      world,
      sunDirection: new Cartesian3(1.0, 0.0, 1.0),
      moonDirection: Cartesian3.UNIT_Z,
    });
    widget.addController(environment);
    const camera = widget.scene.camera;
    camera.setView({
      destination: new Cartesian3(0.0, -80.0, 120.0),
      orientation: { heading: 0.0, pitch: -Math.PI / 4.0, roll: 0.0 },
    });
    await pollToPromise(function () {
      renderFrame();
      return world.tilesLoaded && world._surface._renderCommands.length === 1;
    });
    const tile = world._surface._quadtree._renderTiles[0];
    const command = world._surface._renderCommands[0];
    const shaderProgram = command.shaderProgram;
    const vertexArray = command.vertexArray;
    const mesh = tile.terrainEntry.activeContent.mesh;
    const binding = tile.imageryBindings.get(layer);
    const texture = binding.desired.texture;
    const light = environment.light;
    const pixelBefore = widget.scene.context.readPixels({
      x: 48,
      y: 48,
      width: 1,
      height: 1,
    });

    camera.flyTo({
      destination: new Cartesian3(40.0, -20.0, 90.0),
      orientation: { heading: 0.7, pitch: -0.8, roll: 0.15 },
      duration: 1.0,
    });
    expect(controller._flightSuspensionCount).toBe(1);
    const beforeWheel = Cartesian3.clone(camera.positionWC);
    widget.canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -120.0, bubbles: true }),
    );
    controller.update(widget.scene);
    expect(camera.positionWC).toEqual(beforeWheel);
    widget.scene.tweens.update(0.0);
    widget.scene.tweens.update(0.5);
    expect(camera.positionWC.x).toBeGreaterThan(0.0);
    expect(camera.positionWC.x).toBeLessThan(40.0);
    widget.scene.tweens.update(1.0);
    expect(camera.positionWC).toEqualEpsilon(
      new Cartesian3(40.0, -20.0, 90.0),
      1e-12,
    );
    expect(camera.heading).toEqualEpsilon(0.7, 1e-12);
    expect(camera.pitch).toEqualEpsilon(-0.8, 1e-12);
    expect(camera.roll).toEqualEpsilon(0.15, 1e-12);
    expect(controller._flightSuspensionCount).toBe(0);

    renderFrame();
    expect(world._surface._quadtree._renderTiles[0]).toBe(tile);
    expect(world._surface._renderCommands[0]).toBe(command);
    expect(command.shaderProgram).toBe(shaderProgram);
    expect(command.vertexArray).toBe(vertexArray);
    expect(tile.terrainEntry.activeContent.mesh).toBe(mesh);
    expect(tile.imageryBindings.get(layer)).toBe(binding);
    expect(binding.desired.texture).toBe(texture);
    expect(environment.light).toBe(light);
    expect(pixelBefore[3]).toBe(255);
  });

  it("qualifies public lookAt bounds flights Home and next-frame clearance in orthographic", function () {
    const world = createWorld();
    createWidget(world);
    const camera = widget.scene.camera;
    const frustum = new OrthographicFrustum();
    frustum.width = 300.0;
    frustum.aspectRatio = 1.0;
    frustum.near = 1.0;
    frustum.far = 2000.0;
    camera.frustum = frustum;
    camera.setView({
      destination: new Cartesian3(0.0, 0.0, 150.0),
      orientation: { heading: 0.0, pitch: -Math.PI / 2.0, roll: 0.0 },
    });
    renderFrame();

    camera.lookAt(
      new Cartesian3(10.0, 20.0, 0.0),
      new HeadingPitchRange(0.5, -0.7, 120.0),
    );
    expect(Matrix4.getTranslation(camera.transform, new Cartesian3())).toEqual(
      new Cartesian3(10.0, 20.0, 0.0),
    );
    camera.viewBoundingSphere(
      new BoundingSphere(new Cartesian3(0.0, 0.0, 20.0), 32.0),
    );
    expect(camera.frustum.width).toBeGreaterThanOrEqual(64.0);

    camera.flyToBoundingSphere(
      new BoundingSphere(new Cartesian3(20.0, -20.0, 30.0), 20.0),
      { duration: 1.0 },
    );
    camera.completeFlight();
    expect(camera._currentFlight).toBeUndefined();
    expect(controller._flightSuspensionCount).toBe(0);

    camera.flyHome(1.0);
    camera.completeFlight();
    expect(camera.heading).toEqualEpsilon(0.0, 1e-12);
    expect(camera.pitch).toEqualEpsilon(-Math.PI / 2.0, 1e-12);

    camera.flyTo({
      destination: new Cartesian3(0.0, 0.0, -10.0),
      orientation: { heading: 0.0, pitch: -Math.PI / 2.0, roll: 0.0 },
      duration: 0.0,
    });
    expect(camera.positionWC.z).toBe(-10.0);
    renderFrame();
    expect(camera.positionWC.z).toBe(controller.minimumTerrainClearance);
  });

  it("rejects ellipsoid-only Camera methods without mutating results or view", function () {
    const world = createWorld();
    createWidget(world);
    const camera = widget.scene.camera;
    camera.setView({
      destination: new Cartesian3(10.0, -20.0, 100.0),
      orientation: { heading: 0.3, pitch: -0.8, roll: 0.1 },
    });
    const position = Cartesian3.clone(camera.positionWC);
    const direction = Cartesian3.clone(camera.directionWC);
    const requestCount = widget.scene._renderRequested;
    const cartesianResult = new Cartesian3(1.0, 2.0, 3.0);
    const rectangleResult = new Rectangle(0.1, 0.2, 0.3, 0.4);

    expect(function () {
      camera.getRectangleCameraCoordinates(
        Rectangle.MAX_VALUE,
        cartesianResult,
      );
    }).toThrowDeveloperError();
    expect(cartesianResult).toEqual(new Cartesian3(1.0, 2.0, 3.0));

    expect(function () {
      camera.pickEllipsoid(
        new Cartesian2(48.0, 48.0),
        undefined,
        cartesianResult,
      );
    }).toThrowDeveloperError();
    expect(cartesianResult).toEqual(new Cartesian3(1.0, 2.0, 3.0));

    expect(function () {
      camera.computeViewRectangle(undefined, rectangleResult);
    }).toThrowDeveloperError();
    expect(rectangleResult).toEqual(new Rectangle(0.1, 0.2, 0.3, 0.4));
    expect(camera.positionWC).toEqual(position);
    expect(camera.directionWC).toEqual(direction);
    expect(widget.scene._renderRequested).toBe(requestCount);
  });
});
