import {
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  Event,
  JulianDate,
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
  SceneTransforms,
} from "../../../index.js";
import CameraEventType from "../../../Source/Scene/CameraEventType.js";
import SceneGISPlanarCamera from "../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidget", function () {
  let container;
  let widget;
  let controller;

  function project(scene, position) {
    const camera = scene.camera;
    const info = SceneGISPlanarCamera.getFrustumInfo(camera.frustum);
    const offset = Cartesian3.subtract(
      position,
      camera.positionWC,
      new Cartesian3(),
    );
    const depth = Cartesian3.dot(offset, camera.directionWC);
    let x = Cartesian3.dot(offset, camera.rightWC);
    let y = Cartesian3.dot(offset, camera.upWC);
    if (info.perspective) {
      x = (x * info.near) / depth;
      y = (y * info.near) / depth;
    }
    return new Cartesian2(
      ((x - info.left) / info.horizontalSpan) * scene.canvas.clientWidth,
      ((info.top - y) / info.verticalSpan) * scene.canvas.clientHeight,
    );
  }

  function queueMiddleDrag(start, end) {
    const aggregator = controller._aggregator;
    const key = `${CameraEventType.MIDDLE_DRAG}`;
    if (!aggregator._isDown[key]) {
      aggregator._isDown[key] = true;
      aggregator._buttonsDown++;
      aggregator._pressTime[key] = new Date(1);
      Cartesian2.clone(start, aggregator._eventStartPosition[key]);
    }
    Cartesian2.clone(start, aggregator._movement[key].startPosition);
    Cartesian2.clone(end, aggregator._movement[key].endPosition);
    aggregator._update[key] = false;
    Cartesian2.clone(end, aggregator._currentMousePosition);
  }

  function releaseMiddleDrag() {
    const aggregator = controller._aggregator;
    const key = `${CameraEventType.MIDDLE_DRAG}`;
    aggregator._isDown[key] = false;
    aggregator._buttonsDown--;
    aggregator._releaseTime[key] = new Date(2);
  }

  beforeEach(function () {
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

  it("rotates around the latest rendered terrain anchor without mutating terrain state", async function () {
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
      baseColor: Color.LIME,
    });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-20.0, 20.0, 40.0, 80.0]),
      width: 2,
      height: 2,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -20.0,
      maximumHeight: 80.0,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 1000.0,
      requestTileGeometry: () => Promise.resolve(terrainData),
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
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
      destination: new Cartesian3(0.0, 0.0, 256.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });

    await pollToPromise(function () {
      scene.initializeFrame();
      scene.render();
      return world.tilesLoaded;
    });
    expect(world.tilesLoaded).toBe(true);

    const sampleX = -32.0;
    const sampleY = 48.0;
    const sampleHeight = terrainData.interpolateHeight(
      world.coordinateSystem.extent,
      sampleX,
      sampleY,
    );
    expect(sampleHeight).not.toBe(0.0);
    const windowPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(sampleX, sampleY, sampleHeight),
      new Cartesian2(),
    );
    const terrainPosition = world.pickTerrainFromWindowPosition(
      windowPosition,
      scene,
      new Cartesian3(),
    );
    expect(terrainPosition).toBeDefined();
    expect(terrainPosition.z).toEqualEpsilon(sampleHeight, 1e-4);
    const referencePosition = world.pickFromWindowPosition(
      windowPosition,
      scene,
      new Cartesian3(),
    );
    expect(referencePosition.z).toBe(0.0);

    let renderedPosition;
    if (scene.pickPositionSupported && !window.webglStub) {
      renderedPosition = scene.pickPosition(windowPosition, new Cartesian3());
      expect(renderedPosition).toBeDefined();
      expect(renderedPosition).toEqualEpsilon(terrainPosition, 5e-3);
    }

    scene.screenSpaceCameraController.enableInputs = false;
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.firstUpdate(scene, JulianDate.now());
    const terrainDebug = { ...world._surface._terrain._debug };
    const commands = world._surface._renderCommands.slice();
    const terrainPickSpy = spyOn(world, "pickTerrain").and.callThrough();

    queueMiddleDrag(
      windowPosition,
      new Cartesian2(windowPosition.x + 4.0, windowPosition.y + 3.0),
    );
    controller.update(scene, JulianDate.now());

    const expectedPivot = renderedPosition ?? terrainPosition;
    expect(controller._rotatePivot).toEqualEpsilon(expectedPivot, 1e-3);
    expect(project(scene, controller._rotatePivot)).toEqualEpsilon(
      windowPosition,
      1e-6,
    );
    if (renderedPosition) {
      expect(terrainPickSpy.calls.count()).toBe(1);
    } else {
      expect(terrainPickSpy.calls.count()).toBeGreaterThan(1);
    }
    expect(world._surface._terrain._debug).toEqual(terrainDebug);
    expect(world._surface._renderCommands).toEqual(commands);

    widget.removeController(controller);
    controller = undefined;
    const localSurfaceHeight = world.getTerrainHeight(
      new Cartesian3(0.0, 0.0, 0.0),
    );
    expect(localSurfaceHeight).toBeDefined();
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, localSurfaceHeight - 10.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });
    controller = new SceneGISPlanarCameraController({
      world,
      minimumTerrainClearance: 3.0,
    });
    widget.addController(controller);
    spyOn(controller, "viewHome").and.callThrough();
    const clearanceDebug = { ...world._surface._terrain._debug };
    const clearanceCommands = world._surface._renderCommands.slice();
    controller.firstUpdate(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toEqualEpsilon(
      localSurfaceHeight + 3.0,
      1e-5,
    );
    expect(controller.viewHome).not.toHaveBeenCalled();
    expect(world._surface._terrain._debug).toEqual(clearanceDebug);
    expect(world._surface._renderCommands).toEqual(clearanceCommands);

    const beforeClearanceChange = Cartesian3.clone(scene.camera.positionWC);
    controller.minimumTerrainClearance = 5.0;
    expect(scene.camera.positionWC).toEqual(beforeClearanceChange);
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toEqualEpsilon(
      localSurfaceHeight + 5.0,
      1e-5,
    );
    expect(controller.viewHome).not.toHaveBeenCalled();
    expect(world._surface._terrain._debug).toEqual(clearanceDebug);
    expect(world._surface._renderCommands).toEqual(clearanceCommands);

    widget.removeController(controller);
    controller = undefined;
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, -256.0),
      orientation: {
        direction: Cartesian3.UNIT_Z,
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.initializeFrame();
    scene.render();
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    const belowTerrainPosition = world.pickTerrainFromWindowPosition(
      center,
      scene,
      new Cartesian3(),
    );
    expect(belowTerrainPosition).toBeDefined();
    expect(belowTerrainPosition.z).not.toBe(0.0);
    let belowRenderedPosition;
    if (scene.pickPositionSupported && !window.webglStub) {
      belowRenderedPosition = scene.pickPosition(center, new Cartesian3());
      expect(belowRenderedPosition).toBeDefined();
      expect(belowRenderedPosition).toEqualEpsilon(belowTerrainPosition, 0.5);
    }
    const belowReferencePosition = world.pickFromWindowPosition(
      center,
      scene,
      new Cartesian3(),
    );
    expect(belowReferencePosition.z).toBe(0.0);

    controller = new SceneGISPlanarCameraController({
      world,
      navigationMode: "underground",
    });
    widget.addController(controller);
    spyOn(controller, "viewHome").and.callThrough();
    controller.firstUpdate(scene, JulianDate.now());
    expect(controller._target).toEqualEpsilon(belowTerrainPosition, 5e-3);
    const belowTerrainDebug = { ...world._surface._terrain._debug };
    const belowCommands = world._surface._renderCommands.slice();
    const belowMovementEnd = new Cartesian2(center.x + 4.0, center.y - 3.0);
    queueMiddleDrag(center, belowMovementEnd);
    controller.update(scene, JulianDate.now());

    expect(controller.viewHome).not.toHaveBeenCalled();
    expect(controller.navigationMode).toBe("underground");
    const belowExpectedPivot = belowRenderedPosition ?? belowTerrainPosition;
    expect(controller._rotatePivot).toEqualEpsilon(belowExpectedPivot, 5e-3);
    expect(scene.camera.positionWC.z).toBeLessThan(controller._rotatePivot.z);
    expect(project(scene, controller._rotatePivot)).toEqualEpsilon(
      center,
      1e-6,
    );
    const crossingPivot = Cartesian3.clone(controller._rotatePivot);
    const terrainCalls = terrainPickSpy.calls.count();
    const aboveMovementEnd = new Cartesian2(
      belowMovementEnd.x,
      belowMovementEnd.y + 80.0,
    );
    queueMiddleDrag(belowMovementEnd, aboveMovementEnd);
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeGreaterThan(crossingPivot.z);
    expect(scene.camera.directionWC.z).toBeLessThan(0.0);
    expect(controller._rotatePivot).toEqual(crossingPivot);
    expect(project(scene, crossingPivot)).toEqualEpsilon(center, 1e-6);
    expect(terrainPickSpy.calls.count()).toBe(terrainCalls);

    const returnMovementEnd = new Cartesian2(
      aboveMovementEnd.x,
      aboveMovementEnd.y - 80.0,
    );
    queueMiddleDrag(aboveMovementEnd, returnMovementEnd);
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeLessThan(crossingPivot.z);
    expect(scene.camera.directionWC.z).toBeGreaterThan(0.0);
    expect(project(scene, crossingPivot)).toEqualEpsilon(center, 1e-6);
    expect(terrainPickSpy.calls.count()).toBe(terrainCalls);

    releaseMiddleDrag();
    controller.update(scene, JulianDate.now());
    queueMiddleDrag(center, new Cartesian2(center.x + 2.0, center.y - 2.0));
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeLessThan(controller._rotatePivot.z);
    expect(controller.viewHome).not.toHaveBeenCalled();
    expect(world._surface._terrain._debug).toEqual(belowTerrainDebug);
    expect(world._surface._renderCommands).toEqual(belowCommands);
  });
});
