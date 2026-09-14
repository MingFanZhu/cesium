import {
  Cartesian2,
  Cartesian3,
  Cartesian4,
  CullingVolume,
  Color,
  Event,
  SceneTransforms,
  SceneGISPlanarWorld,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
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
