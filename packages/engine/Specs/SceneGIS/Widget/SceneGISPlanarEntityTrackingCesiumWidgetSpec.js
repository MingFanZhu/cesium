import {
  BoundingSphere,
  BoundingSphereState,
  CallbackPositionProperty,
  Cartesian3,
  CesiumWidget,
  Color,
  ConstantPositionProperty,
  Entity,
  Event,
  JulianDate,
  OrthographicFrustum,
  ReferenceFrame,
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
  TrackingReferenceFrame,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Widget/SceneGISPlanarEntityTrackingCesiumWidget", function () {
  let container;
  let widget;
  let controller;
  let environment;

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

  function createWidget(world, withController = true) {
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
    if (withController) {
      controller = new SceneGISPlanarCameraController({ world });
      widget.addController(controller);
    }
  }

  function createSolidImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, 2, 2);
    return canvas;
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

  function createTrackedEntity(position) {
    return new Entity({
      position,
      viewFrom: new Cartesian3(0.0, -40.0, 50.0),
      trackingReferenceFrame: TrackingReferenceFrame.AUTODETECT,
    });
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "96px";
    container.style.height = "96px";
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
    if (widget && controller && controller._aggregator) {
      widget.removeController(controller);
    }
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    widget = undefined;
    controller = undefined;
    environment = undefined;
    document.body.removeChild(container);
  });

  it("keeps invalid replacement and failed framing atomic", async function () {
    const world = createWorld();
    createWidget(world);
    const tracked = createTrackedEntity(
      new ConstantPositionProperty(
        new Cartesian3(10.0, 20.0, 5.0),
        ReferenceFrame.FIXED,
      ),
    );
    widget.trackedEntity = tracked;
    widget.scene.controllerHost.update(widget.scene, widget.clock.currentTime);
    const tracker = widget._sceneGISPlanarEntityTracker;
    const token = tracker._inputToken;
    const cameraPosition = Cartesian3.clone(widget.camera.positionWC);
    const changed = spyOn(
      widget.trackedEntityChanged,
      "raiseEvent",
    ).and.callThrough();
    const requestRender = spyOn(
      widget.scene,
      "requestRender",
    ).and.callThrough();

    const zoomTarget = new Entity({ id: "zoom-target" });
    let state = BoundingSphereState.PENDING;
    spyOn(widget.dataSourceDisplay, "getBoundingSphere").and.callFake(
      function (entity, allowPartial, result) {
        if (entity === zoomTarget && state === BoundingSphereState.DONE) {
          BoundingSphere.clone(
            new BoundingSphere(new Cartesian3(0.0, 0.0, 0.0), 4.0),
            result,
          );
        }
        return entity === zoomTarget ? state : BoundingSphereState.FAILED;
      },
    );
    const pending = widget.zoomTo(zoomTarget);
    const operation = widget._sceneGISPlanarFramingOperation;
    const requestCount = requestRender.calls.count();
    expect(function () {
      widget.trackedEntity = new Entity();
    }).toThrowDeveloperError();
    expect(widget.trackedEntity).toBe(tracked);
    expect(widget._sceneGISPlanarFramingOperation).toBe(operation);
    expect(tracker._inputToken).toBe(token);
    expect(widget.camera.positionWC).toEqual(cameraPosition);
    expect(changed).not.toHaveBeenCalled();
    expect(requestRender.calls.count()).toBe(requestCount);

    widget._postRender();
    expect(widget.trackedEntity).toBe(tracked);
    state = BoundingSphereState.FAILED;
    widget._postRender();
    expect(await pending).toBe(false);
    expect(widget.trackedEntity).toBe(tracked);

    state = BoundingSphereState.DONE;
    const failure = new Error("candidate failure");
    spyOn(widget.camera, "viewBoundingSphere").and.throwError(failure);
    const rejected = widget.zoomTo(zoomTarget);
    widget._postRender();
    await expectAsync(rejected).toBeRejectedWith(failure);
    expect(widget.trackedEntity).toBe(tracked);
    expect(tracker._inputToken).toBe(token);

    widget.camera.viewBoundingSphere.and.callThrough();
    const successful = widget.zoomTo(zoomTarget);
    widget._postRender();
    expect(await successful).toBe(true);
    expect(widget.trackedEntity).toBeUndefined();
    expect(tracker._inputToken).toBeUndefined();
    expect(controller._trackingSuspensionCount).toBe(0);
  });

  it("tracks native Clock frames while keeping render resources warm and input suspended", async function () {
    const world = createWorld();
    const layer = installLocalTerrainAndImagery(world);
    createWidget(world);
    environment = new SceneGISPlanarEnvironment({
      world,
      sunDirection: new Cartesian3(1.0, 0.0, 1.0),
      moonDirection: Cartesian3.UNIT_Z,
    });
    widget.addController(environment);
    const start = JulianDate.fromIso8601("2026-08-14T00:00:00Z");
    const position = new CallbackPositionProperty(
      function (time, result) {
        const seconds = JulianDate.secondsDifference(time, start);
        return Cartesian3.fromElements(10.0 + seconds, 20.0, 5.0, result);
      },
      false,
      ReferenceFrame.FIXED,
    );
    const entity = widget.entities.add(createTrackedEntity(position));
    widget.clock.currentTime = start;
    widget.trackedEntity = entity;

    await pollToPromise(function () {
      widget.render();
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
    const tracker = widget._sceneGISPlanarEntityTracker;
    const token = tracker._inputToken;
    expect(widget.camera.positionWC).toEqual(new Cartesian3(10.0, -20.0, 55.0));

    widget.clock.currentTime = JulianDate.addSeconds(
      start,
      12.0,
      new JulianDate(),
    );
    widget.render();
    expect(widget.camera.positionWC).toEqual(new Cartesian3(22.0, -20.0, 55.0));
    expect(tracker._inputToken).toBe(token);
    expect(controller._trackingSuspensionCount).toBe(1);

    widget.camera.flyTo({
      destination: new Cartesian3(-30.0, -30.0, 80.0),
      duration: 1.0,
    });
    expect(controller._flightSuspensionCount).toBe(1);
    expect(controller._trackingSuspensionCount).toBe(1);
    widget.scene.tweens.update();
    widget.render();
    expect(tracker._flightWasActive).toBe(true);
    widget.camera.completeFlight();
    expect(controller._flightSuspensionCount).toBe(0);
    expect(widget.camera.positionWC).toEqual(
      new Cartesian3(-30.0, -30.0, 80.0),
    );
    widget.render();
    expect(widget.camera.positionWC).toEqual(new Cartesian3(22.0, -20.0, 55.0));
    expect(controller._trackingSuspensionCount).toBe(1);

    const beforeWheel = Cartesian3.clone(widget.camera.positionWC);
    widget.canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -120.0, bubbles: true }),
    );
    widget.render();
    expect(widget.camera.positionWC).toEqual(beforeWheel);

    expect(world._surface._quadtree._renderTiles[0]).toBe(tile);
    expect(world._surface._renderCommands[0]).toBe(command);
    expect(command.shaderProgram).toBe(shaderProgram);
    expect(command.vertexArray).toBe(vertexArray);
    expect(tile.terrainEntry.activeContent.mesh).toBe(mesh);
    expect(tile.imageryBindings.get(layer)).toBe(binding);
    expect(binding.desired.texture).toBe(texture);
    expect(environment.light).toBe(light);

    widget.trackedEntity = undefined;
    expect(controller._trackingSuspensionCount).toBe(0);
    widget.canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -120.0, bubbles: true }),
    );
    widget.render();
    expect(widget.camera.positionWC).not.toEqual(beforeWheel);
  });

  it("tracks in Orthographic without a planar input controller", function () {
    const world = createWorld();
    createWidget(world, false);
    const frustum = new OrthographicFrustum();
    frustum.width = 300.0;
    frustum.aspectRatio = 1.0;
    frustum.near = 1.0;
    frustum.far = 2000.0;
    widget.camera.frustum = frustum;
    const entity = widget.entities.add(
      createTrackedEntity(
        new ConstantPositionProperty(
          new Cartesian3(-20.0, 30.0, 10.0),
          ReferenceFrame.FIXED,
        ),
      ),
    );
    widget.trackedEntity = entity;
    widget.render();
    expect(widget.camera.positionWC).toEqual(
      new Cartesian3(-20.0, -10.0, 60.0),
    );
    expect(widget._sceneGISPlanarEntityTracker._inputToken).toBeUndefined();
  });
});
