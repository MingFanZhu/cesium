import {
  Cartesian2,
  Cartesian3,
  Color,
  Event,
  SceneGISPlanarHeightmapTerrainData,
  OrthographicFrustum,
  PerspectiveFrustum,
  Resource,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
} from "../../../index.js";
import WorkerPool from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorWorkerPool.js";
import Assets from "../../../Source/SceneGIS/Scene/_private/_SceneGISVectorSymbolAssets.js";
import SourceResource from "../../../Source/Core/Resource.js";
import SourceRuntimeError from "../../../Source/Core/RuntimeError.js";
import Projection from "../../../Source/SceneGIS/Scene/_private/_SceneGISVectorSymbolProjection.js";
import { encodeGlyphs, glyph } from "../Core/vectorSymbolFixture.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISVectorSymbols", function () {
  let scene, world, source, image;
  const bytes = encodeGlyphs();
  function feature(id = "1", x = 2048, text = "A", rank = 1) {
    return {
      id,
      type: 1,
      properties: { text, rank },
      geometry: {
        parts: [new Float64Array([x, 2048])],
        polygonStarts: new Uint32Array(),
      },
    };
  }
  function tile(features = [feature()]) {
    return { layers: [{ name: "data", version: 2, extent: 4096, features }] };
  }
  function road(points, text = "AAA", id = "road") {
    return {
      ...feature(id, 2048, text),
      type: 2,
      geometry: {
        parts: [
          new Float64Array(
            points.flatMap(([x, y]) => [(x + 512) * 4, (512 - y) * 4]),
          ),
        ],
        polygonStarts: new Uint32Array(),
      },
    };
  }
  function glyphCenter(candidate, text = true, index = 0) {
    const quad = candidate.projected[text ? "text" : "icon"].quads[index];
    return new Cartesian2(
      candidate.screen.x + quad.corners.reduce((sum, p) => sum + p[0], 0) / 4,
      candidate.screen.y + quad.corners.reduce((sum, p) => sum + p[1], 0) / 4,
    );
  }
  function definition(id = "labels", layout = {}, paint = {}) {
    return {
      id,
      type: "symbol",
      source: "test",
      "source-layer": "data",
      layout: {
        "text-field": "{text}",
        "text-font": ["Test"],
        "text-size": 24,
        "symbol-sort-key": ["get", "rank"],
        ...layout,
      },
      paint: { "text-color": "red", ...paint },
    };
  }
  function add(layers = [definition()], options = {}) {
    return scene.primitives.add(
      new SceneGISVectorTileLayer({
        scene,
        style: {
          version: 8,
          glyphs: "https://example.invalid/{fontstack}/{range}.pbf",
          sprite: "https://example.invalid/sprite",
          sources: {
            test: {
              type: "vector",
              tiles: ["https://example.invalid/{z}/{x}/{y}"],
              maxzoom: 0,
            },
          },
          layers,
        },
        sources: { test: source },
        ...options,
      }),
    );
  }
  async function loaded(layer) {
    await pollToPromise(() => {
      scene.renderForSpecs();
      return layer.tilesLoaded;
    });
    expect(layer.statistics.failedTiles).toBe(0);
  }
  function pixel(x = 30, y = 32) {
    scene.renderForSpecs();
    return Array.from(
      scene.context.readPixels({ x, y: 63 - y, width: 1, height: 1 }),
    );
  }
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64) });
    scene.frameState.scene3DOnly = true;
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -512,
          minimumY: -512,
          maximumX: 512,
          maximumY: 512,
        }),
        crs: "EPSG:3857",
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
    });
    scene._initializeWorld(world);
    // Test native symbol colors and alpha without the default environment.
    scene.environmentEffects.enabled = false;
    scene.gamma = 1;
    scene.msaaSamples = 1;
    scene.postProcessStages.fxaa.enabled = false;
    scene.camera.position = new Cartesian3(0, 0, 80);
    scene.camera.direction = new Cartesian3(0, 0, -1);
    scene.camera.up = new Cartesian3(0, 1, 0);
    scene.camera.right = new Cartesian3(1, 0, 0);
    scene.camera.frustum.near = 1;
    scene.camera.frustum.far = 1000;
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: world.tilingScheme,
      maximumLevel: 0,
    });
  });
  afterEach(function () {
    scene.destroyForSpecs();
    image?.remove();
    image = undefined;
  });

  it("applies feature/global paint state without new Worker shapes, glyph requests or buffers", async function () {
    const tiles = spyOn(source, "requestTile").and.resolveTo(tile());
    const fonts = spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      bytes,
    );
    const layer = add([
      definition(
        "labels",
        {},
        {
          "text-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "lime",
            ["coalesce", ["global-state", "color"], "red"],
          ],
        },
      ),
    ]);
    await loaded(layer);
    const candidate = layer._symbols._placed[0],
      shaped = candidate.shaped;
    const resources = [...layer._symbols._groups.values()][0].resources;
    const fixed = resources._staticBuffer,
      dynamic = resources._dynamicBuffer;
    const tasks = layer.statistics.workerTasks;
    const target = { source: "test", sourceLayer: "data", id: "1" };
    layer.setFeatureState(target, { selected: true });
    await loaded(layer);
    expect(pixel()).toEqual([0, 255, 0, 255]);
    expect(layer._symbols._placed[0].shaped).toBe(shaped);
    expect(resources._staticBuffer).toBe(fixed);
    expect(resources._dynamicBuffer).toBe(dynamic);
    layer.removeFeatureState(target);
    layer.setGlobalStateProperty("color", "blue");
    await loaded(layer);
    expect(pixel()).toEqual([0, 0, 255, 255]);
    expect(layer.statistics.workerTasks).toBe(tasks);
    expect(tiles).toHaveBeenCalledTimes(1);
    expect(fonts).toHaveBeenCalledTimes(1);
    expect(scene.pick(new Cartesian2(30, 32))?.id.featureId).toBe("1");
  });

  it("prepares variable anchors in the Worker, tries free positions before overlap and retains placement on motion", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile([feature("a", 2048, "A", 1), feature("b", 2048, "A", 2)]),
    );
    const fonts = spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      bytes,
    );
    const layer = add([
      definition("labels", {
        "text-size": 16,
        "text-variable-anchor": ["left", "right"],
        "text-radial-offset": 0.25,
        "text-allow-overlap": true,
      }),
    ]);
    await loaded(layer);
    const candidates = layer._symbols._placed.filter((c) => c.placed?.text);
    expect(candidates.length).toBe(2);
    expect(candidates.map((c) => c.variableAnchor)).toEqual(["left", "right"]);
    expect(candidates.every((c) => c.shaped.variants.size === 2)).toBeTrue();
    for (const c of candidates) {
      expect(scene.pick(glyphCenter(c))?.id.featureId).toBe(
        c.identity.featureId,
      );
    }
    const tasks = layer.statistics.workerTasks;
    const atlas = [...layer._symbols.assets.pages.values()][0].texture;
    const snapshot = candidates.map((c) => c.shaped.text);
    scene.camera.moveRight(1);
    await loaded(layer);
    const moved = layer._symbols._placed.filter((c) => c.placed?.text);
    expect(moved.map((c) => c.variableAnchor)).toEqual(["left", "right"]);
    expect(moved.map((c) => c.shaped.text)).toEqual(snapshot);
    expect(layer.statistics.workerTasks).toBe(tasks);
    expect(fonts).toHaveBeenCalledTimes(1);
    expect([...layer._symbols.assets.pages.values()][0].texture).toBe(atlas);
  });

  it("excludes offscreen anchors before glyph requests, shaping diagnostics and collision", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile([
        feature(),
        feature("outside-latin-cjk", 3072, "中"),
        feature("outside-shaping", 1024, "ع"),
      ]),
    );
    const request = spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      bytes,
    );
    const layer = add();
    await loaded(layer);
    expect(layer.statistics.symbolCandidates).toBe(1);
    expect(layer.statistics.placedSymbols).toBe(1);
    expect(layer.statistics.symbolFailures).toBe(0);
    expect(request.calls.count()).toBe(1);
    expect(pixel()).toEqual([255, 0, 0, 255]);
  });

  it("updates terrain text anchors and map-pitched glyph corners without replacing the atlas", async function () {
    function provider(raise) {
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
    world.terrainProvider = provider(0);
    spyOn(source, "requestTile").and.resolveTo(tile());
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add([
      definition("labels", { "text-pitch-alignment": "map" }),
    ]);
    await pollToPromise(() => {
      scene.renderForSpecs();
      return layer.tilesLoaded && layer._symbols._placed[0]?.position.z === 12;
    });
    const symbols = layer._symbols;
    const candidate = symbols._placed[0];
    const atlas = [...symbols.assets.pages.values()][0].texture;
    for (const point of candidate.projected.text.quads[0].positions) {
      expect(point.z).toEqualEpsilon(12 + (point.x * 24) / 1024, 0.001);
    }
    expect(scene.pick(glyphCenter(candidate))?.id.featureId).toBe("1");
    world.terrainProvider = provider(10);
    await pollToPromise(() => {
      scene.renderForSpecs();
      return layer.tilesLoaded && symbols._placed[0]?.position.z === 22;
    });
    expect([...symbols.assets.pages.values()][0].texture).toBe(atlas);
    expect(scene.pick(glyphCenter(symbols._placed[0]))?.id.featureId).toBe("1");
    expect(layer.statistics.symbolFailures).toBe(0);
    scene.primitives.remove(layer);
    expect(layer._terrain).toBeUndefined();
    expect(symbols._projection).toBeUndefined();
  });

  it("occludes a viewport label behind a terrain ridge in both color and pick", async function () {
    const heights = new Float32Array(33 * 33).fill(12);
    for (let row = 17; row <= 18; row++) {
      heights.fill(60, row * 33, (row + 1) * 33);
    }
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 12,
      maximumHeight: 60,
      maximumLevel: 0,
      errorEvent: new Event(),
      getLevelMaximumGeometricError: () => 1,
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
      requestTileGeometry: () =>
        Promise.resolve(
          new SceneGISPlanarHeightmapTerrainData({
            width: 33,
            height: 33,
            buffer: heights,
          }),
        ),
    };
    spyOn(source, "requestTile").and.resolveTo(tile());
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    scene.camera.position = new Cartesian3(0, -100, 50);
    scene.camera.direction = Cartesian3.normalize(
      new Cartesian3(0, 100, -38),
      new Cartesian3(),
    );
    scene.camera.up = Cartesian3.cross(
      scene.camera.right,
      scene.camera.direction,
      new Cartesian3(),
    );
    scene.camera.frustum.fov = Math.PI / 4;
    const layer = add();
    await pollToPromise(() => {
      scene.renderForSpecs();
      return layer.tilesLoaded && layer._symbols._placed[0]?.position.z === 12;
    });
    const point = glyphCenter(layer._symbols._placed[0]);
    expect(scene.pick(point)).toBeUndefined();
    expect(pixel(Math.floor(point.x), Math.floor(point.y))).toEqual([
      0, 0, 0, 255,
    ]);
    scene.camera.position = new Cartesian3(0, 0, 100);
    scene.camera.direction = new Cartesian3(0, 0, -1);
    scene.camera.up = new Cartesian3(0, 1, 0);
    await loaded(layer);
    expect(
      scene.pick(glyphCenter(layer._symbols._placed[0]))?.id.featureId,
    ).toBe("1");
  });

  it("reuses normalized Worker shapes across sizes and invalidates reloaded glyph metrics", async function () {
    spyOn(source, "requestTile").and.resolveTo(tile());
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add();
    await loaded(layer);
    const symbols = layer._symbols;
    const candidate = symbols._previous[0];
    const layout = layer.style.evaluateLayer("labels", feature(), 0).layout;
    const shape = symbols._shaping.get(candidate, layout);
    const larger = symbols._shaping.get(candidate, {
      ...layout,
      "text-size": 48,
    });
    expect(larger.text.span).toEqual(shape.text.span.map((value) => value * 2));
    const page = symbols.assets.pages.get("Test/0");
    page.generation++;
    page.glyphs.get(65).advance *= 2;
    expect(symbols._shaping.get(candidate, layout)).toBeUndefined();
    symbols._shaping.flush();
    let reloaded;
    await pollToPromise(() => {
      reloaded = symbols._shaping.get(candidate, layout);
      return reloaded !== undefined;
    });
    expect(reloaded.text.span).toEqual(larger.text.span);
    expect(page.image.arrayBufferView.byteLength).toBeGreaterThan(0);
  });

  it("excludes distant perspective labels before glyph requests and picking, and restores them when approached", async function () {
    const far = feature("far", 2048, "中");
    far.geometry.parts[0][1] = (512 - 450) * 4;
    spyOn(source, "requestTile").and.resolveTo(tile([feature(), far]));
    const request = spyOn(Resource.prototype, "fetchArrayBuffer").and.callFake(
      function () {
        const code = this.url.endsWith("/0-255.pbf") ? 65 : "中".codePointAt(0);
        return Promise.resolve(encodeGlyphs([glyph(code)]));
      },
    );
    const direction = Cartesian3.normalize(
      new Cartesian3(0, 1, -0.1),
      new Cartesian3(),
    );
    const up = Cartesian3.normalize(
      new Cartesian3(0, 0.1, 1),
      new Cartesian3(),
    );
    scene.camera.setView({
      destination: new Cartesian3(0, -30, 3),
      orientation: { direction, up },
    });
    const layer = add();
    await loaded(layer);
    expect(layer.statistics.symbolCandidates).toBe(1);
    expect(layer.statistics.placedSymbols).toBe(1);
    expect(layer.statistics.symbolFailures).toBe(0);
    expect(request.calls.count()).toBe(1);
    expect(pixel()).toEqual([255, 0, 0, 255]);
    const runtime = layer._symbols;
    expect(runtime._pickIds.size).toBe(1);
    expect(
      scene.pick(glyphCenter(runtime._previous[0]), 1, 1).id.featureId,
    ).toBe("1");

    scene.camera.position.y = 420;
    await loaded(layer);
    expect(layer.statistics.symbolCandidates).toBe(1);
    expect(layer.statistics.placedSymbols).toBe(1);
    expect(request.calls.count()).toBe(2);
    expect(pixel()).toEqual([255, 0, 0, 255]);
    expect(
      scene.pick(glyphCenter(runtime._previous[0]), 1, 1).id.featureId,
    ).toBe("far");
    const farPick = [...runtime._pickIds.values()][0];
    scene.camera.position.y = -30;
    await loaded(layer);
    expect(runtime._previous[0].identity.featureId).toBe("1");
    expect(farPick.object).toBeUndefined();
    expect(request.calls.count()).toBe(2);
  });

  it("keeps all in-view planar labels in orthographic and top-down perspective views", async function () {
    const far = feature("far", 2048);
    far.geometry.parts[0][1] = (512 - 45) * 4;
    spyOn(source, "requestTile").and.resolveTo(tile([feature(), far]));
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    scene.camera.frustum = new OrthographicFrustum({
      width: 64,
      aspectRatio: 1,
      near: 1,
      far: 2000,
    });
    scene.camera.setView({
      destination: new Cartesian3(0, -3, 0.3),
      orientation: {
        direction: Cartesian3.normalize(
          new Cartesian3(0, 1, -0.1),
          new Cartesian3(),
        ),
        up: Cartesian3.normalize(new Cartesian3(0, 0.1, 1), new Cartesian3()),
      },
    });
    const layer = add([definition("labels", { "text-allow-overlap": true })]);
    await loaded(layer);
    expect(layer.statistics.symbolCandidates).toBe(2);
    expect(layer.statistics.placedSymbols).toBe(2);

    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 1,
      far: 2000,
    });
    scene.camera.setView({
      destination: new Cartesian3(0, 22.5, 60),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: new Cartesian3(0, 1, 0),
      },
    });
    await loaded(layer);
    expect(layer.statistics.symbolCandidates).toBe(2);
    expect(layer.statistics.placedSymbols).toBe(2);
  });

  it("renders SDF pixels and alpha-aware native picking, reuses warm commands, and destroys owned resources", async function () {
    spyOn(source, "requestTile").and.resolveTo(tile());
    const request = spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      bytes,
    );
    const layer = add();
    await loaded(layer);
    expect(layer.statistics.placedSymbols).toBe(1);
    expect(pixel()).toEqual([255, 0, 0, 255]);
    const picked = scene.pick(new Cartesian2(30, 32));
    expect(picked.primitive).toBe(layer);
    expect(picked.id.featureId).toBe("1");
    expect(scene.pick(new Cartesian2(21, 20), 1, 1)).toBeUndefined();
    const runtime = layer._symbols,
      batch = [...runtime._groups.values()][0],
      command = batch.command;
    const va = batch.resources.vertexArray,
      atlas = batch.page.texture,
      pickId = [...runtime._pickIds.values()][0];
    const pickSource = scene.frameState.useLogDepth
      ? command.derivedCommands.logDepth.command
      : command;
    expect(pickSource.derivedCommands.picking.pickCommand.vertexArray).toBe(va);
    const upload = spyOn(batch.resources, "update").and.callThrough();
    const shape = runtime._previous[0].shaped;
    const layouts = [...runtime._tileLayouts.values()][0];
    const page = [...runtime.assets.pages.values()][0];
    const expectedBytes =
      page.image.arrayBufferView.byteLength +
      [...page.glyphs.values()].reduce(
        (sum, glyph) => sum + glyph.bitmap.byteLength,
        0,
      );
    const glyphScan = spyOn(page.glyphs, "values").and.callThrough();
    const shapingScan = spyOn(
      runtime._shaping.records,
      "values",
    ).and.callThrough();
    const filter = spyOn(
      layer.style._compiled.get("labels").filter,
      "filter",
    ).and.callThrough();
    for (let i = 0; i < 3; i++) {
      scene.renderForSpecs();
      expect(layer.statistics.glyphCpuBytes).toBe(expectedBytes);
    }
    expect(glyphScan).not.toHaveBeenCalled();
    expect(shapingScan).not.toHaveBeenCalled();
    expect(runtime._shaping.pending).toBeFalse();
    expect(upload).not.toHaveBeenCalled();
    expect(request.calls.count()).toBe(1);
    layer.opacity = 0.5;
    scene.renderForSpecs();
    expect(pixel()[0]).toEqualEpsilon(128, 2);
    expect(scene.pick(new Cartesian2(30, 32))?.primitive).toBe(layer);
    layer.opacity = 0;
    scene.renderForSpecs();
    expect(pixel()[0]).toBe(0);
    expect(scene.pick(new Cartesian2(30, 32))).toBeUndefined();
    layer.opacity = 1;
    scene.renderForSpecs();
    expect(pixel()[0]).toBe(255);
    expect(upload).not.toHaveBeenCalled();
    scene.camera.position.x = 1;
    scene.renderForSpecs();
    expect([...runtime._tileLayouts.values()][0]).toBe(layouts);
    expect(filter).not.toHaveBeenCalled();
    expect(runtime._previous[0].shaped).toBe(shape);
    expect([...runtime._groups.values()][0].command).toBe(command);
    expect([...runtime._pickIds.values()][0]).toBe(pickId);
    scene.camera.position.z *= 0.5;
    await loaded(layer);
    expect([...runtime._tileLayouts.values()][0]).not.toBe(layouts);
    expect(filter).toHaveBeenCalled();
    scene.primitives.remove(layer);
    expect(runtime._tileLayouts.size).toBe(0);
    expect(va.isDestroyed()).toBeTrue();
    expect(atlas.isDestroyed()).toBeTrue();
    expect(pickId.object).toBeUndefined();
    expect(world.isDestroyed()).toBeFalse();
  });
  it("retains candidate indexes outside the render cover until their resident tile is evicted", async function () {
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: world.tilingScheme,
      maximumLevel: 2,
    });
    spyOn(source, "requestTile").and.resolveTo(tile());
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    scene.camera.position.x = -128;
    scene.camera.position.y = 128;
    scene.camera.position.z = 10;
    const layer = add(undefined, { maximumVisibleTiles: 4, tileCacheSize: 4 });
    await loaded(layer);
    const runtime = layer._symbols,
      state = layer._sources.get("test");
    const entry = [...state.render.keys()][0];
    expect(entry.level).toBe(2);
    const cache = runtime._tileLayouts.get(entry);
    const index = cache.layers.get(0).index;
    scene.camera.position.x = 128;
    await loaded(layer);
    expect(state.render.has(entry)).toBeFalse();
    expect(state.entries.get(entry.key)).toBe(entry);
    expect(runtime._tileLayouts.get(entry)).toBe(cache);
    scene.camera.position.x = -128;
    await loaded(layer);
    expect(runtime._tileLayouts.get(entry).layers.get(0).index).toBe(index);
    scene.camera.position.x = 128;
    await loaded(layer);
    scene.camera.position.x = 384;
    await loaded(layer);
    scene.camera.position.y = -128;
    await loaded(layer);
    scene.camera.position.x = 128;
    await loaded(layer);
    scene.camera.position.x = -128;
    await loaded(layer);
    expect(state.entries.has(entry.key)).toBeFalse();
    expect(runtime._tileLayouts.has(entry)).toBeFalse();
  });

  it("prunes dense offscreen anchors conservatively and reuses the index during motion", async function () {
    const features = Array.from({ length: 4096 }, (_, index) => {
      const item = feature(`${index}`, (index % 64) * 64 + 32);
      item.geometry.parts[0][1] = Math.floor(index / 64) * 64 + 32;
      return item;
    });
    spyOn(source, "requestTile").and.resolveTo(tile(features));
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add();
    await loaded(layer);
    const runtime = layer._symbols;
    const cache = [...runtime._tileLayouts.values()][0].layers.get(0);
    const index = cache.index,
      builds = runtime.statistics.candidateBuilds;
    const tested = spyOn(Projection, "visible").and.callThrough();
    scene.camera.position.x += 0.25;
    runtime._nextPlacementTime = 0;
    await loaded(layer);
    expect(tested.calls.count()).toBeLessThan(features.length / 4);
    expect(cache.index).toBe(index);
    expect(runtime.statistics.candidateBuilds).toBe(builds);
    const projection = runtime._projection;
    const expected = cache.candidates.filter((candidate) =>
      Projection.visible(projection, candidate.position),
    );
    expect(runtime.statistics.candidates).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(0);
    // A whole node can only be discarded if none of its actual anchor points is visible.
    function check(node) {
      if (node.candidates) {
        if (
          node.candidates.some((candidate) =>
            Projection.visible(projection, candidate.position),
          )
        ) {
          expect(
            Projection.intersectsBounds(projection, node.bounds),
          ).toBeTrue();
        }
      } else {
        check(node.left);
        check(node.right);
      }
    }
    check(index);
  });

  it("renders real world glyph corners along a curve, stays upright after heading reversal, and releases the batch", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile([
        road([
          [-60, -20],
          [-10, 0],
          [10, 0],
          [60, 20],
        ]),
      ]),
    );
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add([
      definition("line", {
        "symbol-placement": "line-center",
        "text-size": 20,
      }),
    ]);
    await loaded(layer);
    expect(layer.statistics.placedSymbols).toBe(1);
    const runtime = layer._symbols,
      candidate = runtime._previous[0];
    const quads = candidate.projected.text.quads;
    expect(quads.every((q) => q.positions?.length === 4)).toBeTrue();
    expect(quads[0].corners[1][1] - quads[0].corners[0][1]).not.toBeCloseTo(
      quads[1].corners[1][1] - quads[1].corners[0][1],
      3,
    );
    expect(scene.pick(glyphCenter(candidate), 1, 1).id.featureId).toBe("road");
    const batch = [...runtime._groups.values()][0],
      va = batch.resources.vertexArray;
    const upload = spyOn(batch.resources, "update").and.callThrough();
    scene.renderForSpecs();
    expect(upload).not.toHaveBeenCalled();
    const staging = batch.staging;
    const fixedBuffer = batch.resources._staticBuffer;
    const dynamicBuffer = batch.resources._dynamicBuffer;
    const fixedUpload = spyOn(
      fixedBuffer,
      "copyFromArrayView",
    ).and.callThrough();
    const dynamicUpload = spyOn(
      dynamicBuffer,
      "copyFromArrayView",
    ).and.callThrough();
    const positions = quads[0].positions;
    const encoded = quads[0].encodedPositions;
    scene.camera.position.x = 1;
    scene.renderForSpecs();
    const movedQuad = runtime._previous[0].projected.text.quads[0];
    expect(movedQuad.positions).toBe(positions);
    expect(movedQuad.encodedPositions).toBe(encoded);
    expect(batch.staging).toBe(staging);
    expect(staging instanceof Float32Array).toBeTrue();
    expect(fixedUpload).not.toHaveBeenCalled();
    expect(dynamicUpload).not.toHaveBeenCalled();
    expect(
      scene.pick(glyphCenter(runtime._previous[0]), 1, 1).id.featureId,
    ).toBe("road");
    scene.camera.up = new Cartesian3(0, -1, 0);
    scene.camera.right = new Cartesian3(-1, 0, 0);
    scene.renderForSpecs();
    const turned = runtime._previous[0];
    expect(glyphCenter(turned, true, 0).x).toBeLessThan(
      glyphCenter(turned, true, 2).x,
    );
    expect(scene.pick(glyphCenter(turned), 1, 1).id.featureId).toBe("road");
    expect([...runtime._groups.values()][0].resources.vertexArray).toBe(va);
    expect(fixedUpload).not.toHaveBeenCalled();
    expect(dynamicUpload).toHaveBeenCalled();
    scene.primitives.remove(layer);
    expect(va.isDestroyed()).toBeTrue();
    expect(fixedBuffer.isDestroyed()).toBeTrue();
    expect(dynamicBuffer.isDestroyed()).toBeTrue();
  });

  it("finishes a budgeted cohort during continuous motion while drawing and picking the current camera", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile(
        Array.from({ length: 24 }, (_, index) =>
          feature(`${index}`, 2048 + index, "A", index),
        ),
      ),
    );
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add();
    await loaded(layer);
    const runtime = layer._symbols;
    const builds = runtime.statistics.candidateBuilds;
    const commits = runtime.statistics.placementCommits;
    const base = runtime._previous[0].base;
    runtime._placementBudget = 0;
    runtime._nextPlacementTime = 0;
    scene.camera.position.x += 0.01;
    scene.renderForSpecs();
    const job = runtime._placement;
    const savedX = job.projection.camera.positionWC.x;
    expect(job).toBeDefined();
    expect(layer.tilesLoaded).toBeFalse();
    scene.camera.position.x += 1;
    scene.renderForSpecs();
    expect(runtime._placement).toBe(job);
    expect(job.projection.camera.positionWC.x).toBe(savedX);
    const steps = runtime.statistics.placementSteps;
    const shown = runtime._previous.find((candidate) => candidate.placed);
    expect(scene.pick(glyphCenter(shown), 1, 1).id.featureId).toBe(
      shown.identity.featureId,
    );
    expect(runtime.statistics.placementSteps).toBe(steps);
    for (
      let i = 0;
      i < 100 && runtime.statistics.placementCommits === commits;
      i++
    ) {
      scene.camera.position.x += 0.001;
      scene.renderForSpecs();
    }
    expect(runtime.statistics.placementCommits).toBe(commits + 1);
    expect(runtime.statistics.candidateBuilds).toBe(builds);
    expect(runtime._previous[0].base).toBe(base);
    runtime._placementBudget = 2;
    await loaded(layer);
    expect(layer.statistics.symbolFailures).toBe(0);
    runtime._placementBudget = 0;
    runtime._nextPlacementTime = 0;
    scene.camera.position.x += 0.01;
    scene.renderForSpecs();
    expect(runtime._placement).toBeDefined();
    const resources = [...runtime._groups.values()].map(
      (batch) => batch.resources.vertexArray,
    );
    layer.show = false;
    scene.renderForSpecs();
    expect(runtime._placement).toBeUndefined();
    expect(runtime._previous.length).toBe(0);
    expect(runtime._pickIds.size).toBe(0);
    expect(resources.every((va) => va.isDestroyed())).toBeTrue();
    layer.show = true;
    runtime._placementBudget = 2;
    await loaded(layer);
    expect(layer.statistics.placedSymbols).toBeGreaterThan(0);
  });

  it("uses one conservative straight-line collision envelope without projecting every glyph", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile([
        road(
          [
            [-200, 0],
            [200, 0],
          ],
          "AAAAAAAAAAAA",
        ),
      ]),
    );
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add([
      definition("line", {
        "symbol-placement": "line-center",
        "text-size": 12,
      }),
    ]);
    await loaded(layer);
    const runtime = layer._symbols;
    const candidate = runtime._previous.find((item) => item.placed);
    const proxy = Projection.collision(
      runtime._projection,
      candidate,
      candidate.shaped.text,
      true,
      runtime._metersPerPixel,
    );
    const glyphs = candidate.projected.text.quads;
    expect(proxy.boxes.length).toBe(1);
    expect(glyphs.length).toBe(12);
    const box = proxy.boxes[0];
    for (const glyph of glyphs) {
      for (const [x, y] of glyph.corners) {
        expect(x).toBeGreaterThanOrEqual(box[0]);
        expect(x).toBeLessThanOrEqual(box[2]);
        expect(y).toBeGreaterThanOrEqual(box[1]);
        expect(y).toBeLessThanOrEqual(box[3]);
      }
    }
  });

  it("retires a failed placement iterator without retrying the same view", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile([feature("1", 2048, "A中")]),
    );
    const request = spyOn(Resource.prototype, "fetchArrayBuffer");
    const layer = add(undefined, { maximumGlyphRanges: 1 });
    const error = jasmine.createSpy("symbol error");
    layer.errorEvent.addEventListener(error);
    await loaded(layer);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.calls.first().args[0].error.message).toContain(
      "maximumGlyphRanges",
    );
    expect(layer._symbols._placement).toBeUndefined();
    const steps = layer._symbols.statistics.placementSteps;
    for (let i = 0; i < 3; i++) {
      scene.renderForSpecs();
    }
    expect(error).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    expect(layer._symbols.statistics.placementSteps).toBe(steps);
  });

  it("projects map-pitched text onto the tilted plane while viewport text retains its height", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile([
        road(
          [
            [-150, 0],
            [150, 0],
          ],
          "A",
        ),
      ]),
    );
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add([
      definition("map", {
        "symbol-placement": "line-center",
        "text-allow-overlap": true,
      }),
      definition("viewport", {
        "symbol-placement": "line-center",
        "text-rotation-alignment": "viewport",
        "text-allow-overlap": true,
      }),
    ]);
    await loaded(layer);
    const height = (id) => {
      const box = layer._symbols._previous.find(
        (c) => c.identity.styleLayer === id,
      ).projected.text.boxes[0];
      return box[3] - box[1];
    };
    const mapHeight = height("map"),
      screenHeight = height("viewport");
    scene.camera.position = new Cartesian3(
      0,
      -80 / Math.sqrt(2),
      80 / Math.sqrt(2),
    );
    scene.camera.direction = new Cartesian3(0, Math.SQRT1_2, -Math.SQRT1_2);
    scene.camera.up = new Cartesian3(0, Math.SQRT1_2, Math.SQRT1_2);
    scene.renderForSpecs();
    expect(height("map")).toBeLessThan(mapHeight * 0.8);
    expect(height("viewport")).toBeCloseTo(screenHeight, 8);
    expect(layer.statistics.placedSymbols).toBe(2);
    const candidate = layer._symbols._previous.find(
      (c) => c.identity.styleLayer === "viewport",
    );
    expect(scene.pick(glyphCenter(candidate), 1, 1).id.styleLayer).toBe(
      "viewport",
    );
  });

  it("compensates near and far road-label sizes at shallow pitch while preserving center and orthographic scale", async function () {
    const pitch = (5 * Math.PI) / 180;
    const locations = [
      { y: -40 / Math.cos(pitch), text: "A", scale: 0.75 },
      { y: 0, text: "AA", scale: 1 },
      { y: 80 / Math.cos(pitch), text: "AAA", scale: 1.5 },
    ];
    spyOn(source, "requestTile").and.resolveTo(
      tile(
        locations.map(({ y, text }) =>
          road(
            [
              [-450, y],
              [450, y],
            ],
            text,
          ),
        ),
      ),
    );
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 1,
      far: 1000,
    });
    scene.camera.position = new Cartesian3(
      0,
      -80 * Math.cos(pitch),
      80 * Math.sin(pitch),
    );
    scene.camera.direction = new Cartesian3(
      0,
      Math.cos(pitch),
      -Math.sin(pitch),
    );
    scene.camera.up = new Cartesian3(0, Math.sin(pitch), Math.cos(pitch));
    const layer = add([
      definition("map", {
        "symbol-placement": "line-center",
        "text-size": 8,
        "text-allow-overlap": true,
      }),
    ]);
    await loaded(layer);
    const runtime = layer._symbols;
    const atlas = [...runtime.assets.pages.values()][0].texture;
    const check = (orthographic) => {
      expect(runtime._placed.length).toBe(3);
      for (const { text, scale } of locations) {
        const c = runtime._placed.find((c) => c.text === text);
        const quad = c._geometry.text.quads[0];
        const box = c.shaped.text.quads[0].box;
        const nominalWidth = (box[2] - box[0]) * runtime._metersPerPixel;
        const groundWidth = Cartesian3.distance(
          quad.positions[0],
          quad.positions[1],
        );
        expect(groundWidth / nominalWidth).toBeCloseTo(
          orthographic ? 1 : scale,
          8,
        );
        const envelope = Projection.collision(
          runtime._projection,
          c,
          c.shaped.text,
          true,
          runtime._metersPerPixel,
        ).boxes[0];
        for (const glyph of c.projected.text.quads) {
          for (const [x, y] of glyph.corners) {
            expect(x).toBeGreaterThanOrEqual(envelope[0]);
            expect(x).toBeLessThanOrEqual(envelope[2]);
            expect(y).toBeGreaterThanOrEqual(envelope[1]);
            expect(y).toBeLessThanOrEqual(envelope[3]);
          }
        }
      }
    };
    check(false);
    const quads = runtime._placed.map((c) => c._geometry.text.quads);
    scene.renderForSpecs();
    runtime._placed.forEach((c, i) =>
      expect(c._geometry.text.quads).toBe(quads[i]),
    );
    scene.camera.frustum = new OrthographicFrustum({
      width: 128,
      aspectRatio: 1,
      near: 1,
      far: 1000,
    });
    await loaded(layer);
    check(true);
    expect([...runtime.assets.pages.values()][0].texture).toBe(atlas);
    expect(layer.statistics.symbolFailures).toBe(0);
  });

  it("rejects short and sharp paths and suppresses repeated names without suppressing distinct names", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile([
        road(
          [
            [-4, 0],
            [4, 0],
          ],
          "AAA",
          "short",
        ),
        road(
          [
            [-80, -10],
            [0, -10],
            [0, 70],
          ],
          "AAA",
          "sharp",
        ),
        road(
          [
            [-80, 5],
            [80, 5],
          ],
          "A",
          "first",
        ),
        road(
          [
            [-80, 7],
            [80, 7],
          ],
          "A",
          "repeat",
        ),
        road(
          [
            [-80, -20],
            [80, -20],
          ],
          "AA",
          "distinct",
        ),
      ]),
    );
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add([
      definition("line", {
        "symbol-placement": "line-center",
        "text-max-angle": 30,
        "text-allow-overlap": true,
      }),
    ]);
    await loaded(layer);
    expect(layer.statistics.placedSymbols).toBe(2);
    expect(layer.statistics.duplicateSymbols).toBe(1);
    expect(
      layer._symbols._previous
        .filter((c) => c.placed)
        .map((c) => c.text)
        .sort(),
    ).toEqual(["A", "AA"]);
  });

  it("uses the first LineString vertex for point placement and the path center for line-center", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile([
        road(
          [
            [-20, 0],
            [20, 0],
          ],
          "A",
        ),
      ]),
    );
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add([
      definition("point", { "text-size": 10, "text-allow-overlap": true }),
      definition("line", {
        "symbol-placement": "line-center",
        "text-size": 10,
        "text-allow-overlap": true,
      }),
    ]);
    await loaded(layer);
    expect(
      layer._symbols._previous.find((c) => c.identity.styleLayer === "point")
        .position.x,
    ).toBe(-20);
    expect(
      layer._symbols._previous.find((c) => c.identity.styleLayer === "line")
        .position.x,
    ).toBe(0);
    expect(layer.statistics.placedSymbols).toBe(2);
  });

  it("suppresses adjacent tile repetitions and lets a complete line label cross its anchor ownership boundary", async function () {
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: world.tilingScheme,
      minimumLevel: 1,
      maximumLevel: 1,
    });
    spyOn(source, "requestTile").and.callFake((x, y) => {
      const f = feature(`tile-${x}`);
      f.type = 2;
      f.geometry.parts = [
        new Float64Array(
          x === 0 ? [3920, 4056, 4256, 4056] : [-160, 4056, 176, 4056],
        ),
      ];
      return Promise.resolve(tile(y === 0 ? [f] : []));
    });
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add([
      definition("line", { "symbol-placement": "line-center" }),
    ]);
    await loaded(layer);
    expect(layer.statistics.symbolCandidates).toBe(2);
    expect(layer.statistics.placedSymbols).toBe(1);
    expect(layer.statistics.duplicateSymbols).toBe(1);
    const left = scene.pick(new Cartesian2(31, 28), 1, 1),
      right = scene.pick(new Cartesian2(33, 28), 1, 1);
    expect(left.id.featureId).toBe("tile-0");
    expect(right.id.featureId).toBe(left.id.featureId);
    expect(layer.statistics.symbolFailures).toBe(0);
  });

  it("clips a viewport label path at the camera near plane before projecting its vertices", async function () {
    scene.camera.position = new Cartesian3(
      0,
      -80 / Math.sqrt(2),
      80 / Math.sqrt(2),
    );
    scene.camera.direction = new Cartesian3(0, Math.SQRT1_2, -Math.SQRT1_2);
    scene.camera.up = new Cartesian3(0, Math.SQRT1_2, Math.SQRT1_2);
    spyOn(source, "requestTile").and.resolveTo(
      tile([
        road(
          [
            [0, -200],
            [0, 200],
          ],
          "A",
        ),
      ]),
    );
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add([
      definition("line", {
        "symbol-placement": "line-center",
        "text-pitch-alignment": "viewport",
      }),
    ]);
    const errors = [];
    layer.errorEvent.addEventListener(({ error }) =>
      errors.push(error.message),
    );
    await loaded(layer);
    expect(errors).toEqual([]);
    expect(layer.statistics.symbolCandidates).toBe(1);
    expect(layer.statistics.placedSymbols).toBe(1);
    const candidate = layer._symbols._previous[0];
    expect(
      candidate.projected.text.quads.every((q) =>
        q.corners.flat().every(Number.isFinite),
      ),
    ).toBeTrue();
    expect(scene.pick(glyphCenter(candidate), 1, 1).id.featureId).toBe("road");
    expect(layer.statistics.symbolFailures).toBe(0);
  });

  it("renders ordinary sprite RGBA and leaves transparent texels unpickable", async function () {
    spyOn(source, "requestTile").and.resolveTo(tile());
    spyOn(Resource.prototype, "fetchJson").and.resolveTo({
      pin: { x: 0, y: 0, width: 16, height: 16, pixelRatio: 1 },
    });
    image = createCanvas(16, 16);
    const context = image.getContext("2d");
    context.fillStyle = "lime";
    context.fillRect(4, 4, 8, 8);
    spyOn(Resource.prototype, "fetchImage").and.resolveTo(image);
    const layer = add([
      definition("icon", { "text-field": "", "icon-image": "pin" }),
    ]);
    await loaded(layer);
    expect(pixel()).toEqual([0, 255, 0, 255]);
    expect(scene.pick(new Cartesian2(30, 32), 1, 1).id.styleLayer).toBe("icon");
    expect(scene.pick(new Cartesian2(24, 24), 1, 1)).toBeUndefined();
    expect(layer.statistics.glyphRanges).toBe(0);
  });
  it("fits sliced icons to variable text, retains transparent corners and reuses Worker/GPU resources during zoom", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile([feature("a", 2048, "AA"), feature("b", 2048, "AA", 2)]),
    );
    const fonts = spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      bytes,
    );
    const metadata = spyOn(Resource.prototype, "fetchJson").and.resolveTo({
      shield: {
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        pixelRatio: 1,
        content: [2, 2, 14, 14],
        stretchX: [[4, 12]],
        stretchY: [[4, 12]],
      },
    });
    image = createCanvas(16, 16);
    const context = image.getContext("2d");
    context.fillStyle = "lime";
    context.fillRect(0, 0, 16, 16);
    context.clearRect(0, 0, 3, 3);
    spyOn(Resource.prototype, "fetchImage").and.resolveTo(image);
    const layer = add([
      definition("fit", {
        "text-size": ["interpolate", ["linear"], ["zoom"], 0, 10, 5, 18],
        "text-variable-anchor": ["left", "right"],
        "text-radial-offset": 0.8,
        "icon-image": "shield",
        "icon-text-fit": "both",
        "icon-text-fit-padding": [2, 2, 2, 2],
      }),
    ]);
    await loaded(layer);
    const placed = layer._symbols._placed.filter((c) => c.placed?.text);
    expect(placed.length).toBe(2);
    expect(placed.map((c) => c.variableAnchor)).toEqual(["left", "right"]);
    for (const c of placed) {
      expect(c.shaped.icon).toBe(c.shaped.icons.get(c.variableAnchor));
      expect(c.shaped.icon.quads.length).toBe(9);
      expect(scene.pick(glyphCenter(c))?.id.featureId).toBe(
        c.identity.featureId,
      );
      const box = c.shaped.icon.box;
      const point = new Cartesian2(
        c.screen.x + (box[0] + box[2]) / 2,
        c.screen.y + box[3] - 1,
      );
      expect(scene.pick(point, 1, 1)?.id.featureId).toBe(c.identity.featureId);
      expect(pixel(Math.floor(point.x), Math.floor(point.y))).toEqual([
        0, 255, 0, 255,
      ]);
      const hole = new Cartesian2(
        c.screen.x + box[0] + 0.5,
        c.screen.y + box[1] + 0.5,
      );
      expect(scene.pick(hole, 1, 1)).toBeUndefined();
    }
    const groups = [...layer._symbols._groups.values()];
    const buffers = groups.map((b) => b.resources._staticBuffer);
    const atlas = layer._symbols.assets.sprite.texture;
    const tasks = layer.statistics.workerTasks;
    const width = placed[0].shaped.icon.box[2] - placed[0].shaped.icon.box[0];
    scene.camera.position.z *= 0.95;
    await loaded(layer);
    const resized = layer._symbols._placed.find((c) => c.placed?.text);
    expect(
      resized.shaped.icon.box[2] - resized.shaped.icon.box[0],
    ).toBeGreaterThan(width);
    expect(
      [...layer._symbols._groups.values()].map(
        (b) => b.resources._staticBuffer,
      ),
    ).toEqual(buffers);
    expect(layer.statistics.workerTasks).toBe(tasks);
    expect(fonts).toHaveBeenCalledTimes(1);
    expect(metadata).toHaveBeenCalledTimes(1);
    scene.primitives.remove(layer);
    expect(atlas.isDestroyed()).toBeTrue();
    expect(buffers.every((b) => b.isDestroyed())).toBeTrue();
  });
  it("publishes the base while glyphs are pending and does no loading during pick replay", async function () {
    spyOn(source, "requestTile").and.resolveTo(tile());
    let complete;
    const request = spyOn(
      Resource.prototype,
      "fetchArrayBuffer",
    ).and.returnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const layer = add([
      { id: "base", type: "background", paint: { "background-color": "blue" } },
      definition(),
    ]);
    await pollToPromise(() => {
      scene.renderForSpecs();
      return request.calls.count() === 1;
    });
    expect(layer.tilesLoaded).toBeFalse();
    expect(pixel()).toEqual([0, 0, 255, 255]);
    scene.pick(new Cartesian2(30, 32));
    expect(request.calls.count()).toBe(1);
    layer.show = false;
    scene.renderForSpecs();
    expect(layer.tilesLoaded).toBeTrue();
    expect(layer.statistics.placedSymbols).toBe(0);
    layer.show = true;
    scene.renderForSpecs();
    expect(layer.tilesLoaded).toBeFalse();
    complete(bytes);
    await loaded(layer);
    expect(pixel()).toEqual([255, 0, 0, 255]);
  });
  it("keeps text when the sprite has no requested entry and exposes the missing name", async function () {
    spyOn(source, "requestTile").and.resolveTo(tile());
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    spyOn(Resource.prototype, "fetchJson").and.resolveTo({});
    image = createCanvas(1, 1);
    spyOn(Resource.prototype, "fetchImage").and.resolveTo(image);
    const layer = add([definition("labels", { "icon-image": "office" })]);
    await loaded(layer);
    expect(layer.statistics.placedSymbols).toBe(1);
    expect(layer.statistics.symbolFailures).toBe(0);
    expect(layer.statistics.missingSymbolImages).toEqual(["office"]);
    expect(pixel()).toEqual([255, 0, 0, 255]);
  });

  it("preserves overlapping feature paint and pick order across atlas pages", async function () {
    const lower = feature("lower", 2048, "AĀ", 1),
      upper = feature("upper", 2048, "ĀA", 2);
    lower.properties.color = "red";
    upper.properties.color = "blue";
    spyOn(source, "requestTile").and.resolveTo(tile([lower, upper]));
    spyOn(Resource.prototype, "fetchArrayBuffer").and.callFake(function () {
      return Promise.resolve(
        encodeGlyphs([glyph(this.url.includes("0-255") ? 65 : 256)]),
      );
    });
    const layer = add([
      definition(
        "labels",
        { "text-allow-overlap": true },
        { "text-color": ["get", "color"] },
      ),
    ]);
    await loaded(layer);
    expect(layer.statistics.placedSymbols).toBe(2);
    expect(pixel(37, 32)).toEqual([0, 0, 255, 255]);
    expect(scene.pick(new Cartesian2(37, 32), 1, 1).id.featureId).toBe("upper");
  });

  it("reports a terminal font failure once without retry or blocking the base", async function () {
    spyOn(source, "requestTile").and.resolveTo(tile());
    const request = spyOn(
      Resource.prototype,
      "fetchArrayBuffer",
    ).and.rejectWith(new Error("font HTTP failure"));
    const layer = add();
    const listener = jasmine.createSpy("error");
    layer.errorEvent.addEventListener(listener);
    await loaded(layer);
    scene.renderForSpecs();
    expect(layer.statistics.symbolFailures).toBe(1);
    expect(layer.statistics.placedSymbols).toBe(0);
    expect(listener.calls.first().args[0].resource).toBe("Test/0");
    expect(listener.calls.first().args[0].tile).toBeUndefined();
    expect(request.calls.count()).toBe(1);
    expect(listener.calls.count()).toBe(1);
  });
  it("cancels requests and ignores late font completion after destroy", async function () {
    spyOn(source, "requestTile").and.resolveTo(tile());
    let complete;
    const request = spyOn(
      Resource.prototype,
      "fetchArrayBuffer",
    ).and.returnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const layer = add();
    await pollToPromise(() => {
      scene.renderForSpecs();
      return request.calls.count() === 1;
    });
    const assets = layer._symbols.assets,
      entry = [...assets.pages.values()][0];
    scene.primitives.remove(layer);
    expect(entry.requests[0].cancelled).toBeTrue();
    complete(bytes);
    await Promise.resolve();
    await Promise.resolve();
    expect(entry.glyphs).toBeUndefined();
    expect(entry.texture).toBeUndefined();
    expect(assets.pages.size).toBe(0);
  });
  it("shares atlas pages across style layers and gives higher layers placement priority", async function () {
    spyOn(source, "requestTile").and.resolveTo(tile());
    const request = spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      bytes,
    );
    const layer = add([
      definition("lower"),
      definition("upper", {}, { "text-color": "blue" }),
    ]);
    await loaded(layer);
    expect(request.calls.count()).toBe(1);
    expect(layer.statistics.symbolCandidates).toBe(2);
    expect(layer.statistics.placedSymbols).toBe(1);
    expect(pixel()).toEqual([0, 0, 255, 255]);
    expect(scene.pick(new Cartesian2(30, 32)).id.styleLayer).toBe("upper");
  });
  it("bounds candidates after deterministic sort-key ordering and preserves nearby distinct identities", async function () {
    spyOn(source, "requestTile").and.resolveTo(
      tile([feature("low", 2048, "A", 2), feature("high", 2048, "A", 1)]),
    );
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add([definition()], { maximumSymbolCandidates: 1 });
    await loaded(layer);
    expect(layer.statistics.truncatedSymbols).toBe(1);
    expect(scene.pick(new Cartesian2(30, 32)).id.featureId).toBe("high");
  });
  it("retains label identity during delayed LOD replacement and deduplicates quantized border anchors without clipping glyphs", async function () {
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: world.tilingScheme,
      maximumLevel: 1,
    });
    const pending = [];
    spyOn(source, "requestTile").and.callFake((x, y, level) => {
      if (level === 0) {
        const parent = feature("parent");
        parent.geometry.parts[0][1] = 2008;
        return Promise.resolve(tile([parent]));
      }
      return new Promise((resolve) => {
        pending.push(() => {
          const child = feature(`child-${x}`, x === 0 ? 4095 : 1);
          child.geometry.parts[0][1] = 4016;
          resolve(tile(y === 0 ? [child] : []));
        });
      });
    });
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const layer = add();
    await loaded(layer);
    const previousPick = [...layer._symbols._pickIds.values()][0];
    scene.camera.position.z = 20;
    scene.renderForSpecs();
    expect(layer.tilesLoaded).toBeFalse();
    expect(layer.statistics.placedSymbols).toBe(1);
    expect([...layer._symbols._pickIds.values()][0]).toBe(previousPick);
    for (const complete of pending) {
      complete();
    }
    await loaded(layer);
    expect(layer.statistics.duplicateSymbols).toBe(1);
    expect(layer.statistics.placedSymbols).toBe(1);
    expect([...layer._symbols._pickIds.values()][0]).toBe(previousPick);
    const anchor = layer._symbols._previous[0].screen;
    expect(
      scene.pick(new Cartesian2(anchor.x - 2, anchor.y), 1, 1).id.featureId,
    ).toContain("child");
    expect(
      scene.pick(new Cartesian2(anchor.x + 2, anchor.y), 1, 1).id.featureId,
    ).toContain("child");
  });

  it("evicts only unused glyph ranges and terminates stale requests within a bounded cache", async function () {
    let complete;
    spyOn(SourceResource.prototype, "fetchArrayBuffer").and.callFake(
      function () {
        if (this.url.includes("0-255")) {
          return new Promise((resolve) => {
            complete = resolve;
          });
        }
        return Promise.resolve(encodeGlyphs([glyph(256)]));
      },
    );
    const owner = {
      scene,
      style: { glyphs: "https://example.invalid/{fontstack}/{range}.pbf" },
      _workers: new WorkerPool(),
    };
    const assets = new Assets(owner, 1, 1),
      first = new Map([["Test/0", { font: "Test", range: 0 }]]),
      next = new Map([["Test/1", { font: "Test", range: 1 }]]);
    assets.prepare(first, false, new Set());
    const old = assets.pages.get("Test/0");
    assets.prepare(next, false, new Set());
    expect(old.requests[0].cancelled).toBeTrue();
    expect(assets.pages.size).toBe(1);
    complete(bytes);
    await Promise.resolve();
    await Promise.resolve();
    await pollToPromise(() => {
      assets.prepare(next, false, new Set());
      return assets.loaded;
    });
    expect(old.glyphs).toBeUndefined();
    expect(assets.glyph("Test", 256).glyph.id).toBe(256);
    expect(() =>
      assets.prepare(first, false, new Set(["Test/1"])),
    ).toThrowError(SourceRuntimeError);
    assets.destroy();
    owner._workers.destroy();
  });
});
