import {
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  OrthographicFrustum,
  Ray,
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import SceneTransforms from "../../../Source/Scene/SceneTransforms.js";

describe("SceneGIS/Widget/SceneGISPlanarSceneApiCesiumWidget", function () {
  let container;
  let widget;
  let controller;

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
      baseColor: Color.LIME,
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
      useBrowserRecommendedResolution: false,
      requestRenderMode: true,
      contextOptions,
    });
    widget.scene.rethrowRenderErrors = true;
    widget.scene.screenSpaceCameraController.enableInputs = false;
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(widget.scene);
    return widget.scene;
  }

  function createNativeBodyStub() {
    let destroyed = false;
    return {
      show: false,
      updateCalls: 0,
      update: function () {
        ++this.updateCalls;
      },
      isDestroyed: function () {
        return destroyed;
      },
      destroy: function () {
        destroyed = true;
      },
    };
  }

  function renderFrame(scene) {
    scene.initializeFrame();
    scene.render();
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "64px";
    container.style.height = "64px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && controller && controller._aggregator) {
      widget.removeController(controller);
    }
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    widget = undefined;
    controller = undefined;
    document.body.removeChild(container);
  });

  it("guards ellipsoid height APIs before delegation or caller mutation", function () {
    const world = createWorld();
    const scene = createWidget(world);
    const picking = scene._picking;
    const sample = spyOn(picking, "sampleHeight").and.callThrough();
    const sampleDetailed = spyOn(
      picking,
      "sampleHeightMostDetailed",
    ).and.callThrough();
    const clamp = spyOn(picking, "clampToHeight").and.callThrough();
    const clampDetailed = spyOn(
      picking,
      "clampToHeightMostDetailed",
    ).and.callThrough();
    const position = { longitude: 1.0, latitude: 2.0, height: 3.0 };
    const positions = [position];
    const cartesian = new Cartesian3(1.0, 2.0, 3.0);
    const cartesians = [cartesian];
    const result = new Cartesian3(4.0, 5.0, 6.0);

    expect(scene.sampleHeightSupported).toBe(false);
    expect(scene.clampToHeightSupported).toBe(false);
    expect(function () {
      scene.sampleHeight(position);
    }).toThrowDeveloperError();
    expect(function () {
      scene.sampleHeightMostDetailed(positions);
    }).toThrowDeveloperError();
    expect(function () {
      scene.clampToHeight(cartesian, undefined, undefined, result);
    }).toThrowDeveloperError();
    expect(function () {
      scene.clampToHeightMostDetailed(cartesians);
    }).toThrowDeveloperError();

    expect(sample).not.toHaveBeenCalled();
    expect(sampleDetailed).not.toHaveBeenCalled();
    expect(clamp).not.toHaveBeenCalled();
    expect(clampDetailed).not.toHaveBeenCalled();
    expect(positions).toEqual([position]);
    expect(position).toEqual({ longitude: 1.0, latitude: 2.0, height: 3.0 });
    expect(cartesians).toEqual([cartesian]);
    expect(cartesian).toEqual(new Cartesian3(1.0, 2.0, 3.0));
    expect(result).toEqual(new Cartesian3(4.0, 5.0, 6.0));
  });

  it("rejects late native effects before planar render and recovers next frame", function () {
    const world = createWorld();
    const scene = createWidget(world);
    const nativeBody = createNativeBodyStub();
    scene.skyBox = nativeBody;
    renderFrame(scene);
    const nativeUpdateCalls = nativeBody.updateCalls;
    const renderCalls = world._surface._debug.submittedCommands;
    const command = world._surface._renderCommands[0];
    const shaderProgram = command.shaderProgram;
    const vertexArray = command.vertexArray;

    const removePreRender = scene.preRender.addEventListener(function () {
      nativeBody.show = true;
    });
    scene.requestRender();
    expect(function () {
      renderFrame(scene);
    }).toThrowDeveloperError();
    removePreRender();
    expect(nativeBody.updateCalls).toBe(nativeUpdateCalls);
    expect(world._surface._debug.submittedCommands).toBe(renderCalls);
    expect(world._surface._renderCommands[0]).toBe(command);
    expect(command.shaderProgram).toBe(shaderProgram);
    expect(command.vertexArray).toBe(vertexArray);

    nativeBody.show = false;
    scene.requestRender();
    renderFrame(scene);
    expect(world._surface._renderCommands[0]).toBe(command);

    for (const propertyName of ["skyAtmosphere", "sun", "moon"]) {
      const body = createNativeBodyStub();
      body.show = true;
      scene[propertyName] = body;
      expect(function () {
        scene.updateFrameState();
      }).toThrowDeveloperError();
      scene[propertyName] = undefined;
      body.destroy();
    }

    scene.fog.enabled = true;
    scene.requestRender();
    expect(function () {
      renderFrame(scene);
    }).toThrowDeveloperError();
    scene.fog.enabled = false;
    scene.shadowMap.enabled = true;
    scene.requestRender();
    expect(function () {
      renderFrame(scene);
    }).toThrowDeveloperError();
    scene.shadowMap.enabled = false;
    scene.requestRender();
    renderFrame(scene);
    expect(world._surface._renderCommands[0]).toBe(command);
  });

  it("qualifies Cartesian screen depth terrain and ordinary ray APIs", function () {
    const world = createWorld();
    const scene = createWidget(world);
    widget.canvas.style.width = "64px";
    widget.canvas.style.height = "64px";
    widget.resolutionScale = 2.0;
    widget.resize();
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    const terrain = world.pickFromWindowPosition(center, scene);
    const canvasResult = new Cartesian2();
    const windowResult = new Cartesian2();
    const drawingResult = new Cartesian2();

    expect(scene.cartesianToCanvasCoordinates(terrain, canvasResult)).toBe(
      canvasResult,
    );
    expect(
      SceneTransforms.worldToWindowCoordinates(scene, terrain, windowResult),
    ).toBe(windowResult);
    expect(
      SceneTransforms.worldToDrawingBufferCoordinates(
        scene,
        terrain,
        drawingResult,
      ),
    ).toBe(drawingResult);
    expect(canvasResult).toEqualEpsilon(center, 1e-6);
    expect(windowResult).toEqualEpsilon(center, 1e-6);
    expect(drawingResult.x).toEqualEpsilon(center.x * 2.0, 1e-6);
    expect(drawingResult.y).toEqualEpsilon(center.y * 2.0, 1e-6);

    renderFrame(scene);
    if (scene.pickPositionSupported && !window.webglStub) {
      const depth = scene.pickPosition(center, new Cartesian3());
      expect(depth).toEqualEpsilon(terrain, 1e-4);
      const ray = scene.camera.getPickRay(center, new Ray());
      const rayPick = scene.pickFromRay(ray);
      expect(rayPick).toBeDefined();
      expect(rayPick.position).toEqualEpsilon(terrain, 1e-3);
    }

    const orthographic = new OrthographicFrustum();
    orthographic.width = 256.0;
    orthographic.aspectRatio = 1.0;
    orthographic.near = 1.0;
    orthographic.far = 1000.0;
    scene.camera.frustum = orthographic;
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 256.0),
      orientation: { heading: 0.0, pitch: -Math.PI / 2.0, roll: 0.0 },
    });
    renderFrame(scene);
    expect(scene.cartesianToCanvasCoordinates(Cartesian3.ZERO)).toEqualEpsilon(
      center,
      1e-6,
    );
  });
});
