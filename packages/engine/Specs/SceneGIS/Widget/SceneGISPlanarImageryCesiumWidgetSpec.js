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

  function expectApproximateSolid(expected, tolerance = 2) {
    return function (rgba) {
      for (let component = 0; component < 4; ++component) {
        expect(
          Math.abs(rgba[component] - expected[component]),
        ).toBeLessThanOrEqual(tolerance);
      }
    };
  }

  function hueExpected(rgb, adjustment) {
    const yiq = [
      0.299 * rgb[0] + 0.595716 * rgb[1] + 0.211456 * rgb[2],
      0.587 * rgb[0] - 0.274453 * rgb[1] - 0.522591 * rgb[2],
      0.114 * rgb[0] - 0.321263 * rgb[1] + 0.311135 * rgb[2],
    ];
    const hue = Math.atan2(yiq[2], yiq[1]) + adjustment;
    const chroma = Math.hypot(yiq[2], yiq[1]);
    const color = [yiq[0], chroma * Math.cos(hue), chroma * Math.sin(hue)];
    return [
      color[0] + color[1] + color[2],
      0.9563 * color[0] - 0.2721 * color[1] - 1.107 * color[2],
      0.621 * color[0] - 0.6474 * color[1] + 1.7046 * color[2],
    ]
      .map((component) => Math.min(255, Math.max(0, component)))
      .concat(255);
  }

  function display(rgb) {
    return rgb
      .map((value) => 255 * Math.pow(Math.min(1, Math.max(0, value)), 1 / 2.2))
      .concat(255);
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

    // Adding a shown layer invalidates readiness before its first request.
    expect(world.tilesLoaded).toBe(false);
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
      const halfLinear = display([0.5, 0, 0.5]);
      expect(Math.abs(rgba[0] - halfLinear[0])).toBeLessThanOrEqual(1);
      expect(rgba[1]).toBe(0);
      expect(Math.abs(rgba[2] - halfLinear[2])).toBeLessThanOrEqual(1);
      expect(rgba[3]).toBe(255);
    });
    expect(world._surface._debug.submittedCommands).toBe(1);
    expect(world._surface._renderCommands[0].pass).toBe(Pass.GLOBE);
  });

  it("applies scalar filters without replacing imagery or GPU identities", async function () {
    const world = createWorld();
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValue(Promise.resolve(createImage("rgb(64,128,192)")));
    const layer = world.imageryLayers.addImageryProvider(
      createProvider(world, requestImage),
    );
    createWidget(world);
    widget.render();
    await settleImage();
    expect(widget.scene).toRenderAndCall(
      expectApproximateSolid([64, 128, 192, 255], 0),
    );

    const surface = world._surface;
    const tile = surface._quadtree._idealTiles[0];
    const command = tile.command;
    const identities = {
      requests: surface._imagery._debug.createdRequests,
      textures: surface._imagery._debug.createdTextures,
      binding: tile.imageryBindings.get(layer),
      vertexArray: command.vertexArray,
      command,
      shader: command.shaderProgram,
      shaderMapSize: surface._shaderPrograms.size,
    };

    const linear = [64, 128, 192].map((v) => Math.pow(v / 255, 2.2));
    layer.brightness = 0.5;
    expect(widget.scene).toRenderAndCall(
      expectApproximateSolid(display(linear.map((v) => v * 0.5))),
    );
    layer.brightness = 1.0;
    layer.contrast = 0.5;
    expect(widget.scene).toRenderAndCall(
      expectApproximateSolid(display(linear.map((v) => (v - 0.5) * 0.5 + 0.5))),
    );
    layer.contrast = 1.0;
    layer.gamma = 2.0;
    expect(widget.scene).toRenderAndCall(
      expectApproximateSolid(
        display([64, 128, 192].map((v) => Math.sqrt(v / 255))),
      ),
    );
    layer.gamma = 1.0;
    layer.saturation = 0.0;
    expect(widget.scene).toRenderAndCall(
      expectApproximateSolid(
        display(
          Array(3).fill(
            linear[0] * 0.2125 + linear[1] * 0.7154 + linear[2] * 0.0721,
          ),
        ),
      ),
    );
    layer.saturation = 1.0;
    layer.hue = Math.PI;
    expect(widget.scene).toRenderAndCall(
      expectApproximateSolid(
        display(hueExpected(linear, Math.PI).slice(0, 3)),
        3,
      ),
    );

    expect(requestImage).toHaveBeenCalledTimes(1);
    expect(surface._imagery._debug.createdRequests).toBe(identities.requests);
    expect(surface._imagery._debug.createdTextures).toBe(identities.textures);
    expect(tile.imageryBindings.get(layer)).toBe(identities.binding);
    expect(tile.command.vertexArray).toBe(identities.vertexArray);
    expect(tile.command).toBe(identities.command);
    expect(tile.command.shaderProgram).toBe(identities.shader);
    expect(surface._shaderPrograms.size).toBe(identities.shaderMapSize);
  });

  it("applies strict raw color-to-alpha before layer alpha and composition", async function () {
    const world = createWorld();
    world.imageryLayers.addImageryProvider(
      createProvider(world, () => Promise.resolve(createImage("rgb(255,0,0)"))),
    );
    const top = world.imageryLayers.add(
      new SceneGISPlanarImageryLayer(
        createProvider(world, () =>
          Promise.resolve(createImage("rgb(0,0,255)")),
        ),
        {
          alpha: 0.5,
          colorToAlpha: Color.BLUE,
          colorToAlphaThreshold: 0.01,
        },
      ),
    );
    createWidget(world);
    widget.render();
    await settleImage();
    expect(widget.scene).toRenderAndCall(expectSolid([255, 0, 0, 255]));

    top.colorToAlpha = Color.RED;
    expect(widget.scene).toRenderAndCall(
      expectApproximateSolid(display([0.5, 0, 0.5]), 1),
    );
    top.colorToAlpha = Color.BLUE;
    top.colorToAlphaThreshold = 0.0;
    expect(widget.scene).toRenderAndCall(
      expectApproximateSolid(display([0.5, 0, 0.5]), 1),
    );
    top.colorToAlpha = undefined;
    top.brightness = 0.5;
    expect(widget.scene).toRenderAndCall(
      expectApproximateSolid(display([0.5, 0, 0.25]), 1),
    );
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

  it("links the maximum layer variant and rejects one more before mutation", async function () {
    const world = createWorld();
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.callFake(() => Promise.resolve(createImage("rgb(255,0,0)")));
    createWidget(world);
    const gl = widget.scene.context._gl;
    const maximum = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    const maximumFragmentUniformVectors = gl.getParameter(
      gl.MAX_FRAGMENT_UNIFORM_VECTORS,
    );
    expect(maximum).toBeGreaterThan(0);
    expect(maximumFragmentUniformVectors).toBeGreaterThan(0);
    for (let i = 0; i < maximum; ++i) {
      world.imageryLayers.addImageryProvider(
        createProvider(world, requestImage),
      );
    }

    widget.render();
    await settleImage();
    expect(widget.scene).toRenderAndCall(expectSolid([255, 0, 0, 255]));
    expect(requestImage).toHaveBeenCalledTimes(maximum);
    expect(world._surface._renderCommands[0].shaderProgram).toBeDefined();

    const commands = world._surface._renderCommands.slice();
    const shaders = world._surface._debug.createdShaders;
    const createdTiles = world._surface._quadtree._debug.createdTiles;
    world.imageryLayers.addImageryProvider(createProvider(world, requestImage));
    expect(function () {
      widget.render();
    }).toThrowDeveloperError();
    expect(requestImage).toHaveBeenCalledTimes(maximum);
    expect(world._surface._quadtree._debug.createdTiles).toBe(createdTiles);
    expect(world._surface._renderCommands).toEqual(commands);
    expect(world._surface._debug.createdShaders).toBe(shaders);
  });

  it("keeps settled hidden imagery stable across filter mutations", async function () {
    const world = createWorld({ baseColor: Color.BLUE });
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValue(Promise.resolve(createImage("rgb(255,0,0)")));
    const layer = world.imageryLayers.addImageryProvider(
      createProvider(world, requestImage),
    );
    createWidget(world);
    widget.render();
    await settleImage();
    widget.render();

    layer.show = false;
    expect(widget.scene).toRenderAndCall(expectSolid([0, 0, 255, 255]));
    const surface = world._surface;
    const commands = surface._renderCommands.slice();
    const imageryDebug = { ...surface._imagery._debug };
    const surfaceDebug = { ...surface._debug };
    const runtimes = surface._imagery._runtimes;
    expect(world.tilesLoaded).toBe(true);

    layer.brightness = 0.5;
    layer.contrast = 0.5;
    layer.hue = 0.5;
    layer.saturation = 0.5;
    layer.gamma = 2.0;
    layer.colorToAlpha = Color.RED;
    layer.colorToAlphaThreshold = 0.5;

    expect(surface._renderCommands).toEqual(commands);
    expect(surface._imagery._debug).toEqual(imageryDebug);
    expect(surface._debug).toEqual(surfaceDebug);
    expect(surface._imagery._runtimes).toBe(runtimes);
    expect(surface._imagery.tilesLoaded).toBe(true);
    expect(surface.tilesLoaded).toBe(true);
    expect(world.tilesLoaded).toBe(true);
    expect(requestImage).toHaveBeenCalledTimes(1);

    if (widget.scene.pickPositionSupported && !window.webglStub) {
      widget.scene.pickTranslucentDepth = true;
      const depthBefore = surface._debug.depthSubmittedCommands;
      expect(widget.scene.pickPosition(new Cartesian2(8, 8))).toBeDefined();
      expect(surface._renderCommands).toEqual(commands);
      expect(surface._imagery._debug).toEqual(imageryDebug);
      expect(surface._debug.depthSubmittedCommands).toBeGreaterThan(
        depthBefore,
      );
    }

    expect(widget.scene).toRenderAndCall(expectSolid([0, 0, 255, 255]));
    expect(requestImage).toHaveBeenCalledTimes(1);
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
