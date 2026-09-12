import {
  Cartesian3,
  CesiumWidget,
  Color,
  DirectionalLight,
  Event,
  Material,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Widget/SceneGISPlanarTerrainStylingCesiumWidget", function () {
  let container;
  let widget;
  const materials = [];

  function createRamp(colors) {
    const canvas = document.createElement("canvas");
    canvas.width = colors.length;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    for (let i = 0; i < colors.length; ++i) {
      context.fillStyle = colors[i];
      context.fillRect(i, 0, 1, 1);
    }
    return canvas;
  }

  function createSolidImage(cssColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    context.fillStyle = cssColor;
    context.fillRect(0, 0, 2, 2);
    return canvas;
  }

  function renderFrame() {
    widget.scene.initializeFrame();
    widget.scene.render();
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "64px";
    container.style.height = "64px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    for (const material of materials) {
      if (!material.isDestroyed()) {
        material.destroy();
      }
    }
    materials.length = 0;
    document.body.removeChild(container);
  });

  it("links the four stable terrain Material types and keeps warm identities", function () {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1.0,
          minimumY: -1.0,
          maximumX: 1.0,
          maximumY: 1.0,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.BLUE,
    });
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    widget.scene.rethrowRenderErrors = true;
    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 2.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });

    const contour = Material.fromType(Material.ElevationContourType, {
      spacing: 0.25,
      width: 2.0,
      color: Color.RED,
    });
    const height = Material.fromType(Material.ElevationRampType, {
      image: createRamp(["red", "lime"]),
      minimumHeight: -1.0,
      maximumHeight: 1.0,
    });
    const slope = Material.fromType(Material.SlopeRampMaterialType, {
      image: createRamp(["blue", "yellow"]),
    });
    const aspect = Material.fromType(Material.AspectRampMaterialType, {
      image: createRamp(["magenta", "cyan"]),
    });
    materials.push(contour, height, slope, aspect);

    for (const material of materials) {
      world.material = material;
      expect(() => renderFrame()).not.toThrow();
      expect(world._surface._renderCommands.length).toBe(1);
      expect(world._surface._publishedMaterial).toBe(material);
      expect(world._surface._renderCommands[0].shaderProgram).toBeDefined();
    }

    world.material = contour;
    renderFrame();
    const command = world._surface._renderCommands[0];
    const shader = command.shaderProgram;
    const vertexArray = command.vertexArray;
    contour.uniforms.spacing = 0.5;
    contour.uniforms.color = Color.clone(Color.LIME);
    renderFrame();
    expect(world._surface._renderCommands[0]).toBe(command);
    expect(command.shaderProgram).toBe(shader);
    expect(command.vertexArray).toBe(vertexArray);

    world.material = undefined;
    renderFrame();
    expect(world._surface._publishedMaterial).toBeUndefined();
    expect(
      world._surface._quadtree._renderTiles[0]._materialCommand,
    ).toBeUndefined();
  });

  it("shares the real texture-unit budget between imagery and a Ramp sampler", async function () {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1.0,
          minimumY: -1.0,
          maximumX: 1.0,
          maximumY: 1.0,
        }),
      }),
      maximumLevel: 0,
    });
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    widget.scene.rethrowRenderErrors = true;
    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 2.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });
    const gl = widget.scene.context._gl;
    const maximum = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    expect(maximum).toBeGreaterThan(0);
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.callFake(() => Promise.resolve(createSolidImage("white")));
    function addImageryLayer() {
      world.imageryLayers.addImageryProvider({
        tilingScheme: world.tilingScheme,
        minimumLevel: 0,
        maximumLevel: 0,
        tileWidth: 2,
        tileHeight: 2,
        hasAlphaChannel: true,
        errorEvent: new Event(),
        credit: undefined,
        requestImage,
      });
    }
    for (let i = 0; i < maximum - 1; ++i) {
      addImageryLayer();
    }
    const ramp = Material.fromType(Material.ElevationRampType, {
      image: createRamp(["black", "white"]),
      minimumHeight: 0.0,
      maximumHeight: 1.0,
    });
    materials.push(ramp);
    world.material = ramp;
    renderFrame();
    await Promise.resolve();
    await Promise.resolve();
    expect(() => renderFrame()).not.toThrow();
    expect(requestImage).toHaveBeenCalledTimes(maximum - 1);
    const surface = world._surface;
    const command = surface._renderCommands[0];
    const shaderMapSize = surface._shaderPrograms.size;

    const update = spyOn(ramp, "update").and.callThrough();
    addImageryLayer();
    expect(() => renderFrame()).toThrowDeveloperError();
    expect(update).not.toHaveBeenCalled();
    expect(requestImage).toHaveBeenCalledTimes(maximum - 1);
    expect(surface._publishedMaterial).toBe(ramp);
    expect(surface._renderCommands).toEqual([command]);
    expect(surface._shaderPrograms.size).toBe(shaderMapSize);
  });

  it("keeps the published render state atomic when Material shader compilation fails", function () {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1.0,
          minimumY: -1.0,
          maximumX: 1.0,
          maximumY: 1.0,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.BLUE,
    });
    const good = Material.fromType(Material.ElevationContourType, {
      spacing: 0.25,
      width: 2.0,
      color: Color.RED,
    });
    const bad = new Material({
      fabric: {
        type: "SceneGISInvalidCompileMaterial",
        source: `czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    material.diffuse = sceneGISUndefinedFunction(materialInput.st);
    return material;
}`,
      },
    });
    materials.push(good, bad);
    world.material = good;
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    widget.scene.rethrowRenderErrors = true;
    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 2.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });
    renderFrame();

    const surface = world._surface;
    const tile = surface._quadtree._renderTiles[0];
    const commands = surface._renderCommands.slice();
    const command = tile.command;
    const uniformMap = command.uniformMap;
    const shaderProgram = command.shaderProgram;
    const shaderEntries = Array.from(surface._shaderPrograms.entries());
    const publishedSource = surface._publishedMaterialSource;
    world.material = bad;

    const failedFrameState = {
      ...widget.scene.frameState,
      frameNumber: widget.scene.frameState.frameNumber + 1,
      passes: { render: true },
      commandList: [],
    };
    world.beginFrame(failedFrameState);
    const surfaceDebug = { ...surface._debug };
    const quadtreeDebug = { ...surface._quadtree._debug };
    const imageryDebug = { ...surface._imagery._debug };

    expect(() => world.render(failedFrameState)).toThrowError();
    expect(failedFrameState.commandList).toEqual([]);
    expect(surface._publishedMaterial).toBe(good);
    expect(surface._publishedMaterialSource).toBe(publishedSource);
    expect(surface._renderCommands).toEqual(commands);
    expect(Array.from(surface._shaderPrograms.entries())).toEqual(
      shaderEntries,
    );
    expect(tile.command).toBe(command);
    expect(command.shaderProgram).toBe(shaderProgram);
    expect(command.uniformMap).toBe(uniformMap);
    expect(surface._debug).toEqual(surfaceDebug);
    expect(surface._quadtree._debug).toEqual(quadtreeDebug);
    expect(surface._imagery._debug).toEqual(imageryDebug);

    const replayFrameState = {
      ...failedFrameState,
      passes: { render: false, pick: true, depth: true },
      commandList: [],
    };
    world.render(replayFrameState);
    expect(replayFrameState.commandList).toEqual(commands);
    expect(surface._publishedMaterial).toBe(good);
  });

  it("rebinds cached upsampled LOD commands after a Material shader release boundary", async function () {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
      }),
      maximumLevel: 1,
      maximumScreenSpaceError: 0.01,
    });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([100.0, 200.0, 100.0, 200.0]),
      width: 2,
      height: 2,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 100.0,
      maximumHeight: 200.0,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 4.0,
      requestTileGeometry: (x, y, level) =>
        level === 0 ? Promise.resolve(terrainData) : undefined,
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    const materialA = Material.fromType(Material.AspectRampMaterialType, {
      image: createRamp(["red", "lime", "blue", "yellow", "red"]),
    });
    const materialB = Material.fromType(Material.SlopeRampMaterialType, {
      image: createRamp(["black", "white"]),
    });
    materials.push(materialA, materialB);
    world.material = materialA;
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
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

    await pollToPromise(function () {
      renderFrame();
      return (
        world._surface._quadtree._renderTiles.length === 4 &&
        world._surface._quadtree._renderTiles.every(
          (tile) =>
            tile.terrainEntry.activeSource ===
            world._surface._terrain.Source.UPSAMPLED,
        )
      );
    });
    const child = world._surface._quadtree._renderTiles[0];
    const command = child.command;
    const oldShader = command.shaderProgram;
    expect(world._surface._shaderPrograms.size).toBe(2);
    expect(world._surface._debug.destroyedShaders).toBe(0);

    world.maximumScreenSpaceError = 1000000.0;
    world.material = materialB;
    renderFrame();
    expect(world._surface._quadtree._renderTiles[0].key).toBe("0/0/0");
    expect(child._materialCommandSource).toBeUndefined();
    expect(world._surface._shaderPrograms.size).toBe(2);
    expect(world._surface._debug.destroyedShaders).toBe(2);
    widget.scene.context.shaderCache.destroyReleasedShaderPrograms();
    expect(oldShader.isDestroyed()).toBe(true);

    world.maximumScreenSpaceError = 0.01;
    world.material = materialA;
    await pollToPromise(function () {
      renderFrame();
      return world._surface._quadtree._renderTiles.length === 4;
    });
    expect(child.command).toBe(command);
    expect(command.shaderProgram).not.toBe(oldShader);
    expect(command.shaderProgram.isDestroyed()).toBe(false);
    expect(child._materialCommand).toBe(materialA);
    expect(child._materialCommandSource).toBe(materialA.shaderSource);
    expect(world._surface._shaderPrograms.size).toBe(2);
    expect(world._surface._debug.destroyedShaders).toBe(4);
    expect(command.uniformMap).toEqual(
      jasmine.objectContaining(materialA._uniforms),
    );
  });

  it("publishes absolute height, slope, and north-clockwise downslope aspect pixels", async function () {
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
      baseColor: Color.BLACK,
    });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      // East rises from 100 m to 200 m. Its downslope aspect is west (3pi/2).
      buffer: new Float32Array([100.0, 200.0, 100.0, 200.0]),
      width: 2,
      height: 2,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 100.0,
      maximumHeight: 200.0,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 1.0,
      requestTileGeometry: () => Promise.resolve(terrainData),
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    const probe = new Material({
      fabric: {
        type: "SceneGISPlanarInputProbe",
        source: `czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    material.diffuse = vec3(
        materialInput.height / 200.0,
        materialInput.slope / (czm_pi / 2.0),
        materialInput.aspect / czm_twoPi);
    material.alpha = 1.0;
    return material;
}`,
      },
    });
    materials.push(probe);
    world.material = probe;
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
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
    await pollToPromise(function () {
      renderFrame();
      return world.tilesLoaded && world._surface._renderCommands.length === 1;
    });
    const pixel = Array.from(
      widget.scene.context.readPixels({
        x: Math.floor(widget.scene.drawingBufferWidth / 2),
        y: Math.floor(widget.scene.drawingBufferHeight / 2),
        width: 1,
        height: 1,
      }),
    );
    // Center height is 150 m (non-zero mesh reference), the steep slope is
    // near pi/2, and west is 3pi/2 in the north-clockwise convention.
    expect(pixel[0]).toBeGreaterThan(185);
    expect(pixel[0]).toBeLessThan(197);
    expect(pixel[1]).toBeGreaterThan(55);
    expect(pixel[1]).toBeLessThan(67);
    expect(pixel[2]).toBeGreaterThan(186);
    expect(pixel[2]).toBeLessThan(198);
    expect(pixel[3]).toBe(255);

    const heightRamp = Material.fromType(Material.ElevationRampType, {
      image: createRamp(["black", "red"]),
      minimumHeight: 100.0,
      maximumHeight: 200.0,
    });
    materials.push(heightRamp);
    world.material = heightRamp;
    renderFrame();
    await Promise.resolve();
    await Promise.resolve();
    renderFrame();
    const heightPixel = widget.scene.context.readPixels({
      x: Math.floor(widget.scene.drawingBufferWidth / 2),
      y: Math.floor(widget.scene.drawingBufferHeight / 2),
      width: 1,
      height: 1,
    });
    expect(heightPixel[0]).toBeGreaterThan(100);
    expect(heightPixel[1]).toBeLessThan(5);
    expect(heightPixel[2]).toBeLessThan(5);

    const contour = Material.fromType(Material.ElevationContourType, {
      spacing: 25.0,
      width: 1.0,
      color: Color.RED,
    });
    materials.push(contour);
    world.material = contour;
    renderFrame();
    function countRedPixels() {
      const pixels = widget.scene.context.readPixels();
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        count += pixels[i] > 200 && pixels[i + 1] < 5 && pixels[i + 2] < 5;
      }
      return count;
    }
    const narrowCount = countRedPixels();
    expect(narrowCount).toBeGreaterThan(0);
    contour.uniforms.width = 4.0;
    renderFrame();
    expect(countRedPixels()).toBeGreaterThan(narrowCount);
  });

  it("composes imagery, Material alpha, and lighting in that order", async function () {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1.0,
          minimumY: -1.0,
          maximumX: 1.0,
          maximumY: 1.0,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
      enableLighting: true,
      lambertDiffuseMultiplier: 0.0,
    });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([0.0, 0.0, 0.0, 0.0]),
      width: 2,
      height: 2,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0.0,
      maximumHeight: 0.0,
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
      hasAlphaChannel: true,
      errorEvent: new Event(),
      credit: undefined,
      requestImage: () => Promise.resolve(createSolidImage("red")),
    });
    layer.brightness = 0.5;
    const material = Material.fromType(Material.ColorType, {
      color: Color.fromBytes(0, 0, 255, 128),
    });
    materials.push(material);
    world.material = material;
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    widget.scene.rethrowRenderErrors = true;
    widget.scene.light = new DirectionalLight({
      direction: Cartesian3.UNIT_Z,
    });
    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 2.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });
    await pollToPromise(function () {
      renderFrame();
      return world.tilesLoaded && world._surface._renderCommands.length === 1;
    });

    function readCenterPixel() {
      return widget.scene.context.readPixels({
        x: Math.floor(widget.scene.drawingBufferWidth / 2),
        y: Math.floor(widget.scene.drawingBufferHeight / 2),
        width: 1,
        height: 1,
      });
    }

    const pixel = readCenterPixel();
    expect(pixel[0]).toBeCloseTo(19, -1);
    expect(pixel[1]).toBeLessThan(5);
    expect(pixel[2]).toBeCloseTo(38, -1);
    expect(pixel[3]).toBe(255);

    const surface = world._surface;
    const tile = surface._quadtree._renderTiles[0];
    const binding = tile.imageryBindings.get(layer);
    const identities = {
      command: tile.command,
      shader: tile.command.shaderProgram,
      vertexArray: tile.command.vertexArray,
      imageryTexture: binding.desired.texture,
      terrainMesh: tile.terrainEntry.activeContent.mesh,
    };
    function expectWarmIdentities() {
      expect(surface._quadtree._renderTiles.length).toBe(1);
      expect(surface._quadtree._renderTiles[0]).toBe(tile);
      expect(surface._renderCommands.length).toBe(1);
      expect(surface._renderCommands[0]).toBe(identities.command);
      expect(tile.command).toBe(identities.command);
      expect(tile.command.shaderProgram).toBe(identities.shader);
      expect(tile.command.vertexArray).toBe(identities.vertexArray);
      expect(tile.imageryBindings.get(layer)).toBe(binding);
      expect(binding.desired.texture).toBe(identities.imageryTexture);
      expect(tile.terrainEntry.activeContent.mesh).toBe(identities.terrainMesh);
    }

    layer.brightness = 1.0;
    renderFrame();
    const filterPixel = readCenterPixel();
    expect(filterPixel[0]).toBeCloseTo(38, -1);
    expect(filterPixel[1]).toBeLessThan(5);
    expect(filterPixel[2]).toBeCloseTo(38, -1);
    expectWarmIdentities();

    material.uniforms.color = Color.fromBytes(0, 255, 0, 128);
    renderFrame();
    const materialPixel = readCenterPixel();
    expect(materialPixel[0]).toBeCloseTo(38, -1);
    expect(materialPixel[1]).toBeCloseTo(38, -1);
    expect(materialPixel[2]).toBeLessThan(5);
    expectWarmIdentities();
  });

  it("orients north, east, south, west, and flat aspect deterministically", async function () {
    const cases = [
      { heights: [100, 100, 200, 200], expected: [255, 0, 0], flat: false },
      { heights: [200, 100, 200, 100], expected: [0, 255, 0], flat: false },
      { heights: [200, 200, 100, 100], expected: [0, 0, 255], flat: false },
      { heights: [100, 200, 100, 200], expected: [255, 255, 0], flat: false },
      { heights: [150, 150, 150, 150], expected: [255, 0, 0], flat: true },
    ];
    const aspectRamp = document.createElement("canvas");
    aspectRamp.width = 256;
    aspectRamp.height = 1;
    const rampContext = aspectRamp.getContext("2d");
    for (const [start, end, color] of [
      [0, 32, "red"],
      [32, 96, "lime"],
      [96, 160, "blue"],
      [160, 224, "yellow"],
      [224, 256, "red"],
    ]) {
      rampContext.fillStyle = color;
      rampContext.fillRect(start, 0, end - start, 1);
    }
    for (const testCase of cases) {
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
      });
      const terrainData = new SceneGISPlanarHeightmapTerrainData({
        buffer: new Float32Array(testCase.heights),
        width: 2,
        height: 2,
      });
      world.terrainProvider = {
        tilingScheme: world.tilingScheme,
        minimumHeight: 100.0,
        maximumHeight: 200.0,
        maximumLevel: 0,
        errorEvent: new Event(),
        credit: undefined,
        getLevelMaximumGeometricError: () => 1.0,
        requestTileGeometry: () => Promise.resolve(terrainData),
        getTileDataAvailable: () => undefined,
        loadTileDataAvailability: () => undefined,
      };
      const aspect = Material.fromType(Material.AspectRampMaterialType, {
        image: aspectRamp,
      });
      materials.push(aspect);
      world.material = aspect;
      const contextOptions = { webgl: { antialias: false } };
      if (!!window.webglStub) {
        contextOptions.getWebGLStub = getWebGLStub;
      }
      widget = new CesiumWidget(container, {
        world,
        useDefaultRenderLoop: false,
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
      await pollToPromise(function () {
        renderFrame();
        return world.tilesLoaded && world._surface._renderCommands.length === 1;
      });
      await Promise.resolve();
      await Promise.resolve();
      renderFrame();
      const pixel = Array.from(
        widget.scene.context.readPixels({
          x: Math.floor(widget.scene.drawingBufferWidth / 2),
          y: Math.floor(widget.scene.drawingBufferHeight / 2),
          width: 1,
          height: 1,
        }),
      );
      for (let component = 0; component < 3; ++component) {
        expect(pixel[component]).toBeCloseTo(testCase.expected[component], -1);
      }
      if (testCase.flat) {
        const slope = Material.fromType(Material.SlopeRampMaterialType, {
          image: createRamp(["black", "white"]),
        });
        materials.push(slope);
        world.material = slope;
        renderFrame();
        await Promise.resolve();
        await Promise.resolve();
        renderFrame();
        const slopePixel = widget.scene.context.readPixels({
          x: Math.floor(widget.scene.drawingBufferWidth / 2),
          y: Math.floor(widget.scene.drawingBufferHeight / 2),
          width: 1,
          height: 1,
        });
        expect(slopePixel[0]).toBeLessThan(5);
        expect(slopePixel[1]).toBeLessThan(5);
        expect(slopePixel[2]).toBeLessThan(5);
      }
      widget = widget.destroy();
    }
  });
});
