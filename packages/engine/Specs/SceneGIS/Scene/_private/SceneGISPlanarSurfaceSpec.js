import {
  Cartesian3,
  Color,
  Intersect,
  OrthographicFrustum,
  PerspectiveFrustum,
  Scene,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "../../../../index.js";
import createCanvas from "../../../../../../Specs/createCanvas.js";
import getWebGLStub from "../../../../../../Specs/getWebGLStub.js";

describe("SceneGIS/Scene/SceneGISPlanarSurface", function () {
  let scene;

  function createWorld(options = {}) {
    const minimum = options.minimum ?? -128.0;
    const size = options.size ?? 256.0;
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: minimum,
          minimumY: minimum,
          maximumX: minimum + size,
          maximumY: minimum + size,
        }),
      }),
      maximumLevel: options.maximumLevel ?? 3,
      maximumScreenSpaceError: options.maximumScreenSpaceError ?? 2.0,
      tileCacheSize: options.tileCacheSize ?? 100,
      baseColor: options.baseColor ?? Color.RED,
    });
  }

  function createPlanarScene(world, width, height) {
    const canvas = createCanvas(width, height);
    const contextOptions = { webgl: { antialias: false, stencil: true } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    const result = new Scene({ canvas, contextOptions });
    result._initializeWorld(world);
    result.highDynamicRange = false;
    result.destroyForSpecs = function () {
      const sceneCanvas = this.canvas;
      this.destroy();
      document.body.removeChild(sceneCanvas);
    };
    result.renderForSpecs = function (time) {
      this.initializeFrame();
      this.render(time);
    };
    return result;
  }

  function pointCameraAt(world, height = 64.0) {
    const extent = world.coordinateSystem.extent;
    const centerX = extent.minimumX + extent.width * 0.5;
    const centerY = extent.minimumY + extent.height * 0.5;
    Cartesian3.fromElements(centerX, centerY, height, scene.camera.position);
    Cartesian3.clone(Cartesian3.UNIT_X, scene.camera.right);
    Cartesian3.clone(Cartesian3.UNIT_Y, scene.camera.up);
    Cartesian3.negate(Cartesian3.UNIT_Z, scene.camera.direction);
  }

  afterEach(function () {
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
  });

  it("lazily creates one shared unit quad and renders the base color", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    scene.backgroundColor = Color.BLACK;
    pointCameraAt(world);

    expect(world._surface._vertexArray).toBeUndefined();
    expect(scene).toRender([255, 0, 0, 255]);

    const surface = world._surface;
    expect(surface._debug.createdBuffers).toBe(1);
    expect(surface._debug.createdVertexArrays).toBe(1);
    expect(surface._debug.createdShaders).toBe(1);
    expect(Math.min(...surface._unitQuad)).toBe(-0.5);
    expect(Math.max(...surface._unitQuad)).toBe(0.5);
    expect(surface._vertexArray._attributes[0].vertexBuffer.sizeInBytes).toBe(
      12 * Float32Array.BYTES_PER_ELEMENT,
    );
  });

  it("does not select or allocate for a zero-sized drawing buffer", function () {
    const world = createWorld();
    const frameState = {
      frameNumber: 1,
      passes: { render: true },
      context: { drawingBufferWidth: 0, drawingBufferHeight: 0 },
      commandList: [],
    };

    world.beginFrame(frameState);
    world.render(frameState);

    expect(frameState.commandList).toEqual([]);
    expect(world._surface._quadtree._debug.visited).toBe(0);
    expect(world._surface._vertexArray).toBeUndefined();
    expect(world._surface._context).toBeUndefined();

    frameState.frameNumber = 2;
    frameState.context = { drawingBufferWidth: 1, drawingBufferHeight: 1 };
    frameState.pixelRatio = 1.0;
    frameState.cullingVolume = {
      computeVisibility: () => Intersect.OUTSIDE,
    };
    frameState.camera = {
      positionWC: new Cartesian3(0.0, 0.0, 64.0),
      frustum: new PerspectiveFrustum({
        fov: Math.PI / 3.0,
        aspectRatio: 1.0,
        near: 1.0,
        far: 1000.0,
      }),
    };
    world.beginFrame(frameState);
    world.render(frameState);
    expect(world._surface._context).toBeUndefined();
    world.destroy();
  });

  it("submits no command while hidden and reuses resources after restore", function () {
    const world = createWorld();
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const before = { ...world._surface._debug };

    world.show = false;
    scene.renderForSpecs();
    expect(world._surface._debug.submittedCommands).toBe(0);

    world.show = true;
    scene.renderForSpecs();
    expect(world._surface._debug.createdBuffers).toBe(before.createdBuffers);
    expect(world._surface._debug.createdShaders).toBe(before.createdShaders);
  });

  it("has zero allocation deltas on an identical warm frame", function () {
    const world = createWorld();
    scene = createPlanarScene(world);
    pointCameraAt(world, 128.0);
    scene.renderForSpecs();
    const surface = world._surface;
    expect(surface._quadtree._debug.visited).toBe(1);
    expect(surface._quadtree._debug.culled).toBe(0);
    expect(surface._quadtree._debug.selected).toBe(1);
    expect(surface._debug.submittedCommands).toBe(1);
    expect(surface._quadtree._tiles.size).toBe(1);
    const before = {
      tiles: surface._quadtree._debug.createdTiles,
      commands: surface._debug.createdCommands,
      buffers: surface._debug.createdBuffers,
      shaders: surface._debug.createdShaders,
      resident: surface._quadtree._tiles.size,
    };

    scene.renderForSpecs();

    expect(surface._quadtree._debug.createdTiles).toBe(before.tiles);
    expect(surface._debug.createdCommands).toBe(before.commands);
    expect(surface._debug.createdBuffers).toBe(before.buffers);
    expect(surface._debug.createdShaders).toBe(before.shaders);
    expect(surface._quadtree._tiles.size).toBe(before.resident);
  });

  it("does not duplicate commands when render is repeated in one frame", function () {
    const world = createWorld();
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const commandCount = scene.frameState.commandList.length;

    world.render(scene.frameState);

    expect(scene.frameState.commandList.length).toBe(commandCount);
  });

  it("refines perspective and orthographic views deterministically", function () {
    const world = createWorld({ maximumLevel: 3 });
    scene = createPlanarScene(world);
    const frameState = {
      frameNumber: 1,
      context: scene.context,
      pixelRatio: 1.0,
      passes: { render: true },
      commandList: [],
      cullingVolume: {
        computeVisibility: () => Intersect.INSIDE,
      },
      camera: {
        positionWC: new Cartesian3(0.0, 0.0, 1.0e8),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3.0,
          aspectRatio: 1.0,
          near: 1.0,
          far: 2.0e8,
        }),
      },
    };
    world.beginFrame(frameState);
    world.render(frameState);
    const farLevel = Math.max(
      ...world._surface._quadtree._idealTiles.map((tile) => tile.level),
    );

    ++frameState.frameNumber;
    frameState.commandList.length = 0;
    frameState.camera.positionWC.z = 0.01;
    world.beginFrame(frameState);
    world.render(frameState);
    const nearLevel = Math.max(
      ...world._surface._quadtree._idealTiles.map((tile) => tile.level),
    );
    expect(nearLevel).toBeGreaterThan(farLevel);

    ++frameState.frameNumber;
    frameState.commandList.length = 0;
    frameState.camera.frustum = new OrthographicFrustum({
      width: 1024.0,
      aspectRatio: 1.0,
      near: 1.0,
      far: 10000.0,
    });
    world.beginFrame(frameState);
    world.render(frameState);
    const wideLevel = Math.max(
      ...world._surface._quadtree._idealTiles.map((tile) => tile.level),
    );

    ++frameState.frameNumber;
    frameState.commandList.length = 0;
    frameState.camera.frustum.width = 0.01;
    frameState.camera.positionWC.z = 1000.0;
    world.beginFrame(frameState);
    world.render(frameState);
    const narrowLevel = Math.max(
      ...world._surface._quadtree._idealTiles.map((tile) => tile.level),
    );
    expect(narrowLevel).toBeGreaterThan(wideLevel);
  });

  it("leaves pixels outside the configured world extent at background", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world, 3, 1);
    scene.backgroundColor = Color.BLACK;
    scene.camera.frustum = new OrthographicFrustum({
      width: 768.0,
      aspectRatio: 3.0,
      near: 1.0,
      far: 1000.0,
    });
    pointCameraAt(world);

    scene.renderForSpecs();

    expect(scene.context.readPixels()).toEqual([
      0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255,
    ]);
  });

  it("does not release shared GPU resources during tile eviction", function () {
    const world = createWorld({ maximumLevel: 1, tileCacheSize: 0 });
    scene = createPlanarScene(world);
    const surface = world._surface;
    const frameState = {
      frameNumber: 1,
      context: scene.context,
      pixelRatio: 1.0,
      passes: { render: true },
      commandList: [],
      cullingVolume: {
        computeVisibility: () => Intersect.INSIDE,
      },
      camera: {
        positionWC: new Cartesian3(0.0, 0.0, 0.0),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3.0,
          aspectRatio: 1.0,
          near: 1.0,
          far: 2.0e8,
        }),
      },
    };
    world.beginFrame(frameState);
    world.render(frameState);
    world.endFrame(frameState);
    const vertexArray = surface._vertexArray;
    const shaderProgram = surface._shaderProgram;

    ++frameState.frameNumber;
    frameState.commandList.length = 0;
    frameState.camera.positionWC.z = 1.0e8;
    world.beginFrame(frameState);
    world.render(frameState);
    world.endFrame(frameState);

    expect(surface._quadtree._debug.evictedTiles).toBe(5);
    expect(surface._vertexArray).toBe(vertexArray);
    expect(surface._shaderProgram).toBe(shaderProgram);
    expect(surface._debug.createdBuffers).toBe(1);
    expect(surface._debug.createdShaders).toBe(1);
    expect(surface._debug.destroyedVertexArrays).toBe(0);
    expect(surface._debug.destroyedBuffers).toBe(0);
    expect(surface._debug.destroyedShaders).toBe(0);
  });

  it("changes color without rebuilding shared resources", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    expect(scene).toRender([255, 0, 0, 255]);
    const surface = world._surface;

    world.baseColor = Color.BLUE;
    expect(scene).toRender([0, 0, 255, 255]);
    expect(surface._debug.createdBuffers).toBe(1);
    expect(surface._debug.createdShaders).toBe(1);
  });

  it("renders large absolute coordinates through a finite model matrix", function () {
    const world = createWorld({
      minimum: 1.0e9,
      size: 1024.0,
      maximumLevel: 1,
    });
    scene = createPlanarScene(world);
    pointCameraAt(world, 256.0);

    expect(scene).toRender([255, 0, 0, 255]);
    for (const tile of world._surface._quadtree._idealTiles) {
      for (let i = 0; i < 16; ++i) {
        expect(Number.isFinite(tile.modelMatrix[i])).toBe(true);
      }
    }
  });

  it("destroys owned GPU resources exactly once with the Scene", function () {
    const world = createWorld();
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const surface = world._surface;

    scene.destroyForSpecs();
    scene = undefined;

    expect(world.isDestroyed()).toBe(true);
    expect(surface.isDestroyed()).toBe(true);
    expect(surface._debug.destroyedVertexArrays).toBe(1);
    expect(surface._debug.destroyedBuffers).toBe(1);
    expect(surface._debug.destroyedShaders).toBe(1);
    expect(surface._quadtree._tiles.size).toBe(0);
  });

  it("rejects rendering shared resources with a second Context", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();

    const secondScene = createPlanarScene(createWorld({ maximumLevel: 0 }));
    const secondWorld = secondScene.world;
    try {
      secondScene.camera.setView({
        destination: new Cartesian3(0.0, 0.0, 64.0),
        orientation: {
          direction: new Cartesian3(0.0, 0.0, -1.0),
          up: new Cartesian3(0.0, 1.0, 0.0),
        },
      });
      secondScene.renderForSpecs();
      const frameState = secondScene.frameState;
      frameState.frameNumber = scene.frameState.frameNumber + 100;
      expect(() => {
        world.beginFrame(frameState);
        world.render(frameState);
      }).toThrowDeveloperError(
        "SceneGISPlanarWorld cannot render with more than one Context.",
      );
    } finally {
      secondScene.destroyForSpecs();
      expect(secondWorld.isDestroyed()).toBe(true);
    }
  });

  it("rejects zero-buffer and offscreen second Contexts before mutation", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const surface = world._surface;
    const frameNumber = surface._frameNumber;
    const visited = surface._quadtree._debug.visited;
    const renderedFrameNumber = surface._renderedFrameNumber;

    const zeroBuffer = {
      frameNumber: frameNumber + 1,
      context: { drawingBufferWidth: 0, drawingBufferHeight: 0 },
      passes: { render: true },
      commandList: [],
    };
    expect(() => world.beginFrame(zeroBuffer)).toThrowDeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );
    expect(() => world.render(zeroBuffer)).toThrowDeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );

    const offscreen = {
      frameNumber: frameNumber + 2,
      context: { drawingBufferWidth: 1, drawingBufferHeight: 1 },
      pixelRatio: 1.0,
      passes: { render: true },
      commandList: [],
      cullingVolume: {
        computeVisibility: () => Intersect.OUTSIDE,
      },
      camera: {
        positionWC: new Cartesian3(0.0, 0.0, 64.0),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3.0,
          aspectRatio: 1.0,
          near: 1.0,
          far: 1000.0,
        }),
      },
    };
    expect(() => world.beginFrame(offscreen)).toThrowDeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );
    expect(() => world.render(offscreen)).toThrowDeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );
    expect(surface._frameNumber).toBe(frameNumber);
    expect(surface._renderedFrameNumber).toBe(renderedFrameNumber);
    expect(surface._quadtree._debug.visited).toBe(visited);
  });
});
