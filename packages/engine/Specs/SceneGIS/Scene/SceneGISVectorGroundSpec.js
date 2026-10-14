import {
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Cartesian4,
  CullingVolume,
  Color,
  ColorGeometryInstanceAttribute,
  ClippingPlane,
  ClippingPlaneCollection,
  Event,
  SceneTransforms,
  SceneGISPlanarWorld,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
  DirectionalLight,
  FramebufferManager,
  PixelDatatype,
  ContextLimits,
  SceneGISScreenSpaceReflections,
  SceneGISWaterSurface,
  PolygonHierarchy,
  Matrix4,
  GeometryInstance,
  PerInstanceColorAppearance,
  Primitive,
  OrthographicFrustum,
  Pass,
  SceneGISTemporalAntialiasing,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";
import cover from "../../../Source/SceneGIS/Scene/_private/_SceneGISVectorTileCover.js";

describe("SceneGIS/Scene/SceneGISVectorGround", function () {
  let scene, world, source;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(256, 256) });
    scene.frameState.scene3DOnly = true;
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128,
          minimumY: -128,
          maximumX: 128,
          maximumY: 128,
        }),
        crs: "EPSG:3857",
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
    });
    scene._initializeWorld(world);
    // Isolate surface coverage and independent alpha from the default environment.
    scene.environmentEffects.enabled = false;
    scene.gamma = 1;
    scene.msaaSamples = 1;
    scene.postProcessStages.fxaa.enabled = false;
    scene.camera.position = new Cartesian3(0, -80, 80);
    scene.camera.direction = Cartesian3.normalize(
      new Cartesian3(0, 80, -68),
      new Cartesian3(),
    );
    scene.camera.right = new Cartesian3(1, 0, 0);
    scene.camera.up = Cartesian3.cross(
      scene.camera.right,
      scene.camera.direction,
      new Cartesian3(),
    );
    scene.camera.frustum.near = 1;
    scene.camera.frustum.fov = Math.PI / 4;
    scene.camera.frustum.far = 1000;
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: world.tilingScheme,
      maximumLevel: 0,
    });
  });
  afterEach(function () {
    scene.destroyForSpecs();
  });
  function terrain(raise = 0) {
    return {
      tilingScheme: world.tilingScheme,
      minimumHeight: raise,
      maximumHeight: 24 + raise,
      maximumLevel: 0,
      errorEvent: new Event(),
      getLevelMaximumGeometricError: () => 1,
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
      requestTileGeometry: () =>
        Promise.resolve(
          new SceneGISPlanarHeightmapTerrainData({
            width: 3,
            height: 3,
            buffer: Float32Array.from(
              [0, 12, 24, 0, 12, 24, 0, 12, 24],
              (n) => n + raise,
            ),
          }),
        ),
    };
  }
  function feature(type, parts, id) {
    return {
      type,
      id,
      properties: {},
      geometry: {
        parts: parts.map((p) => new Float64Array(p)),
        polygonStarts: type === 3 ? new Uint32Array([0]) : new Uint32Array(),
      },
    };
  }
  function polygon(id = "area") {
    return feature(3, [[1408, 1408, 2688, 1408, 2688, 2688, 1408, 2688]], id);
  }
  function add(features, layers) {
    spyOn(source, "requestTile").and.resolveTo({
      layers: [{ name: "data", extent: 4096, version: 2, features }],
    });
    return scene.primitives.add(
      new SceneGISVectorTileLayer({
        scene,
        sources: { test: source },
        style: {
          version: 8,
          sources: {
            test: {
              type: "vector",
              tiles: ["https://example.invalid/{z}/{x}/{y}"],
              maxzoom: 0,
            },
          },
          layers: layers.map((l) => ({
            source: "test",
            "source-layer": "data",
            ...l,
          })),
        },
      }),
    );
  }
  async function ready(layer, height = 12) {
    await pollToPromise(function () {
      scene.renderForSpecs();
      return (
        layer.ready &&
        layer.tilesLoaded &&
        Math.abs(
          (world.terrainProvider
            ? (world.getTerrainHeight(Cartesian3.ZERO) ?? -1e6)
            : 0) - height,
        ) < 0.01
      );
    });
    expect(layer.statistics.failedTiles).toBe(0);
    expect(layer._drawOrder.length)
      .withContext(JSON.stringify(layer.statistics))
      .toBeGreaterThan(0);
  }
  function sample(x, y, height) {
    scene.renderForSpecs();
    const point = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(x, y, height),
    );
    return {
      point,
      color: Array.from(
        scene.context.readPixels({
          x: Math.floor(point.x),
          y: scene.canvas.height - 1 - Math.floor(point.y),
          width: 1,
          height: 1,
        }),
      ),
    };
  }
  [false, true].forEach(function (logarithmic) {
    it(`keeps terrain-draped vectors independent of a transparent planar surface (log ${logarithmic})`, async function () {
      scene.logarithmicDepthBuffer = logarithmic;
      world.baseColor = Color.BLUE;
      world.terrainProvider = terrain();
      const layer = add(
        [polygon()],
        [
          {
            id: "red",
            type: "fill",
            paint: { "fill-color": "red", "fill-antialias": false },
          },
        ],
      );
      layer.opacity = 0.5;
      await ready(layer);
      const workers = layer._workers;
      for (const [opacity, blue] of [
        [1, 128],
        [0.5, 64],
        [0, 0],
        [1, 128],
      ]) {
        world.opacity = opacity;
        const result = sample(0, 0, 12);
        expect(result.color).toEqualEpsilon([128, 0, blue, 255], 1);
        expect(scene.pick(result.point)?.id.featureId).toBe("area");
        expect(layer._workers).toBe(workers);
      }
    });
    it(`drapes ordered translucent fills without changing terrain depth (log ${logarithmic})`, async function () {
      scene.logarithmicDepthBuffer = logarithmic;
      if (!logarithmic) {
        scene.farToNearRatio = 2;
      }
      world.terrainProvider = terrain();
      const layer = add(
        [polygon()],
        [
          {
            id: "red",
            type: "fill",
            paint: { "fill-color": "red", "fill-antialias": false },
          },
          {
            id: "blue",
            type: "fill",
            paint: {
              "fill-color": "blue",
              "fill-opacity": 0.5,
              "fill-antialias": false,
            },
          },
        ],
      );
      await ready(layer);
      if (!logarithmic) {
        expect(scene.frameState.frustumSplits.length).toBeGreaterThan(2);
      }
      for (const x of [-20, 0, 20]) {
        const { point, color } = sample(x, 0, 12 + (x * 24) / 256);
        expect(color[0]).toEqualEpsilon(127, 2);
        expect(color[1]).toBe(0);
        expect(color[2]).toEqualEpsilon(128, 2);
        expect(scene.pick(point)?.id.styleLayer).toBe("blue");
      }
      scene.renderForSpecs();
      expect(scene.pickPosition(new Cartesian2(128, 128)).z).toEqualEpsilon(
        12,
        1,
      );
    });
  });

  it("applies a transparent map once to the nearest overlapping terrain across frusta", async function () {
    scene.logarithmicDepthBuffer = false;
    scene.farToNearRatio = 2;
    scene.camera.frustum.fov = 0.12;
    scene.camera.setView({
      destination: new Cartesian3(0, -125, 30),
      orientation: {
        direction: Cartesian3.normalize(
          new Cartesian3(0, 1, -0.08),
          new Cartesian3(),
        ),
        up: Cartesian3.UNIT_Z,
      },
    });
    const provider = terrain();
    provider.maximumHeight = 60;
    provider.requestTileGeometry = () =>
      Promise.resolve(
        new SceneGISPlanarHeightmapTerrainData({
          width: 9,
          height: 9,
          buffer: Float32Array.from(
            { length: 81 },
            (_, i) => 60 * Math.sin((Math.floor(i / 9) * Math.PI) / 2) ** 2,
          ),
        }),
      );
    world.terrainProvider = provider;
    const layer = add(
      [feature(3, [[0, 0, 4096, 0, 4096, 4096, 0, 4096]], "hills")],
      [
        {
          id: "map",
          type: "fill",
          paint: { "fill-color": "red", "fill-antialias": false },
        },
      ],
    );
    layer.opacity = 0.5;
    await ready(layer, 0);
    const opaque = scene.context.readPixels();
    world.opacity = 0;
    scene.renderForSpecs();
    const pixels = scene.context.readPixels();
    let count = 0;
    let maximumError = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (opaque[i] === 128) {
        ++count;
        maximumError = Math.max(maximumError, Math.abs(pixels[i] - 128));
      }
    }
    expect(count).toBeGreaterThan(1000);
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    expect(maximumError).toBeLessThanOrEqual(1);
  });

  it("keeps map coverage continuous across narrow perspective frusta", async function () {
    scene.logarithmicDepthBuffer = false;
    scene.farToNearRatio = 2;
    scene.camera.frustum.fov = 0.2;
    scene.camera.setView({
      destination: new Cartesian3(0, -197, 223),
      orientation: {
        direction: Cartesian3.normalize(
          new Cartesian3(0, 197, -223),
          new Cartesian3(),
        ),
        up: Cartesian3.UNIT_Z,
      },
    });
    world.terrainProvider = terrain();
    world.opacity = 0;
    const layer = add(
      [feature(3, [[0, 0, 4096, 0, 4096, 4096, 0, 4096]], "plane")],
      [
        {
          id: "map",
          type: "fill",
          paint: { "fill-color": "red", "fill-antialias": false },
        },
      ],
    );
    layer.opacity = 0.5;
    await ready(layer);
    const pixels = scene.context.readPixels({
      x: 70,
      y: 100,
      width: 116,
      height: 100,
    });
    let maximumError = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      maximumError = Math.max(maximumError, Math.abs(pixels[i] - 128));
    }
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    expect(maximumError).toBeLessThanOrEqual(1);
  });

  it("keeps transparent map occlusion and pick depth in front of buried objects", async function () {
    scene.camera.setView({
      destination: new Cartesian3(0, 0, 100),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 80,
      aspectRatio: 1,
      near: 1,
      far: 300,
    });
    scene.logarithmicDepthBuffer = false;
    const box = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          id: "box",
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(70, 70, 1),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.LIME),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
          closed: true,
        }),
      }),
    );
    world.baseColor = Color.BLUE;
    world.terrainProvider = terrain();
    world.opacity = 0.5;
    const layer = add(
      [polygon()],
      [
        {
          id: "red",
          type: "fill",
          paint: { "fill-color": "red", "fill-antialias": false },
        },
      ],
    );
    layer.opacity = 0.5;
    await ready(layer);
    let pixel = sample(0, 0, 12);
    expect(pixel.color).toEqualEpsilon([128, 64, 64, 255], 1);
    expect(scene.pick(pixel.point)?.id.featureId).toBe("area");
    scene.camera.setView({
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_X,
      },
    });
    pixel = sample(0, 0, 12);
    expect(pixel.color).toEqualEpsilon([128, 64, 64, 255], 1);
    expect(scene.pick(pixel.point)?.id.featureId).toBe("area");
    scene._view.oit = scene._view.oit.destroy();
    pixel = sample(0, 0, 12);
    expect(scene._environmentState.useOIT).toBeFalse();
    expect(pixel.color).toEqualEpsilon([128, 64, 64, 255], 1);
    box.modelMatrix = Matrix4.fromTranslation(new Cartesian3(0, 0, 35));
    pixel = sample(0, 0, 12);
    expect(pixel.color).toEqualEpsilon([0, 255, 0, 255], 1);
    expect(scene.pick(pixel.point)?.id).toBe("box");
    box.modelMatrix = Matrix4.IDENTITY;
    world.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
    });
    const clipped = sample(-10, 0, 12 - (10 * 24) / 256);
    expect(clipped.color).toEqualEpsilon([0, 255, 0, 255], 1);
    expect(scene.pick(clipped.point)?.id).toBe("box");
    const retained = sample(10, 0, 12 + (10 * 24) / 256);
    expect(retained.color).toEqualEpsilon([128, 64, 64, 255], 1);
    expect(scene.pick(retained.point)?.id.featureId).toBe("area");
  });

  it("keeps transparent terrain and overflowing markers aligned with temporal samples", async function () {
    scene.camera.setView({
      destination: new Cartesian3(128, 0, 100),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 80,
      aspectRatio: 1,
      near: 1,
      far: 300,
    });
    scene.highDynamicRange = true;
    world.terrainProvider = terrain();
    world.opacity = 0;
    const layer = add(
      [feature(1, [[4000, 2048]], "edge")],
      [
        {
          id: "dot",
          type: "circle",
          paint: {
            "circle-color": "blue",
            "circle-opacity": 0.5,
            "circle-radius": 48,
          },
        },
      ],
    );
    await ready(layer);
    const inside = sample(120, 0, 24).color;
    const outside = sample(132, 0, 24).color;
    expect(inside[2]).toBeGreaterThan(80);
    expect(outside).toEqualEpsilon(inside, 1);
    expect(scene.pick(sample(132, 0, 24).point)?.id.featureId).toBe("edge");
    const taa = new SceneGISTemporalAntialiasing({
      scene,
      enabled: true,
      historyWeight: 0,
    });
    for (let i = 0; i < 2; ++i) {
      expect(sample(120, 0, 24).color).toEqualEpsilon(inside, 2);
      expect(sample(132, 0, 24).color).toEqualEpsilon(outside, 2);
    }
    expect(taa.ready).toBeTrue();
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("bounds transparent map resources and submissions and releases mutually exclusive targets", async function () {
    world.terrainProvider = terrain();
    world.opacity = 0;
    scene.farToNearRatio = 2;
    scene.logarithmicDepthBuffer = false;
    const layer = add(
      [polygon()],
      [
        {
          id: "red",
          type: "fill",
          paint: { "fill-color": "red", "fill-antialias": false },
        },
      ],
    );
    await ready(layer);
    const pixel = sample(0, 0, 12);
    const renderer = scene._sceneGISDeferred;
    const state = renderer._planarVectors;
    const depth = state.depth.getDepthStencilTexture();
    const color = state.raw.getColorTexture();
    expect(depth.sizeInBytes).toBe(256 * 256 * 4);
    expect(color.sizeInBytes).toBe(256 * 256 * 8);
    expect(state.depthDrawCount).toBe(world._surface._renderCommands.length);
    expect(state.mapDrawCount).toBe(
      scene._view.frustumCommandsList.reduce(
        (sum, range) => sum + range.indices[Pass.TERRAIN_CLASSIFICATION],
        0,
      ),
    );
    expect(renderer._vectorOverlays).toBeUndefined();
    scene.pick(pixel.point);
    expect(state.depth.getDepthStencilTexture()).toBe(depth);
    expect(state.pickDepthDrawCount).toBe(
      world._surface._renderCommands.length,
    );
    world.opacity = 0.5;
    scene.renderForSpecs();
    expect(state.raw.getColorTexture()).toBe(color);
    world.opacity = 1;
    world.enableLighting = true;
    scene.renderForSpecs();
    expect(renderer._planarVectors).toBeUndefined();
    expect(depth.isDestroyed() && color.isDestroyed()).toBeTrue();
    expect(renderer._vectorOverlays).toBeDefined();
    world.opacity = 0;
    scene.renderForSpecs();
    expect(renderer._vectorOverlays).toBeUndefined();
    const resized = renderer._planarVectors;
    scene.canvas.width = 192;
    scene.canvas.height = 144;
    scene.renderForSpecs();
    expect(resized.byteLength).toBe(192 * 144 * 12);
    const last = resized.depth.getDepthStencilTexture();
    layer.show = false;
    scene.renderForSpecs();
    expect(renderer._planarVectors).toBeUndefined();
    expect(last.isDestroyed()).toBeTrue();
    expect(scene.context._gl.getError()).toBe(0);
  });
  [0, 5, 6].forEach(function (capacity) {
    it(`defers ordered lit fills while keeping an intervening circle unlit (MRT limit ${capacity})`, async function () {
      const limited = capacity > 0;
      const maximum = ContextLimits._maximumDrawBuffers;
      try {
        if (limited) {
          ContextLimits._maximumDrawBuffers = capacity;
        }
        if (capacity === 6) {
          scene.logarithmicDepthBuffer = false;
          scene.farToNearRatio = 2;
        }
        world.terrainProvider = terrain();
        world.enableLighting = true;
        scene.light = new DirectionalLight({
          direction: new Cartesian3(0, 0, -1),
        });
        const layer = add(
          [polygon(), feature(1, [[2048, 2048]], "dot")],
          [
            {
              id: "red",
              type: "fill",
              paint: {
                "fill-color": "red",
                "fill-opacity": 0.5,
                "fill-antialias": false,
              },
            },
            {
              id: "dot",
              type: "circle",
              paint: {
                "circle-color": "blue",
                "circle-opacity": 0.5,
                "circle-radius": 18,
              },
            },
            {
              id: "green",
              type: "fill",
              paint: {
                "fill-color": "#00ff00",
                "fill-opacity": 0.5,
                "fill-antialias": false,
              },
            },
          ],
        );
        await ready(layer);
        const lit = sample(0, 0, 12);
        const renderer = scene._sceneGISDeferred;
        const overlay = renderer._vectorOverlays;
        expect(overlay).toBeDefined();
        if (!overlay) {
          return;
        }
        expect(overlay.combined).toBe(!limited);
        if (limited) {
          expect(overlay.clearDrawCount).toBeGreaterThan(0);
          expect(overlay.clearDrawCount).toBeLessThanOrEqual(
            scene._view.frustumCommandsList.length * 2,
          );
        } else {
          expect(overlay.clearDrawCount).toBe(0);
        }
        const target = new FramebufferManager({
          pixelDatatype: PixelDatatype.FLOAT,
        });
        target.update(scene.context, 1, 1);
        const copy = scene.context.createViewportQuadCommand(
          "uniform sampler2D u_texture; uniform vec2 u_pixel; void main() { out_FragColor = texelFetch(u_texture, ivec2(u_pixel), 0); }",
          {
            framebuffer: target.framebuffer,
            uniformMap: {
              u_texture: () => overlay.raw.getColorTexture(),
              u_pixel: () =>
                new Cartesian2(
                  Math.floor(lit.point.x),
                  255 - Math.floor(lit.point.y),
                ),
            },
          },
        );
        function material() {
          copy.execute(scene.context);
          return Array.from(
            scene.context.readPixels({
              framebuffer: target.framebuffer,
              width: 1,
              height: 1,
            }),
          );
        }
        try {
          const first = material();
          expect(first).toEqualEpsilon([0.125, 0.5, 0, 0.875], 0.003);
          const texture = overlay.raw.getColorTexture();
          const draws = renderer.classificationDrawCount;
          scene.light.direction = new Cartesian3(0, 0, 1);
          const dark = sample(0, 0, 12);
          expect(material()).toEqual(first);
          expect(dark.color[0]).toBeLessThan(lit.color[0]);
          expect(dark.color[1]).toBeLessThan(lit.color[1]);
          expect(dark.color[2]).toEqualEpsilon(lit.color[2], 1);
          expect(dark.color[2]).toEqualEpsilon(64, 2);
          expect(renderer.classificationDrawCount).toBe(draws);
          expect(scene.pick(dark.point)?.id.styleLayer).toBe("green");
          scene.primitives.remove(layer);
          scene.renderForSpecs();
          expect(renderer._vectorOverlays).toBeUndefined();
          expect(texture.isDestroyed()).toBeTrue();
        } finally {
          copy.shaderProgram.destroy();
          target.destroy();
        }
      } finally {
        ContextLimits._maximumDrawBuffers = maximum;
      }
    });
  });
  it("keeps one shared coverage value when adding deferred map lighting", async function () {
    scene.highDynamicRange = true;
    world.terrainProvider = terrain();
    world.enableLighting = true;
    scene.light = new DirectionalLight({ direction: new Cartesian3(0, 0, -1) });
    const layer = add(
      [polygon()],
      [
        {
          id: "red",
          type: "fill",
          paint: {
            "fill-color": "red",
            "fill-opacity": 0.5,
            "fill-antialias": false,
          },
        },
      ],
    );
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 1, 1);
    let texture;
    const copy = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_texture; void main() { out_FragColor = texelFetch(u_texture, ivec2(128, 127), 0); }",
      {
        framebuffer: target.framebuffer,
        uniformMap: { u_texture: () => texture },
      },
    );
    function read(input) {
      texture = input;
      copy.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer: target.framebuffer,
          width: 1,
          height: 1,
        }),
      );
    }
    try {
      await ready(layer);
      const state = ssr._state;
      expect(ssr.ready).toBe(true);
      expect(read(state.main.weights.getColorTexture(0))[3]).toEqualEpsilon(
        1,
        0.001,
      );
      expect(read(state.main.indirect.getColorTexture())[3]).toEqualEpsilon(
        1,
        0.001,
      );
      const radiance = read(state.radianceTexture);
      const color = read(state.main.source.getColorTexture(0));
      expect(radiance[0]).toEqualEpsilon(color[0], 0.002);
      expect(radiance[3]).toEqualEpsilon(1, 0.001);
      const draws = scene._sceneGISDeferred.classificationDrawCount;
      const water = scene.primitives.add(
        new SceneGISWaterSurface({
          polygonHierarchy: new PolygonHierarchy([
            new Cartesian3(-20, -20, 0),
            new Cartesian3(20, -20, 0),
            new Cartesian3(20, 20, 0),
            new Cartesian3(-20, 20, 0),
          ]),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 20)),
          waveAmplitude: 0,
          flowSpeed: 0,
          foamIntensity: 0,
          reflections: false,
        }),
      );
      scene.renderForSpecs();
      expect(water.ready).toBe(true);
      const inputs = scene.frameState._sceneGISWater;
      expect(inputs.colorTexture).toBe(state.radianceTexture);
      expect(inputs.depthTexture).toBe(scene._sceneGISDeferred._linearDepth);
      expect(inputs.captureDraws).toBe(0);
      expect(read(inputs.colorTexture)).toEqualEpsilon(radiance, 0.005);
      expect(scene._sceneGISDeferred.classificationDrawCount).toBe(draws);
      ssr.enabled = false;
      scene.renderForSpecs();
      const ao =
        scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
      expect(inputs.colorTexture).toBe(ao.radianceTexture);
      expect(read(ao.main.indirect.getColorTexture())[3]).toEqualEpsilon(
        1,
        0.001,
      );
      expect(read(inputs.colorTexture)[3]).toEqualEpsilon(1, 0.001);
      expect(inputs.captureDraws).toBe(0);
      expect(scene._sceneGISDeferred.classificationDrawCount).toBe(draws);
    } finally {
      copy.shaderProgram.destroy();
      target.destroy();
      ssr.destroy();
    }
  });
  it("retains elevated tile coverage when the zero plane lies outside the frustum", function () {
    scene.renderForSpecs();
    const frame = scene.frameState;
    frame.cullingVolume = new CullingVolume([new Cartesian4(0, 0, 1, -10)]);
    expect(cover.select(frame, source, 16)).toEqual([]);
    expect(
      cover
        .select(frame, source, 16, Infinity, new Cartesian2(0, 24))
        .map((tile) => tile.key),
    ).toEqual(["0/0/0"]);
  });
  it("keeps holes and analytic strokes on the terrain", async function () {
    world.terrainProvider = terrain();
    const area = polygon();
    area.geometry.parts.push(
      new Float64Array([1920, 1920, 1920, 2176, 2176, 2176, 2176, 1920]),
    );
    const line = feature(2, [[1408, 2048, 2688, 2048]], "road");
    const layer = add(
      [area, line],
      [
        {
          id: "land",
          type: "fill",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "red" },
        },
        {
          id: "road",
          type: "line",
          filter: ["==", ["geometry-type"], "LineString"],
          paint: { "line-color": "blue", "line-width": 5 },
        },
      ],
    );
    await ready(layer);
    const road = sample(0, 0, 12);
    expect(road.color[2]).toBeGreaterThan(240);
    expect(scene.pick(road.point)?.id.featureId).toBe("road");
    expect(sample(0, 5, 12).color).toEqual([0, 0, 0, 255]);
    expect(sample(20, 15, 12 + (20 * 24) / 256).color[0]).toBe(255);
  });
  it("reuses ground geometry across providers and releases it when returning to flat", async function () {
    world.terrainProvider = terrain();
    const layer = add(
      [polygon()],
      [
        {
          id: "land",
          type: "fill",
          paint: { "fill-color": "red", "fill-antialias": false },
        },
      ],
    );
    await ready(layer);
    const batch = layer._drawOrder[0];
    const resources = batch._resources;
    const textures = resources._textures.slice();
    expect(batch._anchorTerrain).toBeUndefined();
    const workers = layer._workers;
    world.terrainProvider = terrain(10);
    await ready(layer, 22);
    expect(layer._drawOrder[0]._resources).toBe(resources);
    expect(sample(0, 0, 22).color).toEqual([255, 0, 0, 255]);
    world.terrainProvider = undefined;
    await ready(layer, 0);
    expect(resources.isDestroyed()).toBeTrue();
    expect(textures.every((t) => t.isDestroyed())).toBeTrue();
    expect(resources._textures.length).toBe(0);
    expect(Object.keys(resources.uniformMap).length).toBe(0);
    expect(layer._workers).toBe(workers);
    expect(source.requestTile.calls.count()).toBe(1);
    expect(sample(0, 0, 0).color).toEqual([255, 0, 0, 255]);
  });

  it("anchors viewport circles on the published terrain and updates only their height stream", async function () {
    world.terrainProvider = terrain();
    const layer = add(
      [feature(1, [[2048, 2048]], "point")],
      [
        {
          id: "circle",
          type: "circle",
          paint: { "circle-color": "blue", "circle-radius": 8 },
        },
      ],
    );
    await ready(layer);
    let center = sample(0, 0, 12);
    expect(center.color).toEqual([0, 0, 255, 255]);
    expect(scene.pick(center.point)?.id.featureId).toBe("point");
    const resources = layer._drawOrder[0]._resources;
    world.terrainProvider = terrain(10);
    await ready(layer, 22);
    scene.renderForSpecs();
    center = sample(0, 0, 22);
    expect(center.color).toEqual([0, 0, 255, 255]);
    expect(scene.pick(center.point)?.id.featureId).toBe("point");
    expect(layer._drawOrder[0]._resources).toBe(resources);
    const batch = layer._drawOrder[0];
    expect(batch._anchorTerrain).toBeDefined();
    scene.primitives.remove(layer);
    expect(layer._terrain).toBeUndefined();
    expect(layer._groundRanges).toBeUndefined();
    expect(batch._anchorTerrain).toBeUndefined();
    expect(resources._anchorBuffers.length).toBe(0);
  });

  it("keeps dashed feature identities independent from the dash table dimensions", async function () {
    world.terrainProvider = terrain();
    const features = [-20, 0, 20].map((y, i) =>
      feature(2, [[1408, 2048 - y * 16, 2688, 2048 - y * 16]], `${i}`),
    );
    const layer = add(features, [
      {
        id: "roads",
        type: "line",
        paint: {
          "line-color": "blue",
          "line-width": 6,
          "line-dasharray": [2, 2],
        },
      },
    ]);
    await ready(layer);
    for (const [i, y] of [-20, 0, 20].entries()) {
      let hit;
      for (let x = -20; x <= 20; x++) {
        const pixel = sample(x, y, 12 + (x * 24) / 256);
        if (pixel.color[2] > 240) {
          hit = scene.pick(pixel.point);
          break;
        }
      }
      expect(hit?.id.featureId).toBe(`${i}`);
    }
  });
});
