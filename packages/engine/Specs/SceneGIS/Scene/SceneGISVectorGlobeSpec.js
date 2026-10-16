import {
  Cartesian2,
  Color,
  Globe,
  Matrix4,
  HeadingPitchRange,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
  SceneGISPlanarTilingScheme,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  CustomHeightmapTerrainProvider,
  EllipsoidTerrainProvider,
  SceneTransforms,
  Cartesian3,
  GeographicTilingScheme,
  GridImageryProvider,
  SceneMode,
  BoxGeometry,
  Primitive,
  GeometryInstance,
  PerInstanceColorAppearance,
  ColorGeometryInstanceAttribute,
  Transforms,
  IntersectionTests,
  Ray,
  Resource,
  Pass,
  DirectionalLight,
  FramebufferManager,
  PixelDatatype,
} from "../../../index.js";
import { encodeGlyphs } from "../Core/vectorSymbolFixture.js";
import DrawCommand from "../../../Source/Renderer/DrawCommand.js";
import Coordinates from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorGlobeCoordinates.js";
import Cover from "../../../Source/SceneGIS/Scene/_private/_SceneGISVectorGlobeCover.js";
import Terrain from "../../../Source/SceneGIS/Scene/_private/_SceneGISVectorGlobeTerrain.js";
import SourceEllipsoidTerrainProvider from "../../../Source/Core/EllipsoidTerrainProvider.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISVectorGlobe", function () {
  let scene, globe, scheme, source, target;
  function feature(type, parts, id = "area") {
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
  function frame(
    longitude = 13.4,
    latitude = 52.5,
    range = 500,
    height = 0,
    level = 14,
  ) {
    const n = 2 ** level;
    const x = Math.floor(((longitude + 180) / 360) * n);
    const y = Math.floor(
      (1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) *
        0.5 *
        n,
    );
    const bounds = scheme.tileXYToExtent(x, y, level);
    target = {
      x: bounds.minimumX + bounds.width * 0.5,
      y: bounds.minimumY + bounds.height * 0.5,
    };
    scene.camera.lookAt(
      Coordinates.position(target.x, target.y, height),
      new HeadingPitchRange(0.3, -Math.PI / 3, range),
    );
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
  }
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(256, 256) });
    scene.globe = globe = new Globe();
    globe.baseColor = Color.BLACK;
    globe.showGroundAtmosphere = false;
    globe.maximumScreenSpaceError = 8;
    scene.fog.enabled = false;
    scene.msaaSamples = 1;
    scene.postProcessStages.fxaa.enabled = false;
    // Isolate coverage and alpha in a linear, environment-free fixture.
    scene.environmentEffects.enabled = false;
    scene.gamma = 1;
    scheme = new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        crs: "EPSG:3857",
        extent: new SceneGISPlanarExtent({
          minimumX: -Coordinates.halfWidth,
          minimumY: -Coordinates.halfWidth,
          maximumX: Coordinates.halfWidth,
          maximumY: Coordinates.halfWidth,
        }),
      }),
    });
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: scheme,
      minimumLevel: 14,
      maximumLevel: 14,
    });
    frame();
  });
  afterEach(function () {
    scene.destroyForSpecs();
  });
  function add(features, layers, styleExtras = {}) {
    spyOn(source, "requestTile").and.resolveTo({
      layers: [{ name: "data", version: 2, extent: 4096, features }],
    });
    return scene.primitives.add(
      new SceneGISVectorTileLayer({
        scene,
        tilingScheme: scheme,
        sources: { test: source },
        style: {
          version: 8,
          ...styleExtras,
          sources: {
            test: {
              type: "vector",
              tiles: ["https://example.invalid/{z}/{x}/{y}"],
              minzoom: source.minimumLevel,
              maxzoom: source.maximumLevel,
            },
          },
          layers: layers.map((layer) => ({
            source: "test",
            "source-layer": "data",
            ...layer,
          })),
        },
      }),
    );
  }
  async function ready(layer) {
    const errors = [];
    layer.errorEvent.addEventListener((e) => errors.push(e.error.message));
    await pollToPromise(
      () => {
        scene.renderForSpecs();
        return (
          (layer.ready && layer.tilesLoaded && globe.tilesLoaded) ||
          errors.length > 0
        );
      },
      { timeout: 20000 },
    );
    expect(errors).toEqual([]);
    expect(layer.statistics.failedTiles).toBe(0);
    scene.renderForSpecs();
  }
  function sample(
    height = globe.getHeight(Coordinates.cartographic(target.x, target.y)) ?? 0,
  ) {
    const point = SceneTransforms.worldToWindowCoordinates(
      scene,
      Coordinates.position(target.x, target.y, height),
    );
    return {
      point,
      color: Array.from(
        scene.context.readPixels({
          x: Math.floor(point.x),
          y: 255 - Math.floor(point.y),
          width: 1,
          height: 1,
        }),
      ),
    };
  }
  [0, 100].forEach(function (height) {
    it(`bounds near ground stroke width and preserves far foreshortening at height ${height}`, async function () {
      if (height) {
        globe.terrainProvider = new CustomHeightmapTerrainProvider({
          width: 16,
          height: 16,
          callback: () => new Float32Array(256).fill(height),
        });
      }
      scene.camera.lookAt(
        Coordinates.position(target.x, target.y, height),
        new HeadingPitchRange(0, height ? -Math.PI / 3 : -Math.PI / 6, 1000),
      );
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
      scene.camera.frustum.fov = Math.PI / 4;
      const layer = add(
        [feature(2, [[2048, -4096, 2048, 8192]], "road")],
        [
          {
            id: "road",
            type: "line",
            paint: { "line-color": "red", "line-width": 16 },
          },
        ],
      );
      await ready(layer);
      const pixels = scene.context.readPixels({ width: 256, height: 256 });
      const widths = [56, 128, 232].map((y) => {
        let width = 0;
        for (let x = 112; x < 144; ++x) {
          if (pixels[(y * 256 + x) * 4] > 127) {
            ++width;
          }
        }
        return width;
      });
      expect(widths[0]).toBeGreaterThanOrEqual(15);
      expect(widths[0]).toBeLessThanOrEqual(17);
      expect(widths[1]).toBeGreaterThanOrEqual(15);
      expect(widths[1]).toBeLessThanOrEqual(17);
      expect(widths[2]).toBeGreaterThan(0);
      expect(widths[2]).toBeLessThan(widths[1]);
      expect(scene.pick(new Cartesian2(128, 200), 1, 1)?.id.featureId).toBe(
        "road",
      );
      expect(scene.pick(new Cartesian2(138, 200), 1, 1)).toBeUndefined();
    });
  });
  it("dynamic rules update Globe drawing and picking without replacing the layer or sources", async function () {
    const layer = add(
      [feature(3, [[1400, 1400, 2700, 1400, 2700, 2700, 1400, 2700]])],
      [
        {
          id: "area",
          type: "fill",
          paint: { "fill-color": "red", "fill-antialias": false },
        },
      ],
    );
    await ready(layer);
    const count = source.requestTile.calls.count(),
      pool = layer._workers;
    expect(sample().color).toEqual([255, 0, 0, 255]);
    layer.setPaintProperty("area", "fill-color", "lime");
    await ready(layer);
    expect(sample().color).toEqual([0, 255, 0, 255]);
    expect(scene.pick(sample().point)?.primitive).toBe(layer);
    layer.setLayoutProperty("area", "visibility", "none");
    await ready(layer);
    expect(scene.pick(sample().point)).toBeUndefined();
    layer.setLayoutProperty("area", "visibility", null);
    layer.setFilter("area", ["==", ["id"], "missing"]);
    await ready(layer);
    expect(scene.pick(sample().point)).toBeUndefined();
    layer.setFilter("area", null);
    await ready(layer);
    expect(scene.pick(sample().point)?.primitive).toBe(layer);
    expect(layer._sources.get("test").source).toBe(source);
    expect(layer._workers).toBe(pool);
    expect(source.requestTile.calls.count()).toBe(count);
  });

  it("places variable anchors with fitted icons and picks their shifted glyphs on the Globe without new shaping during motion", async function () {
    const fonts = spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      encodeGlyphs(),
    );
    const image = createCanvas(16, 16);
    const context = image.getContext("2d");
    context.fillStyle = "lime";
    context.fillRect(0, 0, 16, 16);
    spyOn(Resource.prototype, "fetchImage").and.resolveTo(image);
    spyOn(Resource.prototype, "fetchJson").and.resolveTo({
      shield: {
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        pixelRatio: 1,
        content: [4, 4, 12, 12],
        stretchX: [[4, 12]],
        stretchY: [[4, 12]],
      },
    });
    const layer = add(
      [feature(1, [[2048, 2048]], "a"), feature(1, [[2048, 2048]], "b")],
      [
        {
          id: "labels",
          type: "symbol",
          layout: {
            "text-field": "A",
            "text-font": ["Test"],
            "text-size": 24,
            "text-variable-anchor": ["left", "right"],
            "text-radial-offset": 0.7,
            "icon-image": "shield",
            "icon-text-fit": "both",
            "icon-text-fit-padding": [2, 3, 2, 3],
          },
          paint: { "text-color": "red" },
        },
      ],
      {
        glyphs: "https://example.invalid/{fontstack}/{range}.pbf",
        sprite: "https://example.invalid/sprite",
      },
    );
    await ready(layer);
    const placed = layer._symbols._placed.filter((c) => c.placed?.text);
    expect(placed.map((c) => c.variableAnchor)).toEqual(["left", "right"]);
    for (const candidate of placed) {
      expect(candidate.shaped.icon.quads.length).toBe(9);
      expect(candidate.shaped.icon).toBe(
        candidate.shaped.icons.get(candidate.variableAnchor),
      );
      const corners = candidate.projected.text.quads[0].corners;
      const point = new Cartesian2(
        candidate.screen.x + corners.reduce((s, p) => s + p[0], 0) / 4,
        candidate.screen.y + corners.reduce((s, p) => s + p[1], 0) / 4,
      );
      expect(scene.pick(point)?.id.featureId).toBe(
        candidate.identity.featureId,
      );
    }
    const tasks = layer.statistics.workerTasks;
    scene.camera.moveRight(1);
    await ready(layer);
    expect(
      layer._symbols._placed
        .filter((c) => c.placed?.text)
        .map((c) => c.variableAnchor),
    ).toEqual(["left", "right"]);
    expect(layer.statistics.workerTasks).toBe(tasks);
    expect(fonts).toHaveBeenCalledTimes(1);
    image.remove();
  });
  [false, true].forEach((logarithmic) => {
    it(`drapes and picks ordered translucent fills on the native ellipsoid (log ${logarithmic})`, async function () {
      scene.logarithmicDepthBuffer = logarithmic;
      if (!logarithmic) {
        scene.farToNearRatio = 2;
      }
      const layer = add(
        [feature(3, [[1408, 1408, 2688, 1408, 2688, 2688, 1408, 2688]])],
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
      const pixel = sample();
      expect(pixel.color[0]).toEqualEpsilon(127, 2);
      expect(pixel.color[1]).toBe(0);
      expect(pixel.color[2]).toEqualEpsilon(128, 2);
      expect(scene.pick(pixel.point)?.id.styleLayer).toBe("blue");
      scene.renderForSpecs();
      const position = scene.pickPosition(new Cartesian2(128, 128));
      expect(position).toBeDefined();
      expect(
        globe.ellipsoid.cartesianToCartographic(position).height,
      ).toEqualEpsilon(0, 2);
      expect(scene.globe).toBe(globe);
      const batches = [...layer._sources.values()].flatMap((state) =>
        [...state.render.keys()].flatMap((entry) =>
          [...entry.batches.values()].flat(),
        ),
      );
      const sources = new Set(batches.flatMap((batch) => batch.commands));
      const clone = spyOn(DrawCommand, "shallowClone").and.callThrough();
      scene.renderForSpecs();
      scene.renderForSpecs();
      expect(
        clone.calls.allArgs().filter(([command]) => sources.has(command))
          .length,
      ).toBe(0);
      const resources = batches[0]._resources;
      expect(resources._textures.length).toBe(2);
      const va = resources._vertexArrays[0];
      expect(
        batches.every((batch) => batch._resources._vertexArrays[0] === va),
      ).toBe(true);
      const vertices = va.getAttribute(0).vertexBuffer;
      const indices = va.indexBuffer;
      expect(vertices.sizeInBytes).toBe(8 * 4);
      expect(indices.sizeInBytes).toBe(36 * 2);
      scene.primitives.remove(layer);
      expect(vertices.isDestroyed()).toBe(true);
      expect(indices.isDestroyed()).toBe(true);
      expect(layer._groundGeometry.size).toBe(0);
    });
  });

  it("rejects ellipsoid-hidden geographic tiles while retaining ray-visible horizon coverage", function () {
    frame(118.8, 32.1, 12000);
    scene.camera.lookAt(
      Coordinates.position(target.x, target.y),
      new HeadingPitchRange(0, -0.13, 12000),
    );
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.renderForSpecs();
    const owner = {
      _maximumVisibleTiles: 64,
      _globeSelectionHeights: new Cartesian2(-1, 1),
    };
    const tiles = Cover.select(owner, scene.frameState, {
      tilingScheme: scheme,
      minimumLevel: 7,
      maximumLevel: 7,
    });
    const keys = new Set(tiles.map((tile) => tile.key));
    // These northern tiles are hundreds of kilometres beyond the 1.5 km camera horizon.
    expect(keys.has("7/105/48")).toBe(false);
    expect(keys.has("7/104/49")).toBe(false);
    let checked = 0;
    for (const y of [132, 160, 200, 240]) {
      for (const x of [16, 64, 128, 192, 240]) {
        const ray = scene.camera.getPickRay(new Cartesian2(x, y));
        const hit = IntersectionTests.rayEllipsoid(ray, globe.ellipsoid);
        if (!hit) {
          continue;
        }
        const ll = globe.ellipsoid.cartesianToCartographic(
          Ray.getPoint(ray, hit.start),
        );
        const tx = Math.floor((ll.longitude / Math.PI + 1) * 64);
        const ty = Math.floor(
          (1 - Math.asinh(Math.tan(ll.latitude)) / Math.PI) * 64,
        );
        expect(keys.has(`7/${tx}/${ty}`)).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("keeps fractional style zoom stable around a fixed Globe target", function () {
    frame(118.8, 32.1);
    const center = Coordinates.position(target.x, target.y);
    const zooms = [];
    for (const heading of [0, 0.05, 0.1, 0.15, 0.2]) {
      scene.camera.lookAt(center, new HeadingPitchRange(heading, -0.13, 12000));
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
      scene.renderForSpecs();
      zooms.push(Cover.computeZoom({}, scene.frameState));
    }
    expect(Number.isInteger(zooms[0])).toBe(false);
    expect(new Set(zooms).size).toBe(1);
    scene.camera.lookAt(center, new HeadingPitchRange(0.2, -0.13, 11990));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.renderForSpecs();
    expect(Cover.computeZoom({}, scene.frameState)).toBeGreaterThan(zooms[0]);
  });
  it("uses surface distance instead of the near plane when looking above the horizon", function () {
    const layer = {};
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(118.74, 32.02, 23.5),
      orientation: { heading: 0, pitch: 0.00858, roll: 0 },
    });
    const zooms = [];
    for (const near of [0.1, 1, 10]) {
      scene.camera.frustum.near = near;
      scene.renderForSpecs();
      zooms.push(Cover.computeZoom(layer, scene.frameState));
      expect(layer._referenceDepth).toEqualEpsilon(23.5, 1e-7);
      expect(zooms.at(-1)).toBeGreaterThan(0);
      expect(zooms.at(-1)).toBeLessThan(24);
    }
    expect(new Set(zooms).size).toBe(1);
  });
  [0, 32.1, 75].forEach((latitude) => {
    it(`keeps style scale continuous across the ellipsoid horizon at latitude ${latitude}`, function () {
      const layer = {};
      const camera = scene.camera;
      const position = Cartesian3.fromDegrees(118.8, latitude, 23.5);
      function view(pitch) {
        camera.setView({
          destination: position,
          orientation: { heading: 0.7, pitch, roll: 0 },
        });
      }
      function intersects(pitch) {
        view(pitch);
        return IntersectionTests.rayEllipsoid(
          new Ray(camera.positionWC, camera.directionWC),
          globe.ellipsoid,
        );
      }
      let low = -0.1;
      let high = 0;
      for (let i = 0; i < 40; i++) {
        const middle = (low + high) * 0.5;
        if (intersects(middle)) {
          low = middle;
        } else {
          high = middle;
        }
      }
      expect(intersects(low - 1e-9)).toBeDefined();
      expect(intersects(high + 1e-9)).toBeUndefined();
      for (const boundary of [(low + high) * 0.5, 0]) {
        const samples = [];
        for (const offset of [-1e-9, 1e-9]) {
          view(boundary + offset);
          scene.renderForSpecs();
          const zoom = Cover.computeZoom(layer, scene.frameState);
          samples.push({ zoom, depth: layer._referenceDepth });
          expect(Number.isFinite(zoom)).toBeTrue();
          expect(zoom).toBeLessThan(24);
          expect(layer._referenceDepth).toBeGreaterThan(23);
        }
        expect(Math.abs(samples[0].zoom - samples[1].zoom)).toBeLessThan(0.01);
        expect(Math.abs(samples[0].depth / samples[1].depth - 1)).toBeLessThan(
          0.01,
        );
      }
    });
  });
  it("renders and picks visible ground below a sky-facing axis while honoring style zoom ranges", async function () {
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: scheme,
      maximumLevel: 14,
    });
    scene.camera.lookAt(
      Coordinates.position(target.x, target.y),
      new HeadingPitchRange(0, -0.23, 100),
    );
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.camera.setView({
      destination: Cartesian3.clone(scene.camera.positionWC),
      orientation: { heading: scene.camera.heading, pitch: 0.00858, roll: 0 },
    });
    scene.camera.frustum.near = 0.1;
    const layer = add(
      [
        feature(3, [[0, 0, 4096, 0, 4096, 4096, 0, 4096]]),
        feature(2, [[2048, 1300, 2048, 2800]], "road"),
      ],
      [
        {
          id: "land",
          type: "fill",
          paint: { "fill-color": "red", "fill-antialias": false },
        },
        {
          id: "hidden-minzoom",
          type: "fill",
          minzoom: 24,
          paint: { "fill-color": "green" },
        },
        {
          id: "hidden-maxzoom",
          type: "fill",
          maxzoom: 1,
          paint: { "fill-color": "green" },
        },
        {
          id: "road",
          type: "line",
          filter: ["==", ["geometry-type"], "LineString"],
          paint: { "line-color": "blue", "line-width": 16 },
        },
      ],
    );
    await ready(layer);
    const pixel = sample();
    expect(pixel.point.y).toBeGreaterThan(128);
    expect(pixel.point.y).toBeLessThan(256);
    expect(pixel.color[2]).toBeGreaterThan(230);
    expect(scene.pick(pixel.point)?.id.styleLayer).toBe("road");
    const beside = new Cartesian2(pixel.point.x + 15, pixel.point.y);
    expect(scene.pick(beside)?.id.styleLayer).toBe("land");
    expect(layer.statistics.drawCommands).toBeGreaterThan(0);
  });
  [
    [179.999, 75],
    [-179.999, -60],
    [13.4, 52.5, 600],
  ].forEach(([longitude, latitude, height = 0]) => {
    it(`preserves source holes and line picking at ${longitude}, ${latitude}`, async function () {
      const provider = height
        ? new CustomHeightmapTerrainProvider({
            width: 17,
            height: 17,
            callback: () => new Float32Array(17 * 17).fill(height),
          })
        : undefined;
      if (provider) {
        globe.terrainProvider = provider;
      }
      frame(longitude, latitude, 500, height);
      const polygon = feature(3, [
        [0, 0, 4096, 0, 4096, 4096, 0, 4096],
        [1500, 1500, 1500, 2600, 2600, 2600, 2600, 1500],
      ]);
      polygon.properties.color = "red";
      const road = feature(2, [[1300, 2048, 2800, 2048]], "road");
      road.properties.color = "blue";
      const layer = add(
        [polygon, road],
        [
          {
            id: "land",
            type: "fill",
            paint: {
              "fill-color": height ? ["get", "color"] : "red",
              "fill-antialias": false,
            },
          },
          {
            id: "road",
            type: "line",
            filter: ["==", ["geometry-type"], "LineString"],
            paint: {
              "line-color": height ? ["get", "color"] : "blue",
              "line-width": 8,
            },
          },
        ],
      );
      await ready(layer);
      const pixel = sample();
      expect(pixel.color[2]).toBeGreaterThan(230);
      expect(scene.pick(pixel.point)?.id.featureId).toBe("road");
      scene.renderForSpecs();
      const offset = new Cartesian2(pixel.point.x, pixel.point.y + 20);
      expect(scene.pick(offset)).toBeUndefined();
      expect(layer.statistics.visibleTiles).toBeLessThanOrEqual(64);
      if (provider) {
        const resources = layer._drawOrder.find(
          (batch) => batch._resources?._paintPrefix === "line",
        )._resources;
        const program = resources._terrainShaderProgram;
        expect(program).toBeDefined();
        globe.terrainProvider = new EllipsoidTerrainProvider();
        frame(longitude, latitude);
        await ready(layer);
        expect(scene.pick(sample().point)?.id.featureId).toBe("road");
        expect(
          layer._drawOrder.some((batch) => batch._resources === resources),
        ).toBe(true);
        globe.terrainProvider = provider;
        frame(longitude, latitude, 500, height);
        await ready(layer);
        expect(resources._terrainShaderProgram).toBe(program);
        expect(scene.pick(sample().point)?.id.featureId).toBe("road");
      }
    });
  });
  it("subdivides curved continental coverage and preserves the ellipsoid depth", async function () {
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: scheme,
      minimumLevel: 2,
      maximumLevel: 2,
    });
    frame(20, 40, 3000000, 0, 2);
    const layer = add(
      [feature(3, [[0, 0, 4096, 0, 4096, 4096, 0, 4096]])],
      [
        {
          id: "land",
          type: "fill",
          paint: { "fill-color": "red", "fill-antialias": false },
        },
      ],
    );
    await ready(layer);
    expect(sample().color[0]).toBe(255);
    expect(
      layer._drawOrder.some((b) => b._resources.instanceCount > 2),
    ).toBeTrue();
    expect(scene.pick(sample().point)?.id.styleLayer).toBe("land");
  });
  it("uses a bounded mixed cover when the camera axis crosses the horizon", function () {
    const layer = {
      _maximumVisibleTiles: 32,
      _globeSelectionHeights: new Cartesian2(-1, 1),
    };
    const flexible = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: scheme,
      maximumLevel: 16,
    });
    scene.camera.lookAt(
      Coordinates.position(target.x, target.y),
      new HeadingPitchRange(0, -0.02, 100000),
    );
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.initializeFrame();
    scene.renderForSpecs();
    const zoom = Cover.computeZoom(layer, scene.frameState);
    const cover = Cover.select(layer, scene.frameState, flexible);
    expect(Number.isFinite(zoom)).toBeTrue();
    expect(cover.length).toBeGreaterThan(0);
    expect(cover.length).toBeLessThanOrEqual(32);
    expect(new Set(cover.map((t) => t.level)).size).toBeGreaterThan(1);
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(20, 30, 20000000),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    scene.renderForSpecs();
    const far = Cover.select(layer, scene.frameState, flexible);
    expect(Math.max(...far.map((t) => t.level))).toBeLessThan(6);
  });
  [false, true].forEach((logarithmic) => {
    it(`preserves uniform translucent fill coverage on native terrain (log ${logarithmic})`, async function () {
      scene.logarithmicDepthBuffer = logarithmic;
      scene.farToNearRatio = 2;
      globe.terrainProvider = new CustomHeightmapTerrainProvider({
        width: 16,
        height: 16,
        callback: () => new Float32Array(256).fill(35),
      });
      globe.translucency.enabled = true;
      globe.translucency.frontFaceAlpha = 0;
      globe.translucency.backFaceAlpha = 0;
      const layer = add(
        [feature(3, [[0, 0, 4096, 0, 4096, 4096, 0, 4096]])],
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
      await ready(layer);
      scene.renderForSpecs();
      const pixels = scene.context.readPixels({
        x: 96,
        y: 96,
        width: 64,
        height: 64,
      });
      const incorrect = [];
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i] - 128) > 1) {
          incorrect.push({
            x: 96 + ((i / 4) % 64),
            y: 96 + Math.floor(i / 256),
            red: pixels[i],
          });
        }
      }
      expect(incorrect).toEqual([]);
    });
  });
  it("closes transparent native tile seams only in the borrowed surface depth", async function () {
    scene.canvas.width = 1280;
    scene.canvas.height = 800;
    scene.camera.frustum.aspectRatio = 1.6;
    scene.camera.frustum.near = 1;
    globe.maximumScreenSpaceError = 8;
    const bounds = scheme.tileXYToExtent(8801, 5373, 14);
    target = {
      x: bounds.minimumX + bounds.width * 0.5,
      y: bounds.minimumY + bounds.height * 0.5,
    };
    const latitude = Coordinates.cartographic(target.x, target.y).latitude;
    const scale = Math.cos(latitude);
    scene.camera.lookAt(
      Coordinates.position(target.x, target.y),
      new HeadingPitchRange(0, -0.85, 1050 * scale),
    );
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    globe.terrainProvider = new CustomHeightmapTerrainProvider({
      width: 16,
      height: 16,
      callback: () => new Float32Array(256).fill(35 * scale),
    });
    globe.translucency.enabled = true;
    globe.translucency.frontFaceAlpha = 0;
    globe.translucency.backFaceAlpha = 0;
    const layer = add(
      [feature(3, [[0, 0, 4096, 0, 4096, 4096, 0, 4096]])],
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
    source.requestTile.and.callFake((x, y) =>
      Promise.resolve({
        layers: [
          {
            name: "data",
            version: 2,
            extent: 4096,
            features:
              x === 8801 && y === 5373
                ? [feature(3, [[0, 0, 4096, 0, 4096, 4096, 0, 4096]])]
                : [],
          },
        ],
      }),
    );
    await ready(layer);
    const draw = spyOn(scene.context, "draw").and.callThrough();
    function capture() {
      draw.calls.reset();
      scene.renderForSpecs();
      const pixels = scene.context.readPixels({
        x: 415,
        y: 315,
        width: 135,
        height: 200,
      });
      let missing = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i] - 128) > 1) {
          missing++;
        }
      }
      const depths = draw.calls
        .allArgs()
        .map((args) => args[0])
        .filter(
          (command) =>
            command.pass === Pass.GLOBE &&
            command.renderState.colorMask.red === false,
        );
      return {
        missing,
        draws: depths.length,
        indices: depths.reduce((sum, command) => sum + command.count, 0),
      };
    }
    const closed = capture();
    expect(closed.missing).toBe(0);
    globe.showSkirts = false;
    const open = capture();
    // The public opt-out retains native holes; closure adds indices, not draws.
    expect(open.missing).toBeGreaterThan(0);
    expect(open.draws).toBe(closed.draws);
    expect(open.indices).toBeLessThan(closed.indices);
    globe.showSkirts = true;
    expect(capture().missing).toBe(0);
    layer.show = false;
    expect(capture().draws).toBe(0);
  });
  it("defers lit background styles and preserves their transparent surface path", async function () {
    globe.enableLighting = true;
    const normal = Cartesian3.normalize(
      Coordinates.position(target.x, target.y),
      new Cartesian3(),
    );
    scene.light = new DirectionalLight({
      direction: Cartesian3.negate(normal, new Cartesian3()),
    });
    const layer = scene.primitives.add(
      new SceneGISVectorTileLayer({
        scene,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: {
                "background-color": "red",
                "background-opacity": 0.5,
              },
            },
          ],
        },
      }),
    );
    await ready(layer);
    const renderer = scene._sceneGISDeferred;
    expect(renderer._vectorOverlays).toBeDefined();
    if (!renderer._vectorOverlays) {
      return;
    }
    const targetBuffer = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    targetBuffer.update(scene.context, 1, 1);
    const materialTexture = renderer._vectorOverlays.raw.getColorTexture();
    const copy = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_texture; void main() { out_FragColor = texelFetch(u_texture, ivec2(128), 0); }",
      {
        framebuffer: targetBuffer.framebuffer,
        uniformMap: { u_texture: () => materialTexture },
      },
    );
    function material() {
      copy.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer: targetBuffer.framebuffer,
          width: 1,
          height: 1,
        }),
      );
    }
    try {
      expect(material()).toEqualEpsilon([0.5, 0, 0, 0.5], 0.002);
      const bright = sample().color;
      scene.light.direction = normal;
      scene.renderForSpecs();
      const dark = sample().color;
      expect(dark[0]).toBeLessThan(bright[0]);
      expect(material()).toEqualEpsilon([0.5, 0, 0, 0.5], 0.002);
      globe.translucency.enabled = true;
      globe.translucency.frontFaceAlpha = 0;
      globe.translucency.backFaceAlpha = 0;
      scene.renderForSpecs();
      const transparent = sample().color;
      expect(renderer._vectorOverlays).toBeUndefined();
      expect(materialTexture.isDestroyed()).toBe(true);
      expect(transparent[0]).toEqualEpsilon(dark[0], 2);
    } finally {
      copy.shaderProgram.destroy();
      targetBuffer.destroy();
    }
  });
  it("rejects a terrain matrix and non-3D scene before requesting", function () {
    const style = { version: 8, sources: {}, layers: [] };
    expect(
      () =>
        new SceneGISVectorTileLayer({
          scene,
          style,
          tilingScheme: new GeographicTilingScheme(),
        }),
    ).toThrowDeveloperError();
    scene._mode = SceneMode.SCENE2D;
    expect(
      () => new SceneGISVectorTileLayer({ scene, style }),
    ).toThrowDeveloperError();
    scene._mode = SceneMode.SCENE3D;
  });
  [false, true].forEach((logarithmic) => {
    it(`keeps direct vector alpha independent of transparent terrain (log ${logarithmic})`, async function () {
      scene.logarithmicDepthBuffer = logarithmic;
      if (!logarithmic) {
        scene.farToNearRatio = 2;
      }
      globe.baseColor = Color.BLUE;
      globe.translucency.enabled = true;
      globe.translucency.frontFaceAlpha = 0;
      globe.translucency.backFaceAlpha = 0;
      const layer = add(
        [feature(3, [[0, 0, 4096, 0, 4096, 4096, 0, 4096]])],
        [
          {
            id: "red",
            type: "fill",
            paint: { "fill-color": "red", "fill-antialias": false },
          },
        ],
      );
      await ready(layer);
      expect(sample().color.slice(0, 3)).toEqual([255, 0, 0]);
      expect(scene.pick(sample().point)?.id.styleLayer).toBe("red");
      const workers = layer._workers;
      const commands = layer._drawOrder.flatMap(
        (batch) => batch.renderCommands,
      );
      const arrays = commands.map((command) => command.vertexArray);
      const shaders = commands.map((command) => command.shaderProgram);
      layer.opacity = 0.5;
      scene.renderForSpecs();
      const current = layer._drawOrder.flatMap((batch) => batch.renderCommands);
      expect(current).toEqual(commands);
      expect(current.map((command) => command.vertexArray)).toEqual(arrays);
      expect(current.map((command) => command.shaderProgram)).toEqual(shaders);
      expect(sample().color[0]).toEqualEpsilon(128, 2);
      expect(sample().color[2]).toEqualEpsilon(0, 2);
      globe.translucency.frontFaceAlpha = 0.5;
      scene.renderForSpecs();
      expect(sample().color[0]).toEqualEpsilon(128, 2);
      expect(sample().color[2]).toEqualEpsilon(64, 2);
      globe.translucency.enabled = false;
      scene.renderForSpecs();
      expect(sample().color[0]).toEqualEpsilon(128, 2);
      expect(sample().color[2]).toEqualEpsilon(128, 2);
      expect(layer._workers).toBe(workers);
      layer.opacity = 0;
      scene.renderForSpecs();
      expect(sample().color.slice(0, 3)).toEqual([0, 0, 255]);
      expect(scene.pick(sample().point)).toBeUndefined();
      layer.opacity = 1;
      scene.renderForSpecs();
      expect(sample().color.slice(0, 3)).toEqual([255, 0, 0]);
      scene.primitives.remove(layer);
      expect(
        scene._globeTranslucencyState._sceneGISSurfaceOverlays,
      ).toBeUndefined();
      expect(arrays.every((array) => array.isDestroyed())).toBeTrue();
    });
  });
  it("validates opacity without publishing invalid changes", function () {
    const style = { version: 8, sources: {}, layers: [] };
    [-1, 2, NaN, Infinity, "0.5"].forEach((opacity) => {
      expect(
        () => new SceneGISVectorTileLayer({ scene, style, opacity }),
      ).toThrowDeveloperError();
    });
    const layer = scene.primitives.add(
      new SceneGISVectorTileLayer({ scene, style, opacity: 0.25 }),
    );
    expect(layer.opacity).toBe(0.25);
    expect(() => {
      layer.opacity = NaN;
    }).toThrowDeveloperError();
    expect(layer.opacity).toBe(0.25);
    scene._renderRequested = false;
    layer.opacity = 0.5;
    expect(scene._renderRequested).toBeTrue();
  });
  it("keeps imagery alpha and multiple vector owners independent", async function () {
    globe.baseColor = Color.LIME;
    const imagery = globe.imageryLayers.addImageryProvider(
      new GridImageryProvider({
        color: Color.BLUE,
        backgroundColor: Color.BLUE,
        glowColor: Color.BLUE,
      }),
    );
    imagery.alpha = 0.5;
    const layer = add(
      [feature(3, [[0, 0, 4096, 0, 4096, 4096, 0, 4096]])],
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
    const color = sample().color;
    expect(color[0]).toEqualEpsilon(128, 2);
    expect(color[1]).toEqualEpsilon(64, 2);
    expect(color[2]).toEqualEpsilon(64, 2);
    imagery.alpha = 0;
    scene.renderForSpecs();
    expect(sample().color.slice(0, 3)).toEqualEpsilon([128, 127, 0], 2);
    globe.translucency.enabled = true;
    globe.translucency.frontFaceAlpha = 0;
    globe.translucency.backFaceAlpha = 0;
    layer.opacity = 1;
    const second = scene.primitives.add(
      new SceneGISVectorTileLayer({
        scene,
        opacity: 0.5,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "blue",
              type: "background",
              paint: { "background-color": "blue" },
            },
          ],
        },
      }),
    );
    await ready(second);
    expect(sample().color.slice(0, 3)).toEqualEpsilon([127, 0, 128], 2);
    const state = scene._globeTranslucencyState;
    expect(state._sceneGISSurfaceOverlays.size).toBe(2);
    scene.primitives.remove(second);
    expect(state._sceneGISSurfaceOverlays.size).toBe(1);
    scene.renderForSpecs();
    expect(sample().color.slice(0, 3)).toEqual([255, 0, 0]);
    scene.primitives.remove(layer);
    expect(state._sceneGISSurfaceOverlays).toBeUndefined();
  });
  it("samples real native terrain for circles asynchronously and retains geometry across providers", async function () {
    globe.terrainProvider = new CustomHeightmapTerrainProvider({
      width: 17,
      height: 17,
      callback: () => new Float32Array(17 * 17).fill(600),
    });
    frame(13.4, 52.5, 500, 600);
    const layer = add(
      [feature(1, [[2048, 2048]], "point")],
      [
        {
          id: "points",
          type: "circle",
          paint: { "circle-color": "blue", "circle-radius": 10 },
        },
      ],
    );
    await ready(layer);
    expect(layer._terrain.height(target.x, target.y)).toEqualEpsilon(600, 2);
    const pixel = sample(600);
    expect(pixel.color[2]).toBe(255);
    expect(scene.pick(pixel.point)?.id.featureId).toBe("point");
    expect(layer._terrain.entries.some((entry) => entry.result)).toBeTrue();
    const resources = layer._drawOrder[0]._resources;
    const workers = layer._workers;
    globe.terrainProvider = new EllipsoidTerrainProvider();
    frame();
    await ready(layer);
    expect(layer._workers).toBe(workers);
    expect(
      layer._drawOrder.some((batch) => batch._resources === resources),
    ).toBeTrue();
    scene.primitives.remove(layer);
    expect(resources.isDestroyed()).toBeTrue();
    expect(layer._globeTerrainCache).toBeUndefined();
  });
  [false, true].forEach((translucent) => {
    it(`keeps ordinary 3D content above opaque and transparent vector ground (translucent ${translucent})`, async function () {
      const layer = add(
        [feature(3, [[0, 0, 4096, 0, 4096, 4096, 0, 4096]])],
        [
          {
            id: "land",
            type: "fill",
            paint: { "fill-color": "red", "fill-antialias": false },
          },
        ],
      );
      scene.primitives.add(
        new Primitive({
          asynchronous: false,
          geometryInstances: new GeometryInstance({
            id: "box",
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(150, 150, 200),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            modelMatrix: Transforms.eastNorthUpToFixedFrame(
              Coordinates.position(target.x, target.y, 100),
            ),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(
                Color.BLUE.withAlpha(translucent ? 0.5 : 1),
              ),
            },
          }),
          appearance: new PerInstanceColorAppearance({
            translucent,
            flat: true,
          }),
        }),
      );
      await ready(layer);
      const original = sample(200).color;
      expect(original[2]).toBeGreaterThan(120);
      expect(scene.pick(sample(200).point)?.id).toBe("box");
      globe.translucency.enabled = true;
      globe.translucency.frontFaceAlpha = 0;
      globe.translucency.backFaceAlpha = 0;
      scene.renderForSpecs();
      expect(sample(200).color).toEqualEpsilon(original, 2);
      expect(scene.pick(sample(200).point)?.id).toBe("box");
      expect(scene.globe).toBe(globe);
    });
  });
  it("keeps ellipsoid surface heights independent of native mesh skirts and LOD", function () {
    const mesh = {
      minimumHeight: 0,
      maximumHeight: 0,
      encoding: {
        minimumHeight: -1000,
        maximumHeight: 0,
        exaggeration: 1,
        exaggerationRelativeHeight: 0,
      },
    };
    const tiles = [];
    const layer = {
      _world: {
        terrainProvider: new SourceEllipsoidTerrainProvider(),
        _surface: { _tilesToRender: tiles },
      },
    };
    const result = new Cartesian2();
    expect(Terrain.heights(layer, undefined, result)).toEqual(
      new Cartesian2(-1, 1),
    );
    tiles.push({ data: { renderedMesh: mesh } });
    expect(Terrain.heights(layer, undefined, result)).toEqual(
      new Cartesian2(-1, 1),
    );
    mesh.encoding.minimumHeight = -50;
    expect(Terrain.heights(layer, undefined, result)).toEqual(
      new Cartesian2(-1, 1),
    );
  });
  it("accepts native fill mesh encodings without optional height extrema", function () {
    const mesh = {
      minimumHeight: 12,
      maximumHeight: 30,
      encoding: { exaggeration: 2, exaggerationRelativeHeight: 0 },
    };
    const layer = {
      _world: {
        _surface: { _tilesToRender: [{ data: { renderedMesh: mesh } }] },
      },
    };
    expect(Terrain.heights(layer, undefined, new Cartesian2())).toEqual(
      new Cartesian2(-1, 61),
    );
  });
});
