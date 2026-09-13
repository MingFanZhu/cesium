import {
  Cartesian2,
  Cartesian3,
  Color,
  OrthographicFrustum,
  PerspectiveFrustum,
  Resource,
  RuntimeError,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
} from "../../../index.js";
import WorkerPool from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorWorkerPool.js";
import Assets from "../../../Source/SceneGIS/Scene/_private/_SceneGISVectorSymbolAssets.js";
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
    expect(command.derivedCommands.picking.pickCommand.vertexArray).toBe(va);
    const upload = spyOn(batch.resources, "update").and.callThrough();
    const shape = runtime._previous[0].shaped;
    const layouts = [...runtime._tileLayouts.values()][0];
    const filter = spyOn(
      layer.style._compiled.get("labels").filter,
      "filter",
    ).and.callThrough();
    for (let i = 0; i < 3; i++) {
      scene.renderForSpecs();
    }
    expect(upload).not.toHaveBeenCalled();
    expect(request.calls.count()).toBe(1);
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
    spyOn(Resource.prototype, "fetchArrayBuffer").and.callFake(function () {
      if (this.url.includes("0-255")) {
        return new Promise((resolve) => {
          complete = resolve;
        });
      }
      return Promise.resolve(encodeGlyphs([glyph(256)]));
    });
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
    ).toThrowError(RuntimeError);
    assets.destroy();
    owner._workers.destroy();
  });
});
