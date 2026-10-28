import {
  Cartesian3,
  Cartesian2,
  Cartesian4,
  Color,
  ColorGeometryInstanceAttribute,
  DirectionalLight,
  Event,
  HeadingPitchRange,
  Intersect,
  Material,
  Matrix4,
  OrthographicFrustum,
  Pass,
  PerspectiveFrustum,
  PerInstanceColorAppearance,
  PolylineMaterialAppearance,
  PrimitiveType,
  Scene,
  SceneTransforms,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarQuantizedMeshTerrainData,
  SceneGISPlanarGroundPrimitive,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarPolylineGeometry,
  SceneGISPlanarWorld,
  SplitDirection,
} from "../../../../index.js";
import createCanvas from "../../../../../../Specs/createCanvas.js";
import getWebGLStub from "../../../../../../Specs/getWebGLStub.js";
import pollToPromise from "../../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISPlanarSurface", function () {
  let scene;

  async function renderUntil(condition) {
    await pollToPromise(function () {
      scene.renderForSpecs();
      return condition();
    });
  }

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
        crs: options.crs,
      }),
      maximumLevel: options.maximumLevel ?? 3,
      maximumScreenSpaceError: options.maximumScreenSpaceError ?? 2.0,
      tileCacheSize: options.tileCacheSize ?? 100,
      baseColor: options.baseColor ?? Color.RED,
      enableLighting: options.enableLighting,
      lambertDiffuseMultiplier: options.lambertDiffuseMultiplier,
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
    // These fixtures assert linear imagery/terrain composition. Display gamma
    // is covered separately by the deferred display Specs.
    result.gamma = 1;
    // Isolate Surface pixels from time-dependent atmosphere and background sky.
    result.environmentEffects.enabled = false;
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

  function aimCamera(position, target, referenceUp) {
    Cartesian3.clone(position, scene.camera.position);
    Cartesian3.subtract(target, position, scene.camera.direction);
    Cartesian3.normalize(scene.camera.direction, scene.camera.direction);
    Cartesian3.cross(scene.camera.direction, referenceUp, scene.camera.right);
    Cartesian3.normalize(scene.camera.right, scene.camera.right);
    Cartesian3.cross(
      scene.camera.right,
      scene.camera.direction,
      scene.camera.up,
    );
    Cartesian3.normalize(scene.camera.up, scene.camera.up);
  }

  function readWindowPixel(windowPosition) {
    return Array.from(
      scene.context.readPixels({
        x: Math.floor(windowPosition.x),
        y: scene.canvas.clientHeight - Math.floor(windowPosition.y),
        width: 1,
        height: 1,
      }),
    );
  }

  function addWindowOffset(position, x, y) {
    return new Cartesian2(position.x + x, position.y + y);
  }

  function expectStableGroundLine(
    line,
    start,
    center,
    end,
    expectedId,
    expectedColor,
    context,
  ) {
    const startWindow = SceneTransforms.worldToWindowCoordinates(scene, start);
    const centerWindow = SceneTransforms.worldToWindowCoordinates(
      scene,
      center,
    );
    const endWindow = SceneTransforms.worldToWindowCoordinates(scene, end);
    expect(startWindow).withContext(context).toBeDefined();
    expect(centerWindow).withContext(context).toBeDefined();
    expect(endWindow).withContext(context).toBeDefined();

    const tangentX = endWindow.x - startWindow.x;
    const tangentY = endWindow.y - startWindow.y;
    const tangentMagnitude = Math.hypot(tangentX, tangentY);
    expect(tangentMagnitude).withContext(context).toBeGreaterThan(12.0);
    const unitTangentX = tangentX / tangentMagnitude;
    const unitTangentY = tangentY / tangentMagnitude;
    const normalX = -unitTangentY;
    const normalY = unitTangentX;
    const anchors = [startWindow, centerWindow, endWindow];
    const insidePositions = [];
    const outsidePositions = [];
    for (const anchor of anchors) {
      insidePositions.push(
        anchor,
        addWindowOffset(anchor, normalX * 4.0, normalY * 4.0),
        addWindowOffset(anchor, -normalX * 4.0, -normalY * 4.0),
      );
      outsidePositions.push(
        addWindowOffset(anchor, normalX * 14.0, normalY * 14.0),
        addWindowOffset(anchor, -normalX * 14.0, -normalY * 14.0),
      );
    }
    for (let i = 0; i < insidePositions.length; ++i) {
      const position = insidePositions[i];
      const sampleContext = `${context} inside sample ${i}`;
      expect(readWindowPixel(position))
        .withContext(sampleContext)
        .toEqual(expectedColor);
      expect(scene.pick(position)?.id)
        .withContext(sampleContext)
        .toBe(expectedId);
    }
    for (let i = 0; i < outsidePositions.length; ++i) {
      const position = outsidePositions[i];
      const sampleContext = `${context} outside sample ${i}`;
      expect(readWindowPixel(position))
        .withContext(sampleContext)
        .not.toEqual(expectedColor);
      expect(scene.pick(position)?.id)
        .withContext(sampleContext)
        .not.toBe(expectedId);
    }
    expect(line.ready).withContext(context).toBeTrue();
  }

  afterEach(function () {
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
  });

  it("splits imagery in screen pixels while retaining composition, depth and warm resources", async function () {
    const world = createWorld({ maximumLevel: 0, baseColor: Color.BLUE });
    function addImage(color) {
      const image = document.createElement("canvas");
      image.width = image.height = 1;
      const context = image.getContext("2d");
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return world.imageryLayers.addImageryProvider({
        tilingScheme: world.tilingScheme,
        minimumLevel: 0,
        maximumLevel: 0,
        tileWidth: 1,
        tileHeight: 1,
        hasAlphaChannel: true,
        errorEvent: new Event(),
        requestImage: () => Promise.resolve(image),
      });
    }
    const left = addImage("red");
    const right = addImage("lime");
    left.splitDirection = SplitDirection.LEFT;
    right.splitDirection = SplitDirection.RIGHT;
    scene = createPlanarScene(world, 32, 32);
    scene.splitPosition = 0.5;
    pointCameraAt(world);
    await renderUntil(() => world.tilesLoaded);
    const pixel = (x) =>
      Array.from(scene.context.readPixels({ x, y: 16, width: 1, height: 1 }));
    expect(pixel(8)).toEqual([255, 0, 0, 255]);
    expect(pixel(24)).toEqual([0, 255, 0, 255]);
    const surface = world._surface;
    const tile = surface._quadtree._renderTiles[0];
    const command = tile.command;
    const shader = command.shaderProgram;
    const uniforms = command.uniformMap;
    const vertexArray = command.vertexArray;
    const before = { ...surface._imagery._debug };
    const createdShaders = surface._debug.createdShaders;
    const createdCommands = surface._debug.createdCommands;
    for (const [position, expectedLeft, expectedRight] of [
      [0, [0, 255, 0, 255], [0, 255, 0, 255]],
      [1, [255, 0, 0, 255], [255, 0, 0, 255]],
      [0.25, [0, 255, 0, 255], [0, 255, 0, 255]],
      [0.75, [255, 0, 0, 255], [0, 255, 0, 255]],
    ]) {
      scene.splitPosition = position;
      scene.renderForSpecs();
      expect(pixel(8)).withContext(`split=${position}`).toEqual(expectedLeft);
      expect(pixel(24)).withContext(`split=${position}`).toEqual(expectedRight);
    }
    scene.splitPosition = 0.5;
    right.splitDirection = SplitDirection.NONE;
    right.alpha = 0.5;
    scene.renderForSpecs();
    expect(pixel(8)).toEqualEpsilon([128, 128, 0, 255], 1);
    expect(pixel(24)).toEqualEpsilon([0, 128, 128, 255], 1);
    world.imageryLayers.lowerToBottom(right);
    scene.renderForSpecs();
    expect(pixel(8)).toEqual([255, 0, 0, 255]);
    expect(pixel(24)).toEqualEpsilon([0, 128, 128, 255], 1);
    // Mask both layers on the right: the opaque base and its depth must survive.
    right.splitDirection = SplitDirection.LEFT;
    scene.renderForSpecs();
    expect(pixel(24)).toEqual([0, 0, 255, 255]);
    if (scene.pickPositionSupported && !window.webglStub) {
      for (const x of [8, 24]) {
        const position = scene.pickPosition(new Cartesian2(x, 16));
        expect(position).toBeDefined();
        expect(position.z).toEqualEpsilon(0, 0.01);
      }
    }
    expect(tile.command).toBe(command);
    expect(command.shaderProgram).toBe(shader);
    expect(command.uniformMap).toBe(uniforms);
    expect(command.vertexArray).toBe(vertexArray);
    expect(surface._imagery._debug).toEqual(before);
    expect(surface._debug.createdShaders).toBe(createdShaders);
    expect(surface._debug.createdCommands).toBe(createdCommands);
    expect(surface._renderCommands.length).toBe(1);
    expect(world.tilesLoaded).toBeTrue();
    // Vertical clipping uses the height, measured from the top, independently
    // of the width. Reuse warm commands and keep depth where imagery is masked.
    scene.canvas.width = 48;
    scene.canvas.height = 32;
    scene.camera.frustum.aspectRatio = 48 / 32;
    left.splitDirection = SplitDirection.TOP;
    right.splitDirection = SplitDirection.BOTTOM;
    right.alpha = 1;
    const verticalPixel = (y) =>
      Array.from(scene.context.readPixels({ x: 24, y, width: 1, height: 1 }));
    for (const [position, top, bottom] of [
      [0, Color.LIME, Color.LIME],
      [0.25, Color.LIME, Color.LIME],
      [0.5, Color.RED, Color.LIME],
      [0.75, Color.RED, Color.RED],
      [1, Color.RED, Color.RED],
    ]) {
      scene.splitPosition = position;
      scene.renderForSpecs();
      expect(verticalPixel(23))
        .withContext(`top at ${position}`)
        .toEqual(top.toBytes());
      expect(verticalPixel(8))
        .withContext(`bottom at ${position}`)
        .toEqual(bottom.toBytes());
    }
    scene.splitPosition = 0.5;
    right.splitDirection = SplitDirection.TOP;
    scene.renderForSpecs();
    expect(verticalPixel(8)).toEqual([0, 0, 255, 255]);
    if (scene.pickPositionSupported && !window.webglStub) {
      for (const y of [8, 24]) {
        const position = scene.pickPosition(new Cartesian2(24, y));
        expect(position).toBeDefined();
        expect(position.z).toEqualEpsilon(0, 0.01);
      }
    }
    expect(tile.command).toBe(command);
    expect(command.shaderProgram).toBe(shader);
    expect(surface._imagery._debug).toEqual(before);
    expect(surface._debug.createdShaders).toBe(createdShaders);
    expect(surface._debug.createdCommands).toBe(createdCommands);
    world.imageryLayers.removeAll();
    scene.renderForSpecs();
    expect(surface._imagery._debug.destroyedTextures).toBe(
      before.createdTextures,
    );
    expect(pixel(8)).toEqual([0, 0, 255, 255]);
  });

  describe("imagery linear input", function () {
    function addImage(world, rgba) {
      const image = document.createElement("canvas");
      image.width = image.height = 1;
      const context = image.getContext("2d");
      context.putImageData(
        new ImageData(new Uint8ClampedArray(rgba), 1, 1),
        0,
        0,
      );
      return world.imageryLayers.addImageryProvider({
        tilingScheme: world.tilingScheme,
        minimumLevel: 0,
        maximumLevel: 0,
        tileWidth: 1,
        tileHeight: 1,
        hasAlphaChannel: true,
        errorEvent: new Event(),
        requestImage: () => Promise.resolve(image),
      });
    }

    async function initialize(world) {
      scene = createPlanarScene(world, 32, 32);
      scene.gamma = 2.2;
      pointCameraAt(world);
      await renderUntil(() => world.tilesLoaded);
    }

    function pixel() {
      return Array.from(
        scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
      );
    }

    function display(rgb) {
      return [
        ...rgb.map(
          (value) => 255 * Math.pow(Math.max(0, Math.min(1, value)), 1 / 2.2),
        ),
        255,
      ];
    }

    for (const rgba of [
      [128, 128, 128, 255],
      [64, 128, 192, 255],
    ]) {
      it(`round trips display RGB ${rgba.slice(0, 3)} through linear LDR storage`, async function () {
        const world = createWorld({ maximumLevel: 0 });
        addImage(world, rgba);
        await initialize(world);
        expect(pixel()).toEqualEpsilon(rgba, 2);
      });
    }

    it("matches Globe filter domains before alpha blending and retains warm resources", async function () {
      const world = createWorld({ maximumLevel: 0 });
      const bottomRgb = [32, 80, 160];
      const topRgb = [192, 128, 64];
      addImage(world, [...bottomRgb, 255]);
      const top = addImage(world, [...topRgb, 128]);
      top.alpha = 0.5;
      await initialize(world);
      const surface = world._surface;
      const tile = surface._quadtree._renderTiles[0];
      const command = tile.command;
      const shader = command.shaderProgram;
      const va = command.vertexArray;
      const texture = tile.imageryBindings.get(top).desired.texture;
      const debug = { ...surface._imagery._debug };
      const shaderCount = surface._shaderPrograms.size;
      const bottom = bottomRgb.map((value) => Math.pow(value / 255, 2.2));
      const alpha = (128 / 255) * top.alpha;
      const expected = (filtered, base = bottom) =>
        display(
          base.map((value, i) => value * (1 - alpha) + filtered[i] * alpha),
        );
      expect(pixel()).toEqualEpsilon(
        expected(topRgb.map((v) => Math.pow(v / 255, 2.2))),
        2,
      );

      top.gamma = 2;
      top.brightness = 0.6;
      scene.renderForSpecs();
      expect(pixel()).toEqualEpsilon(
        expected(
          topRgb.map((v) => Math.sqrt(v / 255) * 0.6),
          bottomRgb.map((v) => v / 255),
        ),
        2,
      );

      // Globe keeps negative filtered channels until composition and display output.
      top.gamma = 1;
      top.brightness = 1;
      top.contrast = 3;
      scene.renderForSpecs();
      expect(pixel()).toEqualEpsilon(
        expected(topRgb.map((v) => (Math.pow(v / 255, 2.2) - 0.5) * 3 + 0.5)),
        2,
      );

      // Matching remains in raw image RGB, before all filters and decoding.
      top.colorToAlpha = Color.fromBytes(...topRgb);
      top.colorToAlphaThreshold = 0.01;
      scene.renderForSpecs();
      expect(pixel()).toEqualEpsilon([...bottomRgb, 255], 2);
      expect(surface._quadtree._renderTiles[0]).toBe(tile);
      expect(surface._renderCommands).toEqual([command]);
      expect(command.shaderProgram).toBe(shader);
      expect(command.vertexArray).toBe(va);
      expect(tile.imageryBindings.get(top).desired.texture).toBe(texture);
      expect(surface._imagery._debug).toEqual(debug);
      expect(surface._shaderPrograms.size).toBe(shaderCount);
      scene.destroyForSpecs();
      expect(texture.isDestroyed()).toBe(true);
      expect(va.isDestroyed()).toBe(true);
    });

    it("uses only ready, visible, nonzero-alpha layers to select batch gamma and snapshots depth replay", async function () {
      const world = createWorld({ maximumLevel: 0 });
      const rgb = [64, 128, 192];
      addImage(world, [...rgb, 255]);
      // A masked texel still enables Globe's batch gamma branch.
      const top = addImage(world, [255, 0, 0, 255]);
      top.colorToAlpha = Color.RED;
      top.colorToAlphaThreshold = 0.01;
      await initialize(world);
      const command = world._surface._renderCommands[0];
      expect(pixel()).toEqualEpsilon([...rgb, 255], 2);
      expect(command.uniformMap.u_sceneGISImageryApplyGamma()).toBe(false);

      top.gamma = 2;
      world.render({
        ...scene.frameState,
        passes: { render: false, pick: true, depth: true },
        commandList: [],
      });
      expect(command.uniformMap.u_sceneGISImageryApplyGamma()).toBe(false);
      scene.renderForSpecs();
      expect(command.uniformMap.u_sceneGISImageryApplyGamma()).toBe(true);
      expect(pixel()).toEqualEpsilon(display(rgb.map((v) => v / 255)), 2);

      top.alpha = 0;
      scene.renderForSpecs();
      expect(command.uniformMap.u_sceneGISImageryApplyGamma()).toBe(false);
      expect(pixel()).toEqualEpsilon([...rgb, 255], 2);
      top.alpha = 1;
      top.show = false;
      scene.renderForSpecs();
      expect(pixel()).toEqualEpsilon([...rgb, 255], 2);
      top.show = true;
      await renderUntil(() => world.tilesLoaded);
      expect(pixel()).toEqualEpsilon(display(rgb.map((v) => v / 255)), 2);
      top.gamma = 1;
      scene.renderForSpecs();
      expect(pixel()).toEqualEpsilon([...rgb, 255], 2);
    });

    it("shares linear input with Material in HDR and LDR without decoding Material or base color again", async function () {
      const world = createWorld({
        maximumLevel: 0,
        baseColor: new Color(0.25, 0.25, 0.25),
      });
      const imagery = addImage(world, [128, 128, 128, 255]);
      await initialize(world);
      const material = new Material({
        fabric: {
          uniforms: { weight: 0.0 },
          source: `uniform float weight;
czm_material czm_getMaterial(czm_materialInput inputValue) {
    czm_material result = czm_getDefaultMaterial(inputValue);
    result.diffuse = vec3(pow(128.0 / 255.0, 2.2));
    result.alpha = weight;
    return result;
}`,
        },
      });
      try {
        world.material = material;
        for (const hdr of [false, true]) {
          scene.highDynamicRange = hdr;
          material.uniforms.weight = 0;
          scene.renderForSpecs();
          const imagePixel = pixel();
          material.uniforms.weight = 1;
          scene.renderForSpecs();
          expect(pixel())
            .withContext(`HDR display ${hdr}`)
            .toEqualEpsilon(imagePixel, 2);
        }
        scene.highDynamicRange = false;
        world.material = undefined;
        world.opacity = 0.5;
        scene.renderForSpecs();
        const halfLinear = Math.pow(128 / 255, 2.2) * 0.5;
        expect(pixel()).toEqualEpsilon(
          display([halfLinear, halfLinear, halfLinear]),
          2,
        );
        world.opacity = 1;
        imagery.show = false;
        scene.renderForSpecs();
        expect(pixel()).toEqualEpsilon(display([0.25, 0.25, 0.25]), 2);
      } finally {
        world.material = undefined;
        material.destroy();
      }
    });
  });

  it("composes imagery before surface opacity and preserves the published command snapshot", async function () {
    const world = createWorld({ maximumLevel: 0 });
    const image = document.createElement("canvas");
    image.width = image.height = 1;
    const context = image.getContext("2d");
    context.fillStyle = "blue";
    context.fillRect(0, 0, 1, 1);
    const imagery = world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: false,
      errorEvent: new Event(),
      requestImage: () => Promise.resolve(image),
    });
    scene = createPlanarScene(world, 32, 32);
    pointCameraAt(world);
    await renderUntil(() => world.tilesLoaded);
    const surface = world._surface;
    const tile = surface._quadtree._renderTiles[0];
    const command = tile.command;
    const shader = command.shaderProgram;
    const va = command.vertexArray;
    const pixel = () =>
      Array.from(
        scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
      );
    for (const [opacity, alpha, expected] of [
      [1, 1, [0, 0, 255, 255]],
      [0.5, 0.5, [64, 0, 64, 255]],
      [0, 1, [0, 0, 0, 255]],
      [1, 0, [255, 0, 0, 255]],
    ]) {
      world.opacity = opacity;
      imagery.alpha = alpha;
      scene.renderForSpecs();
      expect(pixel()).toEqualEpsilon(expected, 1);
      expect(tile.command).toBe(command);
      if (opacity === 1) {
        expect(command.shaderProgram).toBe(shader);
      }
      expect(command.vertexArray).toBe(va);
      if (scene.pickPositionSupported) {
        const position = scene.pickPosition(new Cartesian2(16, 16));
        if (opacity === 1) {
          expect(position.z).toBeCloseTo(0, 2);
        } else {
          expect(position).toBeUndefined();
        }
      }
    }
    world.opacity = 0.5;
    scene.renderForSpecs();
    const depth = tile.command;
    const debug = { ...surface._debug };
    world.opacity = 0;
    const replay = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      commandList: [],
    };
    world.render(replay);
    expect(replay.commandList).toEqual([depth]);
    expect(command.uniformMap.u_surfaceOpacity()).toBe(0.5);
    scene.renderForSpecs();
    expect(command.uniformMap.u_surfaceOpacity()).toBe(0);
    expect(surface._debug.createdCommands).toBe(debug.createdCommands);
    expect(surface._debug.createdShaders).toBe(debug.createdShaders);
    expect(surface._debug.createdTextures).toBe(debug.createdTextures);
    expect(surface._debug.submittedCommands).toBe(1);
    scene.destroyForSpecs();
    expect(va.isDestroyed()).toBeTrue();
  });

  [false, true].forEach(function (logarithmicDepthBuffer) {
    it(`reveals overlapping terrain layers across frusta (${logarithmicDepthBuffer ? "log" : "linear"} depth)`, async function () {
      const world = createWorld({ maximumLevel: 1, size: 1024, minimum: -512 });
      const heights = new Float32Array(81);
      for (let row = 0; row < 9; ++row) {
        for (let col = 0; col < 9; ++col) {
          heights[row * 9 + col] =
            120 * Math.sin((row * Math.PI) / 8) * Math.sin((col * Math.PI) / 8);
        }
      }
      const data = new SceneGISPlanarHeightmapTerrainData({
        buffer: heights,
        width: 9,
        height: 9,
      });
      world.terrainProvider = {
        tilingScheme: world.tilingScheme,
        minimumHeight: 0,
        maximumHeight: 120,
        maximumLevel: 1,
        errorEvent: new Event(),
        getLevelMaximumGeometricError: (level) => 16 / 2 ** level,
        requestTileGeometry: () => Promise.resolve(data),
        getTileDataAvailable: () => true,
        loadTileDataAvailability: () => undefined,
      };
      scene = createPlanarScene(world, 128, 128);
      scene.msaaSamples = 1;
      scene.logarithmicDepthBuffer = logarithmicDepthBuffer;
      scene.farToNearRatio = 2;
      scene.logarithmicDepthFarToNearRatio = 2;
      aimCamera(
        new Cartesian3(30, -500, 90),
        new Cartesian3(30, 100, 0),
        Cartesian3.UNIT_Z,
      );
      scene.camera.frustum.near = 1;
      scene.camera.frustum.far = 2000;
      await renderUntil(() => world.tilesLoaded);
      const opaque = scene.context.readPixels();
      const tiles = world._surface._quadtree._renderTiles;
      expect(tiles.length).toBeGreaterThan(1);
      const geometry = tiles.map((tile) => tile.command.vertexArray);
      world.opacity = 0.5;
      scene.renderForSpecs();
      const translucent = scene.context.readPixels();
      let samples = 0;
      let overlapping = 0;
      for (let i = 0; i < opaque.length; i += 4) {
        if (opaque[i] === 255 && opaque[i + 1] === 0) {
          expect(translucent[i])
            .withContext(`pixel ${i / 4}`)
            .toBeGreaterThanOrEqual(127);
          expect(translucent[i + 1]).toBe(0);
          expect(translucent[i + 2]).toBe(0);
          overlapping += Number(translucent[i] > 190);
          ++samples;
        }
      }
      expect(samples).toBeGreaterThan(1000);
      expect(overlapping).toBeGreaterThan(0);
      expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
      expect(tiles.map((tile) => tile.command.vertexArray)).toEqual(geometry);
      expect(world._surface._debug.submittedCommands).toBe(tiles.length);
    });
  });

  it("reuses native OIT resources across opacity and HDR changes and resizes them", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world, 32, 32);
    pointCameraAt(world);
    world.opacity = 0;
    const read = () =>
      Array.from(
        scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
      );
    for (const hdr of [false, true, false]) {
      scene.highDynamicRange = hdr;
      scene.backgroundColor = hdr ? Color.BLUE : Color.GREEN;
      world.show = false;
      scene.renderForSpecs();
      const background = read();
      world.show = true;
      scene.renderForSpecs();
      expect(read()).toEqualEpsilon(background, 1);
      const texture = scene._view.oit._accumulationTexture;
      scene.renderForSpecs();
      expect(scene._view.oit._accumulationTexture).toBe(texture);
    }
    const oldTexture = scene._view.oit._accumulationTexture;
    scene.canvas.width = scene.canvas.height = 64;
    scene.renderForSpecs();
    expect(oldTexture.isDestroyed()).toBeTrue();
    expect(scene._view.oit._accumulationTexture.width).toBe(64);
  });

  it("uses the globe pass without materializing C9 ground snapshots", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    scene.frameState.scene3DOnly = true;
    pointCameraAt(world);
    scene.renderForSpecs();
    expect(world._surface._groundRenderSnapshot).toBeUndefined();
    expect(world._groundPrimitives).toBeUndefined();
    expect(world._surface._renderCommands[0].pass).toBe(Pass.GLOBE);
    const primitive = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolygonGeometry({
          positions: [
            new Cartesian3(-64, -64, 0),
            new Cartesian3(64, -64, 0),
            new Cartesian3(64, 64, 0),
            new Cartesian3(-64, 64, 0),
          ],
        }),
        appearance: new PerInstanceColorAppearance({ flat: true }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
        },
        id: "ground",
      }),
    );
    scene.renderForSpecs();
    expect(world._surface._groundRenderSnapshot).toBeUndefined();
    expect(primitive._current).toBeDefined();
    expect(scene).toRender([255, 255, 255, 255]);
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    if (scene.pickPositionSupported) {
      const pickedPosition = scene.pickPosition(center);
      expect(pickedPosition).toBeDefined();
      expect(Math.abs(pickedPosition.z)).toBeLessThan(1.1);
    }
    const cachedSurfaceCommands = world._surface._renderCommands.slice();
    const replayedSurfaceCommands = [];
    scene.debugCommandFilter = function (command) {
      if (cachedSurfaceCommands.includes(command)) {
        replayedSurfaceCommands.push(command);
      }
      return true;
    };
    const picked = scene.pick(center);
    scene.debugCommandFilter = undefined;
    expect(picked.id).toBe("ground");
    expect(replayedSurfaceCommands).toEqual(cachedSurfaceCommands);
    scene.primitives.remove(primitive);
    scene.renderForSpecs();
    expect(world._surface._groundRenderSnapshot).toBeUndefined();
  });

  it("classifies above, below, orthographic, and near-side views without stencil leakage", function () {
    if (window.webglStub) {
      return;
    }
    const world = createWorld({ maximumLevel: 0 });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -80,
      maximumHeight: 80,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 1,
      requestTileGeometry: () => undefined,
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    scene = createPlanarScene(world, 256, 256);
    scene.frameState.scene3DOnly = true;
    scene.logarithmicDepthBuffer = false;
    const primitive = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolygonGeometry({
          positions: [
            new Cartesian3(-20, -20, 0),
            new Cartesian3(20, -20, 0),
            new Cartesian3(20, 20, 0),
            new Cartesian3(-20, 20, 0),
          ],
        }),
        appearance: new PerInstanceColorAppearance({ flat: true }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
        },
        id: "view-ground",
      }),
    );
    const line = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [new Cartesian3(30, -32, 0), new Cartesian3(30, 32, 0)],
          width: 20,
        }),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType(Material.ColorType, {
            color: Color.GREEN,
          }),
        }),
        id: "view-line",
      }),
    );
    const center = Cartesian3.ZERO;
    const windowCenter = new Cartesian2(128, 128);
    function expectCenterColor(expected) {
      scene.renderForSpecs();
      expect(
        Array.from(
          scene.context.readPixels({ x: 128, y: 128, width: 1, height: 1 }),
        ),
      ).toEqual(expected);
    }
    const views = [
      {
        name: "perspective high above",
        position: new Cartesian3(0, 0, 160),
        referenceUp: Cartesian3.UNIT_Y,
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 0.1,
          far: 1000,
        }),
      },
      {
        name: "orthographic above",
        position: new Cartesian3(0, 0, 160),
        referenceUp: Cartesian3.UNIT_Y,
        frustum: new OrthographicFrustum({
          width: 128,
          aspectRatio: 1,
          near: 0.1,
          far: 1000,
        }),
      },
      {
        name: "perspective below",
        position: new Cartesian3(0, 0, -64),
        referenceUp: Cartesian3.UNIT_Y,
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 0.1,
          far: 1000,
        }),
      },
      {
        name: "perspective near-side",
        headingPitchRange: new HeadingPitchRange(0, -Math.PI / 4, 362),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 0.1,
          far: 1000,
        }),
      },
      {
        name: "perspective oblique quarter turn",
        headingPitchRange: new HeadingPitchRange(
          Math.PI / 2,
          -Math.PI / 4,
          362,
        ),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 0.1,
          far: 1000,
        }),
      },
      {
        name: "perspective reverse heading",
        headingPitchRange: new HeadingPitchRange(Math.PI, -Math.PI / 4, 362),
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 0.1,
          far: 1000,
        }),
      },
    ];
    let lineCurrent;
    let lineVertexArray;
    let lineShaderProgram;
    let lineCommands;
    for (const view of views) {
      scene.camera.frustum = view.frustum;
      if (view.headingPitchRange !== undefined) {
        scene.camera.lookAtTransform(Matrix4.IDENTITY, view.headingPitchRange);
      } else {
        aimCamera(view.position, center, view.referenceUp);
      }
      const mathematicalPick = world.pickFromWindowPosition(
        windowCenter,
        scene,
      );
      expect(mathematicalPick).withContext(view.name).toBeDefined();
      expect(Math.abs(mathematicalPick.x))
        .withContext(view.name)
        .toBeLessThan(1);
      expect(Math.abs(mathematicalPick.y))
        .withContext(view.name)
        .toBeLessThan(1);
      scene.renderForSpecs();
      expect(world._surface._renderCommands.length)
        .withContext(view.name)
        .toBeGreaterThan(0);
      expect(
        world._surface._quadtree._renderTiles.some(
          (tile) =>
            tile.extent.minimumX <= 0 &&
            tile.extent.maximumX >= 0 &&
            tile.extent.minimumY <= 0 &&
            tile.extent.maximumY >= 0,
        ),
      )
        .withContext(view.name)
        .toBeTrue();
      line.show = false;
      if (view.name === "perspective near-side") {
        primitive.show = false;
        expectCenterColor([255, 0, 0, 255]);
        primitive.show = true;
      }
      expectCenterColor([255, 255, 255, 255]);
      expect(scene.pick(windowCenter).id)
        .withContext(view.name)
        .toBe("view-ground");
      if (scene.pickPositionSupported) {
        const groundCommands = [
          ...primitive._currentCommands.stencilCommands,
          ...primitive._currentCommands.colorCommands,
          ...line._currentCommands.stencilCommands,
          ...line._currentCommands.colorCommands,
        ];
        let groundDepthWrites = 0;
        scene.debugCommandFilter = function (command) {
          if (groundCommands.includes(command)) {
            ++groundDepthWrites;
          }
          return true;
        };
        const depthPosition = scene.pickPosition(windowCenter);
        scene.debugCommandFilter = undefined;
        expect(groundDepthWrites).withContext(view.name).toBe(0);
        expect(depthPosition).withContext(view.name).toBeDefined();
        expect(Math.abs(depthPosition.z))
          .withContext(view.name)
          .toBeLessThan(3.0);
      }
      line.show = true;
      scene.renderForSpecs();
      if (lineCurrent === undefined) {
        lineCurrent = line._current;
        lineVertexArray = lineCurrent._va[0];
        lineShaderProgram = lineCurrent._sp;
        lineCommands = line._currentCommands.colorCommands.slice();
      }
      expect(line._current).withContext(view.name).toBe(lineCurrent);
      expect(lineCurrent._va[0]).withContext(view.name).toBe(lineVertexArray);
      expect(lineCurrent._sp).withContext(view.name).toBe(lineShaderProgram);
      expect(line._currentCommands.colorCommands)
        .withContext(view.name)
        .toEqual(lineCommands);
      expectStableGroundLine(
        line,
        new Cartesian3(30, -20, 0),
        new Cartesian3(30, 0, 0),
        new Cartesian3(30, 20, 0),
        "view-line",
        [0, 128, 0, 255],
        view.name,
      );
    }

    const overlap = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolygonGeometry({
          positions: [
            new Cartesian3(-20, -20, 0),
            new Cartesian3(20, -20, 0),
            new Cartesian3(20, 20, 0),
            new Cartesian3(-20, 20, 0),
          ],
        }),
        appearance: new PerInstanceColorAppearance({ flat: true }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
        },
        id: "overlap-ground",
      }),
    );
    pointCameraAt(world);
    scene.renderForSpecs();
    expect([
      [255, 255, 255, 255],
      [0, 0, 255, 255],
    ]).toContain(
      Array.from(
        scene.context.readPixels({ x: 128, y: 128, width: 1, height: 1 }),
      ),
    );
    expect(["view-ground", "overlap-ground"]).toContain(
      scene.pick(windowCenter).id,
    );
    scene.primitives.remove(overlap);
    expectCenterColor([255, 255, 255, 255]);
    expect(scene.pick(windowCenter).id).toBe("view-ground");
    scene.primitives.remove(primitive);
    scene.primitives.remove(line);
  });

  it("keeps mitered turns and loops continuous while updating premultiplied line color in place", function () {
    if (window.webglStub) {
      return;
    }
    const world = createWorld({ maximumLevel: 0, baseColor: Color.BLACK });
    scene = createPlanarScene(world, 64, 64);
    scene.frameState.scene3DOnly = true;
    scene.camera.frustum = new OrthographicFrustum({
      width: 256,
      aspectRatio: 1,
      near: 0.1,
      far: 1000,
    });
    pointCameraAt(world, 128);
    const appearance = new PolylineMaterialAppearance({
      material: Material.fromType(Material.ColorType, { color: Color.RED }),
    });
    const turn = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [
            new Cartesian3(-100, -50, 0),
            new Cartesian3(-30, 20, 0),
            new Cartesian3(20, -40, 0),
          ],
          width: 12,
        }),
        appearance,
        id: "turn-line",
      }),
    );
    const loop = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [
            new Cartesian3(40, -50, 0),
            new Cartesian3(105, -20, 0),
            new Cartesian3(70, 55, 0),
            new Cartesian3(40, -50, 0),
          ],
          width: 12,
        }),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType(Material.ColorType, {
            color: Color.GREEN,
          }),
        }),
        id: "loop-line",
      }),
    );
    scene.renderForSpecs();
    scene.renderForSpecs();
    expect(loop.ready).toBeTrue();
    const turnWindow = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(-30, 20, 0),
    );
    const loopWindow = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(40, -50, 0),
    );
    const turnOuterMiterWindow = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(-30, 38, 0),
    );
    const loopSeamMiterWindow = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(28, -64, 0),
    );
    expect(readWindowPixel(turnWindow)).toEqual([255, 0, 0, 255]);
    expect(scene.pick(turnWindow).id).toBe("turn-line");
    expect(readWindowPixel(turnOuterMiterWindow)).toEqual([255, 0, 0, 255]);
    expect(scene.pick(turnOuterMiterWindow).id).toBe("turn-line");
    expect(readWindowPixel(loopWindow)).toEqual([0, 128, 0, 255]);
    expect(scene.pick(loopWindow).id).toBe("loop-line");
    expect(readWindowPixel(loopSeamMiterWindow)).toEqual([0, 128, 0, 255]);
    expect(scene.pick(loopSeamMiterWindow).id).toBe("loop-line");

    const current = turn._current;
    const vertexArray = current._va[0];
    const shaderProgram = current._sp;
    const commands = turn._currentCommands.colorCommands.slice();
    appearance.material.uniforms.color = Color.fromBytes(0, 0, 255, 128);
    scene.renderForSpecs();
    expect(readWindowPixel(turnWindow)).toEqual([0, 0, 128, 255]);
    expect(scene.pick(turnWindow).id).toBe("turn-line");
    expect(turn._current).toBe(current);
    expect(current._va[0]).toBe(vertexArray);
    expect(current._sp).toBe(shaderProgram);
    expect(turn._currentCommands.colorCommands).toEqual(commands);
  });

  it("keeps an EPSG:3857 ground line stable across camera poses without rebuilding GPU state", function () {
    if (window.webglStub) {
      return;
    }
    const centerValue = 20037508.342789244;
    const world = createWorld({
      minimum: centerValue - 128.0,
      size: 256.0,
      maximumLevel: 0,
      baseColor: Color.BLACK,
      crs: "EPSG:3857",
    });
    scene = createPlanarScene(world, 256, 256);
    scene.frameState.scene3DOnly = true;
    scene.logarithmicDepthBuffer = false;
    const center = new Cartesian3(centerValue, centerValue, 0.0);
    const lineX = centerValue + 30.0;
    const line = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [
            new Cartesian3(lineX, centerValue - 32.0, 0.0),
            new Cartesian3(lineX, centerValue + 32.0, 0.0),
          ],
          width: 20,
        }),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType(Material.ColorType, {
            color: Color.MAGENTA,
          }),
        }),
        id: "large-offset-line",
      }),
    );
    const views = [
      {
        name: "large-offset perspective high",
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 0.1,
          far: 2000,
        }),
        position: new Cartesian3(centerValue, centerValue, 160.0),
        referenceUp: Cartesian3.UNIT_Y,
      },
      {
        name: "large-offset perspective oblique",
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 0.1,
          far: 2000,
        }),
        position: new Cartesian3(
          centerValue + 180.0,
          centerValue - 180.0,
          180.0,
        ),
        referenceUp: Cartesian3.UNIT_Z,
      },
      {
        name: "large-offset perspective reverse",
        frustum: new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 0.1,
          far: 2000,
        }),
        position: new Cartesian3(
          centerValue - 180.0,
          centerValue + 180.0,
          180.0,
        ),
        referenceUp: Cartesian3.UNIT_Z,
      },
      {
        name: "large-offset orthographic",
        frustum: new OrthographicFrustum({
          width: 128,
          aspectRatio: 1,
          near: 0.1,
          far: 2000,
        }),
        position: new Cartesian3(centerValue, centerValue, 160.0),
        referenceUp: Cartesian3.UNIT_Y,
      },
    ];
    let current;
    let vertexArray;
    let shaderProgram;
    let commands;
    for (const view of views) {
      scene.camera.frustum = view.frustum;
      aimCamera(view.position, center, view.referenceUp);
      scene.renderForSpecs();
      if (current === undefined) {
        current = line._current;
        vertexArray = current._va[0];
        shaderProgram = current._sp;
        commands = line._currentCommands.colorCommands.slice();
      }
      expect(line._current).withContext(view.name).toBe(current);
      expect(current._va[0]).withContext(view.name).toBe(vertexArray);
      expect(current._sp).withContext(view.name).toBe(shaderProgram);
      expect(line._currentCommands.colorCommands)
        .withContext(view.name)
        .toEqual(commands);
      expectStableGroundLine(
        line,
        new Cartesian3(lineX, centerValue - 20.0, 0.0),
        new Cartesian3(lineX, centerValue, 0.0),
        new Cartesian3(lineX, centerValue + 20.0, 0.0),
        "large-offset-line",
        [255, 0, 255, 255],
        view.name,
      );
    }
    scene.primitives.remove(line);
    expect(line.isDestroyed()).toBeTrue();
  });

  it("limits shallow-view terrain and imagery work while retaining rendered coverage and depth", async function () {
    async function sample(distance) {
      const world = createWorld({
        minimum: -2048,
        size: 4096,
        maximumLevel: 4,
      });
      world.maximumTiltedTileDistance = distance;
      const terrainRequests = new Set();
      const imageryRequests = new Set();
      const data = new SceneGISPlanarHeightmapTerrainData({
        buffer: new Float32Array([2, 2, 2, 2]),
        width: 2,
        height: 2,
      });
      const provider = {
        tilingScheme: world.tilingScheme,
        minimumHeight: 2,
        maximumHeight: 2,
        maximumLevel: 4,
        errorEvent: new Event(),
        credit: undefined,
        getLevelMaximumGeometricError: (level) => 16 / 2 ** level,
        requestTileGeometry: (x, y, level) => {
          terrainRequests.add(`${level}/${x}/${y}`);
          return Promise.resolve(data);
        },
        getTileDataAvailable: () => true,
        loadTileDataAvailability: () => undefined,
        destroy: jasmine.createSpy("destroyProvider"),
      };
      world.terrainProvider = provider;
      const image = document.createElement("canvas");
      image.width = image.height = 1;
      const context = image.getContext("2d");
      context.fillStyle = "red";
      context.fillRect(0, 0, 1, 1);
      world.imageryLayers.addImageryProvider({
        tilingScheme: world.tilingScheme,
        minimumLevel: 0,
        maximumLevel: 4,
        tileWidth: 1,
        tileHeight: 1,
        hasAlphaChannel: false,
        errorEvent: new Event(),
        credit: undefined,
        requestImage: (x, y, level) => {
          imageryRequests.add(`${level}/${x}/${y}`);
          return Promise.resolve(image);
        },
      });
      scene = createPlanarScene(world, 128, 128);
      scene.camera.frustum = new PerspectiveFrustum({
        fov: Math.PI / 3,
        aspectRatio: 1,
        near: 1,
        far: 10000,
      });
      aimCamera(
        new Cartesian3(0, -1000, 20),
        new Cartesian3(0, -794, 2),
        Cartesian3.UNIT_Z,
      );
      await renderUntil(() => world.tilesLoaded);
      const quadtree = world._surface._quadtree;
      const keys = quadtree._idealTiles.map((tile) => tile.key).sort();
      expect(quadtree._renderTiles.map((tile) => tile.key).sort()).toEqual(
        keys,
      );
      const center = new Cartesian2(64.5, 63.5);
      expect(readWindowPixel(center)).toEqual([255, 0, 0, 255]);
      const requests = [terrainRequests.size, imageryRequests.size];
      if (scene.pickPositionSupported) {
        expect(scene.pickPosition(center).z).toBeCloseTo(2, 1);
        expect([terrainRequests.size, imageryRequests.size]).toEqual(requests);
      }
      scene.renderForSpecs();
      expect([terrainRequests.size, imageryRequests.size]).toEqual(requests);
      const result = { requests, selected: keys.length };
      scene.destroyForSpecs();
      scene = undefined;
      expect(provider.destroy).not.toHaveBeenCalled();
      expect(quadtree._tiles.size).toBe(0);
      return result;
    }
    const unrestricted = await sample(Infinity);
    const limited = await sample(10);
    expect(limited.selected).toBeLessThan(unrestricted.selected);
    expect(limited.requests[0]).toBeLessThan(unrestricted.requests[0]);
    expect(limited.requests[1]).toBeLessThan(unrestricted.requests[1]);
  });

  it("lazily creates one shared unit quad and renders the base color", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    scene.backgroundColor = Color.BLACK;
    pointCameraAt(world);

    expect(world._surface._vertexArray).toBeUndefined();
    expect(world._surface._terrain).toBeUndefined();
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
    const tile = surface._quadtree._idealTiles[0];
    expect(tile._imagerySlots).toBeUndefined();
    expect(tile.imageryBindings).toBeUndefined();
    expect(tile._imageryRelease).toBeUndefined();
    expect(tile.command.boundingVolume).toBe(tile.commandBoundingVolume);
    expect(tile.command.boundingVolume).not.toBe(tile.boundingVolume);
    expect(tile.terrainEntry).toBeUndefined();
    expect(tile._terrainRelease).toBeUndefined();
  });

  it("changes a pending flat tile to one indexed terrain command on normal render", async function () {
    const world = createWorld({ maximumLevel: 0 });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-20.0, 20.0, 40.0, 80.0]),
      width: 2,
      height: 2,
    });
    const provider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -20.0,
      maximumHeight: 80.0,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 4.0,
      requestTileGeometry: () => Promise.resolve(terrainData),
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    world.terrainProvider = provider;
    scene = createPlanarScene(world);
    pointCameraAt(world, 256.0);

    scene.renderForSpecs();
    const tile = world._surface._quadtree._idealTiles[0];
    expect(tile.command.primitiveType).toBe(PrimitiveType.TRIANGLE_STRIP);
    expect(world.tilesLoaded).toBe(false);
    await renderUntil(
      () => tile.terrainEntry.state === world._surface._terrain.State.READY,
    );

    expect(tile.terrainEntry.state).toBe(world._surface._terrain.State.READY);
    expect(tile.command.primitiveType).toBe(PrimitiveType.TRIANGLES);
    expect(tile.command.vertexArray).toBe(tile.terrainEntry.vertexArray);
    expect(tile.command.count).toBe(30);
    expect(tile.boundingVolume.halfAxes[8]).toBe(50.0);
    expect(world.tilesLoaded).toBe(true);
    const snapshot = world._surface._terrainQuerySnapshot;
    const snapshotEntry = snapshot[0];
    expect(world._surface._terrainQuerySnapshotCount).toBe(1);
    expect(snapshotEntry.tile).toBe(tile);
    expect(snapshotEntry.content).toBe(tile.terrainEntry.activeContent);
    expect(snapshotEntry.mesh).toBe(tile.terrainEntry.activeContent.mesh);
    const debug = { ...world._surface._terrain._debug };
    const command = tile.command;
    scene.renderForSpecs();
    expect(tile.command).toBe(command);
    expect(world._surface._terrain._debug).toEqual(debug);
    expect(world._surface._terrainQuerySnapshot).toBe(snapshot);
    expect(world._surface._terrainQuerySnapshot[0]).toBe(snapshotEntry);

    const cachedCommands = world._surface._renderCommands.slice();
    const replayFrameState = {
      context: scene.context,
      passes: { pick: true, depth: true },
      commandList: [],
    };
    world.render(replayFrameState);
    expect(replayFrameState.commandList).toEqual(cachedCommands);
    expect(replayFrameState.commandList[0]).toBe(command);
    expect(world._surface._terrain._debug).toEqual(debug);

    const oldTile = snapshotEntry.tile;
    const oldContent = snapshotEntry.content;
    const oldMesh = snapshotEntry.mesh;
    const replacement = { ...provider, errorEvent: new Event() };
    world.terrainProvider = replacement;
    expect(world._surface._terrainQuerySnapshotCount).toBe(0);
    expect(snapshotEntry.tile).toBeUndefined();
    expect(snapshotEntry.content).toBeUndefined();
    expect(snapshotEntry.mesh).toBeUndefined();
    expect(snapshotEntry.tile).not.toBe(oldTile);
    expect(snapshotEntry.content).not.toBe(oldContent);
    expect(snapshotEntry.mesh).not.toBe(oldMesh);

    await renderUntil(
      () => world._surface._terrainQuerySnapshot[0]?.mesh !== undefined,
    );
    expect(world._surface._terrainQuerySnapshot[0]).toBe(snapshotEntry);
    expect(snapshotEntry.tile).toBeDefined();
    expect(snapshotEntry.content).toBeDefined();
    expect(snapshotEntry.mesh).toBeDefined();
    world.terrainProvider = undefined;
    expect(world._surface._terrainQuerySnapshotCount).toBe(0);
    expect(snapshotEntry.tile).toBeUndefined();
    expect(snapshotEntry.content).toBeUndefined();
    expect(snapshotEntry.mesh).toBeUndefined();
  });

  it("drapes through an interior terrain peak with linear and logarithmic depth", async function () {
    const world = createWorld({ maximumLevel: 0 });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([0, 0, 0, 0, 48, 0, 0, 0, 0]),
      width: 3,
      height: 3,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0,
      maximumHeight: 80,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 1,
      requestTileGeometry: () => Promise.resolve(terrainData),
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    scene = createPlanarScene(world, 64, 64);
    scene.frameState.scene3DOnly = true;
    scene.logarithmicDepthBuffer = false;
    pointCameraAt(world, 256);
    const primitive = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [new Cartesian3(-96, 0, 0), new Cartesian3(96, 0, 0)],
          width: 8,
        }),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType(Material.ColorType, {
            color: Color.WHITE,
          }),
        }),
        id: "terrain-ground",
      }),
    );
    await renderUntil(
      () => world.getTerrainHeight(new Cartesian3(0, 0, 0)) === 48,
    );
    const center = new Cartesian2(32, 32);
    expect(world.getTerrainHeight(new Cartesian3(0, 0, 0))).toBeCloseTo(48, 5);
    if (scene.pickPositionSupported) {
      const mathematical = world.pickFromWindowPosition(center, scene);
      const pickedPosition = scene.pickPosition(center);
      expect(pickedPosition).toBeDefined();
      expect(
        Math.abs(pickedPosition.z - world.getTerrainHeight(mathematical)),
      ).toBeLessThan(1.0);
    }
    expect(
      Array.from(
        scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
      ),
    ).toEqual([255, 255, 255, 255]);
    expect(scene.pick(center).id).toBe("terrain-ground");
    const current = primitive._current;
    scene.renderForSpecs();
    expect(primitive._current).toBe(current);
    if (scene.context.fragmentDepth) {
      scene.logarithmicDepthBuffer = true;
      scene.renderForSpecs();
      expect(scene.pick(center).id).toBe("terrain-ground");
    }

    scene.primitives.remove(primitive);
    const polygon = scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolygonGeometry({
          positions: [
            new Cartesian3(-24, -24, 0),
            new Cartesian3(24, -24, 0),
            new Cartesian3(24, 24, 0),
            new Cartesian3(-24, 24, 0),
          ],
        }),
        appearance: new PerInstanceColorAppearance({ flat: true }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.YELLOW),
        },
        id: "terrain-ground-polygon",
      }),
    );
    scene.renderForSpecs();
    expect(polygon.ready).toBeTrue();
    if (scene.pickPositionSupported) {
      const pickedPosition = scene.pickPosition(center);
      expect(pickedPosition).toBeDefined();
      expect(Math.abs(pickedPosition.z - 48)).toBeLessThan(1.1);
    }
    expect(scene.pick(center).id).toBe("terrain-ground-polygon");
  });

  it("clears strong references across snapshot shrink and no-cover invalidation", function () {
    const world = createWorld();
    const surface = world._surface;
    const entries = [{}, {}, {}];
    surface._terrainQuerySnapshot.push(...entries);
    for (let i = 0; i < entries.length; ++i) {
      Object.assign(entries[i], {
        tile: { id: `tile-${i}` },
        content: { id: `content-${i}` },
        mesh: { positions: new Float32Array(1024) },
        source: "DIRECT",
        revision: i,
        key: `0/${i}/0`,
      });
    }
    surface._terrainQuerySnapshotCount = entries.length;

    surface.invalidateTerrainQuerySnapshot();

    expect(surface._terrainQuerySnapshot).toEqual(entries);
    for (const entry of entries) {
      expect(entry.tile).toBeUndefined();
      expect(entry.content).toBeUndefined();
      expect(entry.mesh).toBeUndefined();
      expect(entry.source).toBeUndefined();
      expect(entry.revision).toBeUndefined();
      expect(entry.key).toBeUndefined();
    }

    Object.assign(entries[0], {
      tile: {},
      content: {},
      mesh: { positions: new Float32Array(16) },
      source: "UPSAMPLED",
      revision: 4,
      key: "0/0/0",
    });
    surface._terrainQuerySnapshotCount = 1;
    surface.invalidateTerrainQuerySnapshot();
    expect(surface._terrainQuerySnapshot[0]).toBe(entries[0]);
    expect(entries[0].mesh).toBeUndefined();
    expect(entries[1].mesh).toBeUndefined();
    expect(entries[2].mesh).toBeUndefined();
    world.destroy();
  });

  it("keeps direct content over a stale fallback refresh after the four-child gate", async function () {
    const world = createWorld({ maximumLevel: 1 });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-20.0, 20.0, 40.0, 80.0]),
      width: 2,
      height: 2,
    });
    let resolveDeferred;
    const provider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -20.0,
      maximumHeight: 80.0,
      maximumLevel: 1,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 4.0,
      requestTileGeometry: (x, y, level) => {
        if (level === 1 && x === 1 && y === 1) {
          return new Promise((resolve) => {
            resolveDeferred = resolve;
          });
        }
        return Promise.resolve(terrainData);
      },
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    world.terrainProvider = provider;
    scene = createPlanarScene(world);
    pointCameraAt(world, 64.0);

    await renderUntil(() => {
      const root = world._surface._quadtree._tiles.get("0/0/0");
      return root?.terrainEntry.state === world._surface._terrain.State.READY;
    });
    expect(world._surface._renderCommands.length).toBe(1);
    expect(world._surface._renderCommands[0].owner).toBe(world._surface);
    expect(world._surface._quadtree._renderTiles[0].key).toBe("0/0/0");

    await renderUntil(
      () =>
        world._surface._quadtree._renderTiles.length === 4 &&
        !world._surface._quadtree._renderTiles.some(
          (tile) => tile.key === "0/0/0",
        ),
    );
    const children = world._surface._quadtree._renderTiles;
    expect(children.map((tile) => tile.key)).toEqual([
      "1/0/0",
      "1/1/0",
      "1/0/1",
      "1/1/1",
    ]);
    expect(
      children.some(
        (tile) =>
          tile.terrainEntry.activeSource ===
          world._surface._terrain.Source.UPSAMPLED,
      ),
    ).toBe(true);
    expect(children.some((tile) => tile.key === "0/0/0")).toBe(false);

    const deferred = children.find((tile) => tile.key === "1/1/1");
    const fallbackVertexArray = deferred.terrainEntry.vertexArray;
    const destroyFallback = spyOn(
      fallbackVertexArray,
      "destroy",
    ).and.callThrough();
    const command = deferred.command;
    const parent = world._surface._quadtree._tiles.get("0/0/0");
    parent.terrainEntry.revision =
      parent.terrainEntry.activeContent.revision + 1;
    const beforeDirect = { ...world._surface._terrain._debug };
    resolveDeferred(terrainData);
    await Promise.resolve();
    await renderUntil(
      () =>
        deferred.terrainEntry.activeSource ===
        world._surface._terrain.Source.DIRECT,
    );
    expect(deferred.terrainEntry.activeSource).toBe(
      world._surface._terrain.Source.DIRECT,
    );
    expect(deferred.terrainEntry.fallbackContent).toBeUndefined();
    expect(deferred.terrainEntry.fallbackState).toBe(
      world._surface._terrain.FallbackState.NONE,
    );
    expect(deferred.command).toBe(command);
    expect(deferred.terrainEntry.vertexArray).not.toBe(fallbackVertexArray);
    expect(fallbackVertexArray.isDestroyed()).toBe(true);
    expect(destroyFallback).toHaveBeenCalledTimes(1);
    expect(world._surface._terrain._debug.createdUpsampledData).toBe(
      beforeDirect.createdUpsampledData,
    );

    const afterDirect = { ...world._surface._terrain._debug };
    scene.renderForSpecs();
    expect(deferred.terrainEntry.activeSource).toBe(
      world._surface._terrain.Source.DIRECT,
    );
    expect(world._surface._terrain._debug).toEqual(afterDirect);
    const replayFrameState = {
      context: scene.context,
      passes: { pick: true, depth: true },
      commandList: [],
    };
    world.render(replayFrameState);
    expect(replayFrameState.commandList).toEqual(
      world._surface._renderCommands,
    );
    expect(deferred.terrainEntry.activeSource).toBe(
      world._surface._terrain.Source.DIRECT,
    );
    expect(world._surface._terrain._debug).toEqual(afterDirect);
  });

  [false, true].forEach(function (quantized) {
    it(`retains elevated cover across consecutive missing terrain levels (${quantized ? "quantized" : "heightmap"})`, async function () {
      const world = createWorld({
        maximumLevel: 2,
        maximumScreenSpaceError: 1e9,
      });
      const data = quantized
        ? new SceneGISPlanarQuantizedMeshTerrainData({
            quantizedVertices: new Uint16Array([
              0, 32767, 0, 32767, 0, 0, 32767, 32767, 32767, 32767, 32767,
              32767,
            ]),
            indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
            westIndices: new Uint16Array([0, 2]),
            southIndices: new Uint16Array([1, 0]),
            eastIndices: new Uint16Array([3, 1]),
            northIndices: new Uint16Array([2, 3]),
            quantizedMinimumHeight: 0,
            quantizedMaximumHeight: 40,
          })
        : new SceneGISPlanarHeightmapTerrainData({
            buffer: new Float32Array([40, 40, 40, 40]),
            width: 2,
            height: 2,
          });
      const request = jasmine.createSpy("request").and.resolveTo(data);
      world.terrainProvider = {
        tilingScheme: world.tilingScheme,
        minimumHeight: 0,
        maximumHeight: 80,
        maximumLevel: 2,
        errorEvent: new Event(),
        getLevelMaximumGeometricError: (level) => 4 / 2 ** level,
        getTileDataAvailable: (x, y, level) => level === 0,
        loadTileDataAvailability: () => undefined,
        requestTileGeometry: request,
      };
      scene = createPlanarScene(world, 64, 64);
      pointCameraAt(world, 256);
      await renderUntil(() => world.tilesLoaded);
      const surface = world._surface;
      const terrain = surface._terrain;
      expect(surface._quadtree._renderTiles.map((tile) => tile.key)).toEqual([
        "0/0/0",
      ]);

      world.maximumScreenSpaceError = 0.001;
      let previous = { ...terrain._debug };
      await renderUntil(() => {
        const tiles = surface._quadtree._renderTiles;
        expect(tiles.length).toBeGreaterThan(0);
        for (const tile of tiles) {
          expect(tile.terrainEntry.activeSource).not.toBe(terrain.Source.FLAT);
          expect(tile.terrainEntry.mesh.minimumHeight).toBeCloseTo(40, 6);
          expect(tile.terrainEntry.mesh.maximumHeight).toBeCloseTo(40, 6);
        }
        const position = scene.pickPosition(new Cartesian2(32, 32));
        expect(position).toBeDefined();
        expect(position.z).toBeCloseTo(40, 3);
        const debug = terrain._debug;
        expect(debug.promotions - previous.promotions).toBeLessThanOrEqual(2);
        expect(
          debug.startedMeshTasks +
            debug.startedUpsampleTasks -
            previous.startedMeshTasks -
            previous.startedUpsampleTasks,
        ).toBeLessThanOrEqual(2);
        previous = { ...debug };
        return world.tilesLoaded;
      });
      expect(
        surface._quadtree._renderTiles.every((tile) => tile.level === 2),
      ).toBe(true);
      expect(request).toHaveBeenCalledTimes(1);
      const settled = { ...terrain._debug };
      scene.renderForSpecs();
      expect(terrain._debug).toEqual(settled);
      world.terrainProvider = undefined;
      expect(terrain._debug.destroyedVertexArrays).toBe(
        terrain._debug.createdVertexArrays,
      );
      expect(terrain._debug.destroyedVertexBuffers).toBe(
        terrain._debug.createdVertexBuffers,
      );
    });
  });

  it("defers culled bridge direct work until it enters the visible chain", async function () {
    const world = createWorld({
      maximumLevel: 1,
      maximumScreenSpaceError: 0.01,
    });
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-20.0, 20.0, 40.0, 80.0]),
      width: 2,
      height: 2,
    });
    const requests = [];
    const provider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -20.0,
      maximumHeight: 80.0,
      maximumLevel: 1,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 4.0,
      requestTileGeometry: (x, y, level) => {
        requests.push(`${level}/${x}/${y}`);
        return Promise.resolve(terrainData);
      },
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    world.terrainProvider = provider;
    scene = createPlanarScene(world);

    let includeBridge = false;
    const frameState = {
      frameNumber: 0,
      context: scene.context,
      pixelRatio: 1.0,
      passes: { render: true },
      commandList: [],
      cullingVolume: {
        computeVisibility: (volume) =>
          !includeBridge && volume.center.x > 0.0 && volume.center.y < 0.0
            ? Intersect.OUTSIDE
            : Intersect.INSIDE,
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
      creditDisplay: { addCreditToNextFrame: function () {} },
    };
    const render = () => {
      ++frameState.frameNumber;
      frameState.commandList.length = 0;
      world.beginFrame(frameState);
      world.render(frameState);
    };

    let bridge;
    let observedBlockingCoverage = false;
    let observedSettledChildCover = false;
    await pollToPromise(function () {
      render();
      bridge ??= Array.from(world._surface._quadtree._tiles.values()).find(
        (tile) =>
          tile.level === 1 &&
          tile.boundingVolume.center.x > 0.0 &&
          tile.boundingVolume.center.y < 0.0,
      );
      if (
        bridge?.terrainEntry.fallbackState ===
          world._surface._terrain.FallbackState.QUEUED &&
        !bridge.terrainEntry.activeContent
      ) {
        observedBlockingCoverage = true;
        expect(
          world._surface._quadtree._renderTiles.map((tile) => tile.key),
        ).toEqual(["0/0/0"]);
        expect(world.tilesLoaded).toBe(false);
      }
      if (
        bridge?.terrainEntry.activeContent &&
        !world._surface._quadtree._renderTiles.some(
          (tile) => tile.key === "0/0/0",
        ) &&
        world.tilesLoaded
      ) {
        observedSettledChildCover = true;
      }
      return observedBlockingCoverage && observedSettledChildCover;
    });
    expect(bridge).toBeDefined();
    expect(observedBlockingCoverage).toBe(true);
    expect(observedSettledChildCover).toBe(true);
    expect(requests).not.toContain(bridge.key);
    expect(bridge.terrainEntry.state).toBe(
      world._surface._terrain.State.UNLOADED,
    );
    expect(bridge.terrainEntry.activeSource).toBe(
      world._surface._terrain.Source.UPSAMPLED,
    );
    expect(world.tilesLoaded).toBe(true);
    expect(
      world._surface._quadtree._renderTiles.map((tile) => tile.key),
    ).not.toContain("0/0/0");

    const promotionsBeforeMove = world._surface._terrain._debug.promotions;
    includeBridge = true;
    render();
    expect(requests).toContain(bridge.key);
    expect(bridge.terrainEntry.state).toBe(
      world._surface._terrain.State.LOADING,
    );
    expect(world._surface._terrain._debug.promotions).toBe(
      promotionsBeforeMove,
    );
    expect(world._surface._quadtree._renderTiles.length).toBe(4);
    expect(
      world._surface._quadtree._renderTiles.map((tile) => tile.key),
    ).not.toContain("0/0/0");

    await pollToPromise(function () {
      render();
      return (
        bridge.terrainEntry.activeSource ===
        world._surface._terrain.Source.DIRECT
      );
    });
    expect(bridge.terrainEntry.activeSource).toBe(
      world._surface._terrain.Source.DIRECT,
    );
    expect(world.tilesLoaded).toBe(true);
    expect(world._surface._quadtree._renderTiles.length).toBe(4);
  });

  it("keeps fresh zero-layer imagery state absent and only clears existing slots", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();

    const tile = world._surface._quadtree._idealTiles[0];
    expect(tile._imagerySlots).toBeUndefined();
    expect(tile.imageryBindings).toBeUndefined();
    expect(tile._imageryRelease).toBeUndefined();

    world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: true,
      errorEvent: new Event(),
      credit: undefined,
      requestImage: () => undefined,
    });
    scene.renderForSpecs();
    const slots = tile._imagerySlots;
    expect(slots.length).toBe(1);
    expect(tile.imageryBindings).toBeDefined();
    expect(tile._imageryRelease).toBeDefined();

    world.imageryLayers.removeAll();
    scene.renderForSpecs();
    expect(tile._imagerySlots).toBe(slots);
    expect(tile._imagerySlots.length).toBe(0);
  });

  it("publishes filter snapshots only on normal render and reuses command resources", function () {
    const world = createWorld({ maximumLevel: 0 });
    const layer = world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: true,
      errorEvent: new Event(),
      credit: undefined,
      requestImage: () => undefined,
    });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();

    const surface = world._surface;
    const tile = surface._quadtree._idealTiles[0];
    const slot = tile._imagerySlots[0];
    const command = tile.command;
    const shader = command.shaderProgram;
    const vertexArray = command.vertexArray;
    const binding = tile.imageryBindings.get(layer);
    const shaderMapSize = surface._shaderPrograms.size;
    const colorToAlpha = slot.colorToAlpha;
    expect(command.uniformMap.u_brightness0()).toBe(1.0);
    expect(command.uniformMap.u_colorToAlpha0()).toBe(colorToAlpha);
    expect(colorToAlpha.w).toBe(0.0);

    layer.brightness = 0.25;
    layer.splitDirection = SplitDirection.LEFT;
    layer.gamma = 2.0;
    layer.colorToAlpha = new Color(0.1, 0.2, 0.3, 0.0);
    layer.colorToAlphaThreshold = 0.2;
    expect(command.uniformMap.u_brightness0()).toBe(1.0);
    expect(command.uniformMap.u_splitDirection0()).toBe(SplitDirection.NONE);
    expect(command.uniformMap.u_gamma0()).toBe(1.0);
    expect(colorToAlpha.w).toBe(0.0);

    const depthFrameState = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      commandList: [],
    };
    world.render(depthFrameState);
    expect(depthFrameState.commandList).toEqual([command]);
    expect(command.uniformMap.u_splitDirection0()).toBe(SplitDirection.NONE);
    expect(command.uniformMap.u_brightness0()).toBe(1.0);
    expect(colorToAlpha.w).toBe(0.0);

    scene.renderForSpecs();
    expect(tile._imagerySlots[0]).toBe(slot);
    expect(slot.colorToAlpha).toBe(colorToAlpha);
    expect(command.uniformMap.u_brightness0()).toBe(0.25);
    expect(command.uniformMap.u_splitDirection0()).toBe(SplitDirection.LEFT);
    expect(command.uniformMap.u_gamma0()).toBe(2.0);
    // A pending image cannot change the decode domain of other ready layers.
    expect(command.uniformMap.u_sceneGISImageryApplyGamma()).toBe(false);
    expect(command.uniformMap.u_colorToAlphaThreshold0()).toBe(0.2);
    expect(colorToAlpha).toEqual(new Cartesian4(0.1, 0.2, 0.3, 1.0));
    expect(tile.command).toBe(command);
    expect(command.shaderProgram).toBe(shader);
    expect(command.vertexArray).toBe(vertexArray);
    expect(tile.imageryBindings.get(layer)).toBe(binding);
    expect(surface._shaderPrograms.size).toBe(shaderMapSize);
  });

  it("publishes Material identity only after a successful normal render", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();

    const surface = world._surface;
    const previousCommands = surface._renderCommands.slice();
    const previousShaderMapSize = surface._shaderPrograms.size;
    const material = Material.fromType(Material.ElevationContourType);
    world.material = material;

    const depthFrameState = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      commandList: [],
    };
    world.render(depthFrameState);
    expect(depthFrameState.commandList).toEqual(previousCommands);
    expect(surface._publishedMaterial).toBeUndefined();

    const update = spyOn(material, "update").and.throwError("style update");
    const failedFrameState = {
      ...scene.frameState,
      frameNumber: scene.frameState.frameNumber + 1,
      passes: { render: true },
      commandList: [],
    };
    world.beginFrame(failedFrameState);
    expect(() => world.render(failedFrameState)).toThrowError("style update");
    expect(failedFrameState.commandList).toEqual([]);
    expect(surface._renderCommands).toEqual(previousCommands);
    expect(surface._publishedMaterial).toBeUndefined();
    expect(surface._shaderPrograms.size).toBe(previousShaderMapSize);

    update.and.callThrough();
    scene.renderForSpecs();
    expect(surface._publishedMaterial).toBe(material);
    expect(surface._renderCommands.length).toBe(1);
    expect(surface._renderCommands[0]).toBe(previousCommands[0]);
    expect(surface._renderCommands[0].uniformMap).toEqual(
      jasmine.objectContaining(material._uniforms),
    );

    world.material = undefined;
    const publishedCommand = surface._renderCommands[0];
    const replayFrameState = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      commandList: [],
    };
    world.render(replayFrameState);
    expect(replayFrameState.commandList).toEqual([publishedCommand]);
    expect(surface._publishedMaterial).toBe(material);
    material.destroy();
  });

  it("uses the exact tile volume for quadtree visibility", function () {
    const world = createWorld({ maximumLevel: 0 });
    let testedVolume;
    const frameState = {
      frameNumber: 1,
      passes: { render: true },
      context: { drawingBufferWidth: 1, drawingBufferHeight: 1 },
      pixelRatio: 1.0,
      commandList: [],
      cullingVolume: {
        computeVisibility: (volume) => {
          testedVolume = volume;
          return Intersect.OUTSIDE;
        },
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

    world.beginFrame(frameState);
    world._surface._terrainQuerySnapshotCount = 1;
    world.render(frameState);

    const tile = world._surface._quadtree._tiles.get("0/0/0");
    expect(testedVolume).toBe(tile.boundingVolume);
    expect(testedVolume).not.toBe(tile.commandBoundingVolume);
    expect(world._surface._terrainQuerySnapshotCount).toBe(0);
    world.destroy();
  });

  it("fits the nadir plane strictly inside the command-volume frustum interval", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();

    const tile = world._surface._quadtree._idealTiles[0];
    const distance = scene.camera.positionWC.z;
    const interval = tile.commandBoundingVolume.computePlaneDistances(
      scene.camera.positionWC,
      scene.camera.directionWC,
    );
    expect(interval.start).toBeLessThan(distance);
    expect(interval.stop).toBeGreaterThan(distance);

    const frustum = scene._view.frustumCommandsList[0];
    expect(frustum.near).toBeLessThan(distance);
    expect(frustum.far).toBeGreaterThan(distance);
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
    world._surface._terrainQuerySnapshotCount = 1;
    world.render(frameState);

    expect(frameState.commandList).toEqual([]);
    expect(world._surface._quadtree._debug.visited).toBe(0);
    expect(world._surface._vertexArray).toBeUndefined();
    expect(world._surface._context).toBeUndefined();
    expect(world._surface._terrainQuerySnapshotCount).toBe(0);

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
    expect(world._surface._terrainQuerySnapshotCount).toBe(0);

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

  it("switches lighting variants on the existing command and replays the lit command", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world, 128.0);
    scene.light = new DirectionalLight({
      direction: Cartesian3.normalize(
        new Cartesian3(1.0, 0.0, 1.0),
        new Cartesian3(),
      ),
    });
    scene.renderForSpecs();

    const surface = world._surface;
    const tile = surface._quadtree._renderTiles[0];
    const command = tile.command;
    const unlitShader = command.shaderProgram;
    expect(tile._lightingCommandNormalMode).toBe("unlit");
    expect(surface._shaderPrograms.has("0/0/unlit/0")).toBe(true);
    const allocationBefore = {
      commands: surface._debug.createdCommands,
      buffers: surface._debug.createdBuffers,
      vertexArrays: surface._debug.createdVertexArrays,
      textures: surface._debug.createdTextures,
      tiles: surface._quadtree._debug.createdTiles,
    };

    world.enableLighting = true;
    scene.renderForSpecs();
    const litShader = command.shaderProgram;
    expect(tile.command).toBe(command);
    expect(litShader).not.toBe(unlitShader);
    expect(tile._lightingCommandNormalMode).toBe("geometric");
    expect(surface._shaderPrograms.has("0/1/geometric/0")).toBe(true);
    expect(surface._shaderPrograms.size).toBe(2);
    expect(command.uniformMap.u_lambertDiffuseMultiplier()).toBe(0.9);
    expect(surface._debug.createdCommands).toBe(allocationBefore.commands);
    expect(surface._debug.createdBuffers).toBe(allocationBefore.buffers);
    expect(surface._debug.createdVertexArrays).toBe(
      allocationBefore.vertexArrays,
    );
    expect(surface._debug.createdTextures).toBe(allocationBefore.textures);
    expect(surface._quadtree._debug.createdTiles).toBe(allocationBefore.tiles);

    const createdShaders = surface._debug.createdShaders;
    world.lambertDiffuseMultiplier = 0.25;
    scene.renderForSpecs();
    expect(tile.command).toBe(command);
    expect(command.shaderProgram).toBe(litShader);
    expect(command.uniformMap.u_lambertDiffuseMultiplier()).toBe(0.25);
    expect(surface._debug.createdShaders).toBe(createdShaders);

    const depthFrameState = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      commandList: [],
    };
    const quadtreeDebug = { ...surface._quadtree._debug };
    world.render(depthFrameState);
    expect(depthFrameState.commandList).toEqual([command]);
    expect(depthFrameState.commandList[0]).toBe(command);
    expect(surface._quadtree._debug).toEqual(quadtreeDebug);
    expect(surface._debug.createdShaders).toBe(createdShaders);

    world.enableLighting = false;
    scene.renderForSpecs();
    expect(tile.command).toBe(command);
    expect(command.shaderProgram).toBe(unlitShader);
    expect(surface._shaderPrograms.size).toBe(2);
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

  it("replays the last normal render commands for depth picking without mutation", function () {
    const world = createWorld({ maximumLevel: 1 });
    scene = createPlanarScene(world);
    pointCameraAt(world, 64.0);
    scene.renderForSpecs();
    const surface = world._surface;
    const commands = surface._renderCommands.slice();
    const debugBefore = { ...surface._debug };
    const quadtreeDebugBefore = { ...surface._quadtree._debug };
    const idealBefore = surface._quadtree._idealTiles.slice();
    const protectedBefore = new Set(surface._quadtree._protectedKeys);
    const tileStateBefore = Array.from(surface._quadtree._tiles.values()).map(
      (tile) => ({
        tile,
        lastUsedFrame: tile.lastUsedFrame,
        command: tile.command,
      }),
    );

    const depthFrameState = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      commandList: [],
    };
    world.render(depthFrameState);

    expect(depthFrameState.commandList).toEqual(commands);
    for (let i = 0; i < commands.length; ++i) {
      expect(depthFrameState.commandList[i]).toBe(commands[i]);
    }
    expect(surface._debug.submittedCommands).toBe(
      debugBefore.submittedCommands,
    );
    expect(surface._debug.depthSubmittedCommands).toBe(commands.length);
    expect(surface._debug.createdCommands).toBe(debugBefore.createdCommands);
    expect(surface._debug.createdBuffers).toBe(debugBefore.createdBuffers);
    expect(surface._debug.createdShaders).toBe(debugBefore.createdShaders);
    expect(surface._quadtree._debug).toEqual(quadtreeDebugBefore);
    expect(surface._quadtree._idealTiles).toEqual(idealBefore);
    expect(surface._quadtree._protectedKeys).toEqual(protectedBefore);
    expect(
      Array.from(surface._quadtree._tiles.values()).map((tile) => ({
        tile,
        lastUsedFrame: tile.lastUsedFrame,
        command: tile.command,
      })),
    ).toEqual(tileStateBefore);

    depthFrameState.commandList.length = 0;
    world.render(depthFrameState);
    expect(depthFrameState.commandList).toEqual(commands);
    expect(surface._debug.depthSubmittedCommands).toBe(commands.length * 2);
    expect(surface._debug.createdCommands).toBe(debugBefore.createdCommands);
    expect(surface._quadtree._debug).toEqual(quadtreeDebugBefore);
  });

  it("does not bind or allocate when a depth pass has no normal-render cache", function () {
    const world = createWorld();
    const frameState = {
      frameNumber: 1,
      passes: { render: false, pick: true, depth: true },
      context: { drawingBufferWidth: 1, drawingBufferHeight: 1 },
      commandList: [],
    };

    world.render(frameState);

    expect(frameState.commandList).toEqual([]);
    expect(world._surface._context).toBeUndefined();
    expect(world._surface._vertexArray).toBeUndefined();
    expect(world._surface._debug.createdCommands).toBe(0);
    expect(world._surface._quadtree._debug.visited).toBe(0);
    world.destroy();
  });

  it("validates Context before a cached depth-pass replay", function () {
    const world = createWorld({ maximumLevel: 0 });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const commands = world._surface._renderCommands.slice();
    const depthFrameState = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      context: { drawingBufferWidth: 1, drawingBufferHeight: 1 },
      commandList: [],
    };

    expect(() => world.render(depthFrameState)).toThrowDeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );
    expect(depthFrameState.commandList).toEqual([]);
    expect(world._surface._renderCommands).toEqual(commands);
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

    expect(surface._quadtree._debug.evictedTiles).toBe(4);
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
    surface._terrainQuerySnapshot.push({});
    surface._terrainQuerySnapshotCount = 1;

    scene.destroyForSpecs();
    scene = undefined;

    expect(world.isDestroyed()).toBe(true);
    expect(surface.isDestroyed()).toBe(true);
    expect(surface._debug.destroyedVertexArrays).toBe(1);
    expect(surface._debug.destroyedBuffers).toBe(1);
    expect(surface._debug.destroyedShaders).toBe(1);
    expect(surface._quadtree._tiles.size).toBe(0);
    expect(surface._terrainQuerySnapshot.length).toBe(0);
    expect(surface._terrainQuerySnapshotCount).toBe(0);
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

  it("rejects a second Context before imagery state mutation", function () {
    const world = createWorld({ maximumLevel: 0 });
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValue(undefined);
    world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: true,
      errorEvent: new Event(),
      credit: undefined,
      requestImage,
    });
    scene = createPlanarScene(world);
    pointCameraAt(world);
    scene.renderForSpecs();
    const surface = world._surface;
    const imageryDebug = { ...surface._imagery._debug };
    const runtimes = surface._imagery._runtimes;
    const tile = surface._quadtree._idealTiles[0];
    const bindings = tile.imageryBindings;

    const secondScene = createPlanarScene(createWorld({ maximumLevel: 0 }));
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
      expect(() => world.beginFrame(frameState)).toThrowDeveloperError(
        "SceneGISPlanarWorld cannot render with more than one Context.",
      );
      expect(() => world.render(frameState)).toThrowDeveloperError(
        "SceneGISPlanarWorld cannot render with more than one Context.",
      );
      expect(surface._imagery._debug).toEqual(imageryDebug);
      expect(surface._imagery._runtimes).toBe(runtimes);
      expect(tile.imageryBindings).toBe(bindings);
      expect(requestImage).toHaveBeenCalledTimes(1);
    } finally {
      secondScene.destroyForSpecs();
    }
  });
  it("masks partial coverage without changing draws and excludes coarse surfaces", async function () {
    const world = createWorld({
      maximumLevel: 1,
      maximumScreenSpaceError: 1e10,
    });
    const image = document.createElement("canvas");
    image.width = image.height = 1;
    const context = image.getContext("2d");
    context.fillStyle = "#00ff00";
    context.fillRect(0, 0, 1, 1);
    const request = jasmine
      .createSpy("request")
      .and.callFake(() => Promise.resolve(image));
    const layer = world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 1,
      maximumLevel: 1,
      coverageExtent: new SceneGISPlanarExtent({
        minimumX: -10,
        minimumY: -5,
        maximumX: 5,
        maximumY: 12,
      }),
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: true,
      errorEvent: new Event(),
      requestImage: request,
    });
    scene = createPlanarScene(world, 128, 128);
    pointCameraAt(world, 64);
    scene.renderForSpecs();
    expect(request).not.toHaveBeenCalled();
    world.maximumScreenSpaceError = 0.01;
    await renderUntil(() => world.tilesLoaded);
    const sample = (x, y) =>
      readWindowPixel(
        SceneTransforms.worldToWindowCoordinates(
          scene,
          new Cartesian3(x, y, 0),
        ),
      );
    expect(sample(0, 0)).toEqual([0, 255, 0, 255]);
    expect(sample(20, 0)).toEqual([255, 0, 0, 255]);
    expect(sample(0, -20)).toEqual([255, 0, 0, 255]);
    layer.splitDirection = SplitDirection.RIGHT;
    scene.splitPosition = 0.5;
    scene.renderForSpecs();
    expect(sample(-4, 0)).toEqual([255, 0, 0, 255]);
    expect(sample(2, 0)).toEqual([0, 255, 0, 255]);
    expect(sample(20, 0)).toEqual([255, 0, 0, 255]);
    const surface = world._surface;
    expect(surface._renderCommands.length).toBe(
      surface._quadtree._renderTiles.length,
    );
    const commands = surface._renderCommands.slice();
    const before = { ...surface._imagery._debug };
    scene.renderForSpecs();
    expect(surface._imagery._debug).toEqual(before);
    expect(surface._renderCommands).toEqual(commands);
    const replay = {
      ...scene.frameState,
      passes: { render: false, pick: true, depth: true },
      commandList: [],
    };
    world.render(replay);
    expect(replay.commandList).toEqual(commands);
    for (const tile of surface._quadtree._renderTiles) {
      expect(tile.command.uniformMap.u_coverage0()).toBe(
        tile.imageryBindings.get(layer).coverage,
      );
    }
    const count = request.calls.count();
    world.maximumScreenSpaceError = 1e10;
    scene.renderForSpecs();
    expect(sample(0, 0)).toEqual([255, 0, 0, 255]);
    expect(request.calls.count()).toBe(count);
    expect(world.tilesLoaded).toBe(true);
  });
});
