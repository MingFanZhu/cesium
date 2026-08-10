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
    aggregator._isDown[key] = true;
    aggregator._buttonsDown++;
    aggregator._pressTime[key] = new Date(1);
    Cartesian2.clone(start, aggregator._eventStartPosition[key]);
    Cartesian2.clone(start, aggregator._movement[key].startPosition);
    Cartesian2.clone(end, aggregator._movement[key].endPosition);
    aggregator._update[key] = false;
    Cartesian2.clone(end, aggregator._currentMousePosition);
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

    for (let i = 0; i < 8; ++i) {
      scene.initializeFrame();
      scene.render();
      await Promise.resolve();
    }
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
      expect(terrainPickSpy).not.toHaveBeenCalled();
    } else {
      expect(terrainPickSpy).toHaveBeenCalled();
    }
    expect(world._surface._terrain._debug).toEqual(terrainDebug);
    expect(world._surface._renderCommands).toEqual(commands);
  });
});
