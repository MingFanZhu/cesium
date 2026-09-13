import {
  Cartesian2,
  Cartesian3,
  Color,
  Resource,
  RuntimeError,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
} from "../../../index.js";
import Assets from "../../../Source/SceneGIS/Scene/_private/_SceneGISVectorSymbolAssets.js";
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
    for (let i = 0; i < 3; i++) {
      scene.renderForSpecs();
    }
    expect(upload).not.toHaveBeenCalled();
    expect(request.calls.count()).toBe(1);
    scene.camera.position.x = 1;
    scene.renderForSpecs();
    expect(runtime._previous[0].shaped).toBe(shape);
    expect([...runtime._groups.values()][0].command).toBe(command);
    expect([...runtime._pickIds.values()][0]).toBe(pickId);
    scene.primitives.remove(layer);
    expect(va.isDestroyed()).toBeTrue();
    expect(atlas.isDestroyed()).toBeTrue();
    expect(pickId.object).toBeUndefined();
    expect(world.isDestroyed()).toBeFalse();
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
  });
});
