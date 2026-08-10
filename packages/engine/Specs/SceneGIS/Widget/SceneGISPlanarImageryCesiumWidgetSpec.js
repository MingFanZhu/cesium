import {
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  Credit,
  Event,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarWorld,
} from "../../../index.js";
import Pass from "../../../Source/Renderer/Pass.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";

describe("SceneGIS/Widget/SceneGISPlanarImageryCesiumWidget", function () {
  let container;
  let widget;

  function createWorld(options = {}) {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: options.minimum ?? -128,
          minimumY: options.minimum ?? -128,
          maximumX: (options.minimum ?? -128) + 256,
          maximumY: (options.minimum ?? -128) + 256,
        }),
      }),
      maximumLevel: options.maximumLevel ?? 0,
      maximumScreenSpaceError: options.maximumScreenSpaceError ?? 2,
      tileCacheSize: options.tileCacheSize ?? 100,
      baseColor: options.baseColor ?? Color.BLACK,
    });
  }

  function createImage(cssColor, size = 2) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.fillStyle = cssColor;
    context.fillRect(0, 0, size, size);
    return canvas;
  }

  function createQuadrantImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    context.fillStyle = "red";
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = "lime";
    context.fillRect(1, 0, 1, 1);
    context.fillStyle = "blue";
    context.fillRect(0, 1, 1, 1);
    context.fillStyle = "yellow";
    context.fillRect(1, 1, 1, 1);
    return canvas;
  }

  function createProvider(world, requestImage, options = {}) {
    return {
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: options.maximumLevel ?? world.maximumLevel,
      tileWidth: 2,
      tileHeight: 2,
      hasAlphaChannel: true,
      errorEvent: new Event(),
      credit: options.credit,
      requestImage,
    };
  }

  function createWidget(world) {
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    widget.scene.highDynamicRange = false;
    widget.scene.rethrowRenderErrors = true;
    widget.scene.camera.setView({
      destination: new Cartesian3(
        world.coordinateSystem.extent.minimumX + 128,
        world.coordinateSystem.extent.minimumY + 128,
        64,
      ),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: new Cartesian3(0, 1, 0),
      },
    });
  }

  async function settleImage() {
    await Promise.resolve();
    await Promise.resolve();
  }

  function expectSolid(expected) {
    return function (rgba) {
      for (let i = 0; i < rgba.length; i += 4) {
        expect(Array.from(rgba.slice(i, i + 4))).toEqual(expected);
      }
    };
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "16px";
    container.style.height = "16px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    document.body.removeChild(container);
  });

  it("loads local imagery over baseColor and reaches a stable warm frame", async function () {
    const world = createWorld({ baseColor: Color.BLUE });
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValue(Promise.resolve(createImage("rgb(255,0,0)")));
    const credit = new Credit("Local fixture");
    world.imageryLayers.add(
      new SceneGISPlanarImageryLayer(
        createProvider(world, requestImage, { credit }),
      ),
    );
    createWidget(world);

    expect(world.tilesLoaded).toBe(true);
    expect(widget.scene).toRenderAndCall(expectSolid([0, 0, 255, 255]));
    expect(world.tilesLoaded).toBe(false);
    await settleImage();
    expect(widget.scene).toRenderAndCall(expectSolid([255, 0, 0, 255]));
    expect(world.tilesLoaded).toBe(true);
    expect(requestImage).toHaveBeenCalledTimes(1);

    const surface = world._surface;
    const tile = surface._quadtree._idealTiles[0];
    const imageryBindings = tile.imageryBindings;
    const imageryRelease = tile._imageryRelease;
    const before = {
      requests: surface._imagery._debug.createdRequests,
      textures: surface._imagery._debug.createdTextures,
      shaders: surface._debug.createdShaders,
      commands: surface._debug.createdCommands,
      bindings: surface._imagery._debug.createdBindings,
    };
    expect(widget.scene).toRenderAndCall(expectSolid([255, 0, 0, 255]));
    expect({
      requests: surface._imagery._debug.createdRequests,
      textures: surface._imagery._debug.createdTextures,
      shaders: surface._debug.createdShaders,
      commands: surface._debug.createdCommands,
      bindings: surface._imagery._debug.createdBindings,
    }).toEqual(before);
    expect(tile.imageryBindings).toBe(imageryBindings);
    expect(tile._imageryRelease).toBe(imageryRelease);
    expect(surface._debug.submittedCommands).toBe(1);

    if (widget.scene.pickPositionSupported && !window.webglStub) {
      widget.scene.pickTranslucentDepth = true;
      const commands = surface._renderCommands.slice();
      const imageryDebug = { ...surface._imagery._debug };
      const depthBefore = surface._debug.depthSubmittedCommands;
      const position = widget.scene.pickPosition(new Cartesian2(8, 8));
      expect(position).toBeDefined();
      expect(surface._renderCommands).toEqual(commands);
      expect(surface._imagery._debug).toEqual(imageryDebug);
      expect(surface._debug.depthSubmittedCommands).toBeGreaterThan(
        depthBefore,
      );
    }
  });

  it("composes layers bottom-to-top in one Globe-pass command", async function () {
    const world = createWorld();
    world.imageryLayers.addImageryProvider(
      createProvider(world, () => Promise.resolve(createImage("rgb(255,0,0)"))),
    );
    world.imageryLayers.add(
      new SceneGISPlanarImageryLayer(
        createProvider(world, () =>
          Promise.resolve(createImage("rgb(0,0,255)")),
        ),
        { alpha: 0.5 },
      ),
    );
    createWidget(world);
    widget.render();
    await settleImage();
    expect(widget.scene).toRenderAndCall(function (rgba) {
      expect(Math.abs(rgba[0] - 128)).toBeLessThanOrEqual(1);
      expect(rgba[1]).toBe(0);
      expect(Math.abs(rgba[2] - 128)).toBeLessThanOrEqual(1);
      expect(rgba[3]).toBe(255);
    });
    expect(world._surface._debug.submittedCommands).toBe(1);
    expect(world._surface._renderCommands[0].pass).toBe(Pass.GLOBE);
  });

  it("uses a ready root ancestor without settling pending desired tiles", async function () {
    const world = createWorld({
      maximumLevel: 1,
      maximumScreenSpaceError: 0.01,
    });
    const pending = new Map();
    const provider = createProvider(
      world,
      (x, y, level) =>
        new Promise((resolve) => pending.set(`${level}/${x}/${y}`, resolve)),
      { maximumLevel: 1 },
    );
    world.imageryLayers.addImageryProvider(provider);
    createWidget(world);
    widget.render();
    expect(pending.has("0/0/0")).toBe(true);
    pending.get("0/0/0")(createImage("rgb(0,255,0)"));
    await settleImage();
    expect(widget.scene).toRenderAndCall(expectSolid([0, 255, 0, 255]));
    expect(world.tilesLoaded).toBe(false);
    expect(world._surface._debug.submittedCommands).toBe(4);
  });

  it("releases lazy imagery state during cache-size-zero eviction", function () {
    const world = createWorld({
      maximumLevel: 1,
      maximumScreenSpaceError: 0.01,
      tileCacheSize: 0,
    });
    world.imageryLayers.addImageryProvider(
      createProvider(world, () => undefined, { maximumLevel: 1 }),
    );
    createWidget(world);
    widget.render();
    const surface = world._surface;
    const children = surface._quadtree._idealTiles.slice();
    expect(children.length).toBe(4);
    for (const tile of children) {
      expect(tile.imageryBindings).toBeDefined();
      expect(tile._imageryRelease).toBe(surface._imagery._releaseTile);
    }

    widget.scene.camera.position.z = 1.0e8;
    widget.render();
    expect(surface._quadtree._debug.evictedTiles).toBeGreaterThanOrEqual(4);
    for (const tile of children) {
      expect(tile.isDestroyed()).toBe(true);
      expect(tile.imageryBindings).toBeUndefined();
      expect(tile._imageryRelease).toBeUndefined();
    }
    const runtime = surface._imagery._runtimes.values().next().value;
    expect(Array.from(runtime.entries.keys())).toEqual(["0/0/0"]);
  });

  it("rejects the texture-unit limit before requests or selection mutation", function () {
    const world = createWorld();
    const requestImage = jasmine.createSpy("requestImage");
    createWidget(world);
    widget.render();
    const commands = world._surface._renderCommands.slice();
    const shaders = world._surface._debug.createdShaders;
    for (let i = 0; i < 128; ++i) {
      world.imageryLayers.addImageryProvider(
        createProvider(world, requestImage),
      );
    }
    const createdTiles = world._surface._quadtree._debug.createdTiles;
    expect(function () {
      widget.render();
    }).toThrowDeveloperError();
    expect(requestImage).not.toHaveBeenCalled();
    expect(world._surface._quadtree._debug.createdTiles).toBe(createdTiles);
    expect(world._surface._renderCommands).toEqual(commands);
    expect(world._surface._debug.createdShaders).toBe(shaders);
  });

  it("releases hidden imagery and destroys owned resources exactly once", async function () {
    const world = createWorld();
    const provider = createProvider(world, () =>
      Promise.resolve(createImage("rgb(255,0,0)")),
    );
    provider.destroy = jasmine.createSpy("destroy");
    const layer = world.imageryLayers.addImageryProvider(provider);
    createWidget(world);
    widget.render();
    await settleImage();
    widget.render();
    const surface = world._surface;
    expect(surface._imagery._debug.createdTextures).toBe(1);

    layer.show = false;
    widget.render();
    expect(world.tilesLoaded).toBe(true);
    expect(surface._imagery._debug.destroyedTextures).toBe(1);

    layer.show = true;
    widget.render();
    expect(world.tilesLoaded).toBe(false);
    await settleImage();
    widget.render();
    expect(surface._imagery._debug.createdTextures).toBe(2);

    widget = widget.destroy();
    expect(surface._imagery._debug.destroyedTextures).toBe(2);
    expect(surface._debug.destroyedTextures).toBe(1);
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(layer.isDestroyed()).toBe(true);
  });

  it("reports mismatched tile dimensions and settles on baseColor", async function () {
    const world = createWorld({ baseColor: Color.LIME });
    const provider = createProvider(world, () =>
      Promise.resolve(createImage("rgb(255,0,0)", 1)),
    );
    const errors = [];
    provider.errorEvent.addEventListener((error) => errors.push(error));
    world.imageryLayers.addImageryProvider(provider);
    createWidget(world);
    widget.render();
    await settleImage();
    expect(widget.scene).toRenderAndCall(expectSolid([0, 255, 0, 255]));
    expect(errors.length).toBe(1);
    expect(errors[0].level).toBe(0);
    expect(world.tilesLoaded).toBe(true);
    expect(world._surface._imagery._debug.createdTextures).toBe(0);
  });

  it("renders imagery at a large absolute planar offset", async function () {
    const world = createWorld({ minimum: 1.0e9 });
    world.imageryLayers.addImageryProvider(
      createProvider(world, () => Promise.resolve(createImage("rgb(255,0,0)"))),
    );
    createWidget(world);
    widget.render();
    await settleImage();
    expect(widget.scene).toRenderAndCall(expectSolid([255, 0, 0, 255]));
    const tile = world._surface._quadtree._idealTiles[0];
    expect(tile.modelMatrix[12]).toBe(1.0e9 + 128);
  });

  it("keeps image north at world north and X increasing east", async function () {
    const world = createWorld();
    world.imageryLayers.addImageryProvider(
      createProvider(world, () => Promise.resolve(createQuadrantImage())),
    );
    createWidget(world);
    widget.render();
    await settleImage();
    widget.render();
    const pixels = widget.scene.context.readPixels();
    const width = widget.scene.drawingBufferWidth;
    const height = widget.scene.drawingBufferHeight;
    function pixel(x, y) {
      const offset = (y * width + x) * 4;
      return Array.from(pixels.slice(offset, offset + 4));
    }
    const southwest = pixel(0, 0);
    const southeast = pixel(width - 1, 0);
    const northwest = pixel(0, height - 1);
    const northeast = pixel(width - 1, height - 1);
    expect(southwest[2]).toBeGreaterThan(southwest[0]);
    expect(southwest[2]).toBeGreaterThan(southwest[1]);
    expect(southeast[0]).toBeGreaterThan(southeast[2]);
    expect(southeast[1]).toBeGreaterThan(southeast[2]);
    expect(northwest[0]).toBeGreaterThan(northwest[1]);
    expect(northwest[0]).toBeGreaterThan(northwest[2]);
    expect(northeast[1]).toBeGreaterThan(northeast[0]);
    expect(northeast[1]).toBeGreaterThan(northeast[2]);
  });
});
