import {
  Cartesian2,
  CesiumWidget,
  Color,
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import SceneTransforms from "../../../Source/Scene/SceneTransforms.js";

describe("SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget", function () {
  let container;
  let widget;
  let controller;

  function createWorld(offset = 0.0) {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: offset - 128.0,
          minimumY: offset - 128.0,
          maximumX: offset + 128.0,
          maximumY: offset + 128.0,
        }),
      }),
      maximumLevel: 2,
      baseColor: Color.LIME,
    });
  }

  function createNavigationWidget(world) {
    const contextOptions = { webgl: {} };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    widget.scene.screenSpaceCameraController.enableInputs = false;
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(widget.scene);
    return widget.scene;
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "32px";
    container.style.height = "32px";
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

  it("matches normal-frame depth picking when pickTranslucentDepth is false", function () {
    const world = createWorld();
    const scene = createNavigationWidget(world);

    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    const mathematical = world.pickFromWindowPosition(center, scene);
    expect(mathematical.x).toEqualEpsilon(0.0, 1e-12);
    expect(mathematical.y).toEqualEpsilon(0.0, 1e-12);

    scene.render();
    expect(world._surface._debug.submittedCommands).toBeGreaterThan(0);
    const rgba = scene.context.readPixels({
      x: Math.floor(scene.drawingBufferWidth * 0.5),
      y: Math.floor(scene.drawingBufferHeight * 0.5),
      width: 1,
      height: 1,
    });
    expect(Array.from(rgba)).toEqual([0, 255, 0, 255]);
    if (scene.pickPositionSupported && !window.webglStub) {
      expect(scene.pickTranslucentDepth).toBe(false);
      const drawing = SceneTransforms.transformWindowToDrawingBuffer(
        scene,
        center,
        new Cartesian2(),
      );
      const normalPickDepth = scene._view.pickDepths[0];
      const normalRawDepth = normalPickDepth?.getDepth(
        scene.context,
        drawing.x,
        scene.drawingBufferHeight - drawing.y,
      );
      const normalDiagnostic = {
        client: [center.x, center.y],
        drawing: [drawing.x, scene.drawingBufferHeight - drawing.y],
        drawingBuffer: [scene.drawingBufferWidth, scene.drawingBufferHeight],
        rawDepth: normalRawDepth,
        frustums: scene._view.frustumCommandsList.map((item) => ({
          near: item.near,
          far: item.far,
        })),
        cachedCommands: world._surface._renderCommands.length,
        submittedCommands: world._surface._debug.submittedCommands,
      };
      const depth = scene.pickPosition(center);
      expect(normalRawDepth)
        .withContext(JSON.stringify(normalDiagnostic))
        .toBeGreaterThan(0.0);
      expect(normalRawDepth)
        .withContext(JSON.stringify(normalDiagnostic))
        .toBeLessThan(1.0);
      expect(depth).withContext(JSON.stringify(normalDiagnostic)).toBeDefined();
      expect(depth).toEqualEpsilon(mathematical, 1e-4);
    }

    const aggregator = controller._aggregator;
    widget.removeController(controller);
    expect(aggregator.isDestroyed()).toBe(true);
    expect(world.isDestroyed()).toBe(false);
  });

  it("replays cached surface commands for a first translucent-depth query", function () {
    const world = createWorld();
    const scene = createNavigationWidget(world);
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    const mathematical = world.pickFromWindowPosition(center, scene);
    scene.render();

    if (scene.pickPositionSupported && !window.webglStub) {
      scene.pickTranslucentDepth = true;
      const replayBefore = world._surface._debug.depthSubmittedCommands;
      const depth = scene.pickPosition(center);
      const drawing = SceneTransforms.transformWindowToDrawingBuffer(
        scene,
        center,
        new Cartesian2(),
      );
      const replayPickDepth = scene._view.pickDepths[0];
      const replayRawDepth = replayPickDepth?.getDepth(
        scene.context,
        drawing.x,
        scene.drawingBufferHeight - drawing.y,
      );
      const replayDiagnostic = {
        drawing: [drawing.x, scene.drawingBufferHeight - drawing.y],
        rawDepth: replayRawDepth,
        replayBefore,
        replayAfter: world._surface._debug.depthSubmittedCommands,
        cachedCommands: world._surface._renderCommands.length,
        frustums: scene._view.frustumCommandsList.map((item) => ({
          near: item.near,
          far: item.far,
        })),
      };
      expect(replayRawDepth)
        .withContext(JSON.stringify(replayDiagnostic))
        .toBeGreaterThan(0.0);
      expect(replayRawDepth)
        .withContext(JSON.stringify(replayDiagnostic))
        .toBeLessThan(1.0);
      expect(depth).withContext(JSON.stringify(replayDiagnostic)).toBeDefined();
      expect(depth).toEqualEpsilon(mathematical, 1e-4);
      expect(world._surface._debug.depthSubmittedCommands).toBeGreaterThan(
        replayBefore,
      );

      const outside = new Cartesian2(-1000.0, -1000.0);
      expect(world.pickFromWindowPosition(outside, scene)).toBeUndefined();
      expect(scene.pickPosition(outside)).toBeUndefined();
    }
  });

  it("produces nonzero linear depth when logarithmic depth is disabled", function () {
    const world = createWorld();
    const scene = createNavigationWidget(world);
    scene.logarithmicDepthBuffer = false;
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    const mathematical = world.pickFromWindowPosition(center, scene);

    scene.render();

    if (scene.pickPositionSupported && !window.webglStub) {
      const drawing = SceneTransforms.transformWindowToDrawingBuffer(
        scene,
        center,
        new Cartesian2(),
      );
      const rawDepth = scene._view.pickDepths[0]?.getDepth(
        scene.context,
        drawing.x,
        scene.drawingBufferHeight - drawing.y,
      );
      expect(scene.frameState.useLogDepth).toBe(false);
      expect(rawDepth).toBeGreaterThan(0.0);
      expect(rawDepth).toBeLessThan(1.0);
      expect(scene.pickPosition(center)).toEqualEpsilon(mathematical, 1e-4);
    }
  });

  it("matches rendered depth at a large absolute coordinate offset", function () {
    const offset = 1.0e9;
    const world = createWorld(offset);
    const scene = createNavigationWidget(world);
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    const mathematical = world.pickFromWindowPosition(center, scene);
    expect(mathematical.x).toBe(offset);
    expect(mathematical.y).toBe(offset);

    scene.render();

    if (scene.pickPositionSupported && !window.webglStub) {
      const drawing = SceneTransforms.transformWindowToDrawingBuffer(
        scene,
        center,
        new Cartesian2(),
      );
      const rawDepth = scene._view.pickDepths[0]?.getDepth(
        scene.context,
        drawing.x,
        scene.drawingBufferHeight - drawing.y,
      );
      expect(rawDepth).toBeGreaterThan(0.0);
      expect(rawDepth).toBeLessThan(1.0);
      expect(scene.pickPosition(center)).toEqualEpsilon(mathematical, 1e-3);
    }
  });
});
