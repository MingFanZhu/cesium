import {
  Cartesian2,
  Cartesian3,
  Color,
  SceneTransforms,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
  SceneGISVectorTileStyle,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISVectorTileLayer", function () {
  let scene;
  let world;
  let source;

  function setup(size = 1024, pixels = 64) {
    scene = createScene({ canvas: createCanvas(pixels, pixels) });
    scene.frameState.scene3DOnly = true;
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -size / 2,
          minimumY: -size / 2,
          maximumX: size / 2,
          maximumY: size / 2,
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
  }

  beforeEach(function () {
    setup();
  });

  afterEach(function () {
    scene.destroyForSpecs();
  });

  function feature(type, parts, id = "7", properties = {}) {
    return {
      type,
      id,
      properties,
      geometry: {
        parts: parts.map((part) => new Float64Array(part)),
        polygonStarts: type === 3 ? new Uint32Array([0]) : new Uint32Array(),
      },
    };
  }

  function data(features) {
    return { layers: [{ name: "data", version: 2, extent: 4096, features }] };
  }
  function definition(type, paint = {}, id = type) {
    return { id, type, source: "test", "source-layer": "data", paint };
  }
  function style(layers) {
    return {
      version: 8,
      sources: {
        test: {
          type: "vector",
          tiles: ["https://example.invalid/{z}/{x}/{y}"],
          maxzoom: 0,
        },
      },
      layers,
    };
  }
  function add(layers, options = {}) {
    return scene.primitives.add(
      new SceneGISVectorTileLayer({
        scene,
        style: style(layers),
        sources: { test: source },
        ...options,
      }),
    );
  }
  async function loaded(layer) {
    await pollToPromise(function () {
      scene.renderForSpecs();
      return layer.ready && layer.tilesLoaded;
    });
    expect(layer.statistics.failedTiles).toBe(0);
  }
  function read(x = 0, y = 0) {
    scene.renderForSpecs();
    const windowPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(x, y, 0),
    );
    const color = Array.from(
      scene.context.readPixels({
        x: Math.floor(windowPosition.x),
        y: scene.canvas.height - 1 - Math.floor(windowPosition.y),
        width: 1,
        height: 1,
      }),
    );
    return { color, pick: scene.pick(windowPosition) };
  }
  function polygon() {
    return feature(3, [[1888, 1888, 2208, 1888, 2208, 2208, 1888, 2208]]);
  }

  it("publishes a complete tile only after bounded batch uploads and leaves Worker completions CPU-only", async function () {
    const decoded = data([polygon()]);
    spyOn(source, "requestTile").and.resolveTo(decoded);
    const layer = add(
      [
        definition(
          "fill",
          { "fill-color": "red", "fill-antialias": false },
          "base",
        ),
        definition(
          "fill",
          { "fill-color": "blue", "fill-antialias": false },
          "overlay",
        ),
      ],
      { maximumUploadBytesPerFrame: 1 },
    );
    const schedule = spyOn(layer._workers, "schedule").and.callThrough();
    scene.renderForSpecs();
    await Promise.resolve();
    scene.renderForSpecs();
    const entry = layer._sources.get("test").visible[0];
    await schedule.calls.mostRecent().returnValue;
    expect(entry.work.result).toBeDefined();
    expect(entry.batches.size).toBe(0);
    expect(layer.statistics.uploads).toBe(0);
    const work = entry.work;
    scene.renderForSpecs();
    expect(work.cursor).toBe(1);
    expect(entry.signature).toBeUndefined();
    expect(layer._drawOrder.length).toBe(0);
    expect(layer.tilesLoaded).toBeFalse();
    scene.renderForSpecs();
    expect(layer.tilesLoaded).toBeTrue();
    expect(read().color).toEqual([0, 0, 255, 255]);
    expect(
      decoded.layers[0].features[0].geometry.parts[0].byteLength,
    ).toBeGreaterThan(0);
  });

  it("discards a hidden tile's active Worker result and destroys partially uploaded resources", async function () {
    spyOn(source, "requestTile").and.resolveTo(data([polygon()]));
    const layer = add(
      [
        definition("fill", { "fill-antialias": false }, "base"),
        definition("fill", { "fill-antialias": false }, "overlay"),
      ],
      { maximumUploadBytesPerFrame: 1 },
    );
    const schedule = spyOn(layer._workers, "schedule").and.callThrough();
    scene.renderForSpecs();
    await Promise.resolve();
    scene.renderForSpecs();
    const entry = layer._sources.get("test").visible[0];
    const pending = schedule.calls.mostRecent().returnValue;
    layer.show = false;
    scene.renderForSpecs();
    await pending;
    expect(entry.work).toBeUndefined();
    expect(entry.signature).toBeUndefined();
    layer.show = true;
    scene.renderForSpecs();
    await schedule.calls.mostRecent().returnValue;
    scene.renderForSpecs();
    const resource = entry.work.batches.get("base")[0]._resources;
    layer.show = false;
    scene.renderForSpecs();
    expect(resource.isDestroyed()).toBeTrue();
    expect(entry.work).toBeUndefined();
    expect(layer.statistics.preparationTasks).toBe(0);
  });

  function streaming() {
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: world.tilingScheme,
      maximumLevel: 1,
    });
    const pending = new Map();
    spyOn(source, "requestTile").and.callFake(
      (x, y, level, request) =>
        new Promise((resolve, reject) => {
          pending.set(`${level}/${x}/${y}`, { resolve, reject, request });
        }),
    );
    return pending;
  }
  function whole(id, color = "#ff0000") {
    return data([
      feature(3, [[-4096, -4096, 8192, -4096, 8192, 8192, -4096, 8192]], id, {
        color,
      }),
    ]);
  }

  it("keeps perspective style scale and forward map coverage through a shallow orbit", async function () {
    spyOn(source, "requestTile").and.resolveTo(whole("ground"));
    const layer = add([definition("fill", { "fill-color": "red" })]);
    await loaded(layer);
    const zoom = layer.statistics.zoom;
    const range = 80;
    for (const degrees of [45, 5]) {
      const pitch = (degrees * Math.PI) / 180;
      scene.camera.position = new Cartesian3(
        0,
        -range * Math.cos(pitch),
        range * Math.sin(pitch),
      );
      scene.camera.direction = new Cartesian3(
        0,
        Math.cos(pitch),
        -Math.sin(pitch),
      );
      scene.camera.up = new Cartesian3(0, Math.sin(pitch), Math.cos(pitch));
      await loaded(layer);
      expect(layer.statistics.zoom).toEqualEpsilon(zoom, 1e-12);
      for (const y of [40, 56]) {
        const windowPosition = new Cartesian2(32, y);
        const color = Array.from(
          scene.context.readPixels({ x: 32, y: 63 - y, width: 1, height: 1 }),
        );
        expect(color).toEqual([255, 0, 0, 255]);
        expect(scene.pick(windowPosition).id.featureId).toBe("ground");
        scene.renderForSpecs();
      }
    }
    scene.camera.direction = new Cartesian3(0, 1, 0);
    scene.camera.up = new Cartesian3(0, 0, 1);
    scene.renderForSpecs();
    expect(layer.statistics.visibleTiles).toBe(0);
    expect(layer.statistics.drawCommands).toBe(0);
  });

  it("refines nearby perspective tiles within budget while preserving distant coverage and single alpha", async function () {
    scene.destroyForSpecs();
    setup(65536, 128);
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: world.tilingScheme,
      maximumLevel: 8,
    });
    spyOn(source, "requestTile").and.callFake((x, y, level) =>
      Promise.resolve(whole(`${level}/${x}/${y}`)),
    );
    const pitch = (5 * Math.PI) / 180;
    scene.camera.position = new Cartesian3(
      5000,
      5000 - 80 * Math.cos(pitch),
      80 * Math.sin(pitch),
    );
    scene.camera.direction = new Cartesian3(
      0,
      Math.cos(pitch),
      -Math.sin(pitch),
    );
    scene.camera.up = new Cartesian3(0, Math.sin(pitch), Math.cos(pitch));
    scene.camera.frustum.far = 100000;
    const layer = add(
      [definition("fill", { "fill-color": "red", "fill-opacity": 0.5 })],
      {
        maximumVisibleTiles: 64,
        tileCacheSize: 128,
      },
    );
    await loaded(layer);
    const state = [...layer._sources.values()][0];
    expect(state.visible.length).toBeLessThanOrEqual(64);
    const levels = state.visible.map((tile) => tile.level);
    expect(Math.max(...levels)).toBe(8);
    expect(Math.min(...levels)).toBeLessThan(6);
    for (const a of state.visible) {
      for (const b of state.visible) {
        if (a === b || a.level > b.level) {
          continue;
        }
        const scale = 2 ** (b.level - a.level);
        expect(
          a.x === Math.floor(b.x / scale) && a.y === Math.floor(b.y / scale),
        ).toBeFalse();
      }
    }
    const pickedLevels = [];
    for (const y of [55, 110]) {
      scene.renderForSpecs();
      expect(
        Array.from(
          scene.context.readPixels({ x: 64, y: 127 - y, width: 1, height: 1 }),
        ),
      ).toEqual([128, 0, 0, 255]);
      pickedLevels.push(scene.pick(new Cartesian2(64, y)).id.tile.level);
    }
    expect(pickedLevels[1]).toBeGreaterThan(pickedLevels[0]);
  });

  it("clears coverage and cancels replacements when the camera has no planar scale", async function () {
    const pending = streaming();
    const layer = add([definition("fill")], {
      maximumVisibleTiles: 4,
      tileCacheSize: 8,
    });
    scene.renderForSpecs();
    pending.get("0/0/0").resolve(whole("parent"));
    await loaded(layer);
    scene.camera.position.z = 40;
    scene.renderForSpecs();
    const stale = Array.from(pending.values()).slice(1);
    expect(layer.statistics.fallbackTiles).toBe(1);
    expect(layer.statistics.pendingRequests).toBe(4);
    scene.camera.position.z = 0;
    scene.renderForSpecs();
    const cleared = layer.statistics;
    expect(cleared.visibleTiles).toBe(0);
    expect(cleared.renderedTiles).toBe(0);
    expect(cleared.renderRegions).toBe(0);
    expect(cleared.drawCommands).toBe(0);
    expect(cleared.pendingRequests).toBe(0);
    expect(layer.tilesLoaded).toBeTrue();
    for (const completion of stale) {
      expect(completion.request.cancelled).toBeTrue();
      completion.resolve(whole("stale"));
    }
    await Promise.resolve();
    scene.camera.position.z = 40;
    scene.renderForSpecs();
    expect(layer.statistics.uploads).toBe(1);
    expect(layer.statistics.fallbackTiles).toBe(1);
    expect(layer.statistics.pendingRequests).toBe(4);
    expect(source.requestTile.calls.count()).toBe(9);
  });

  it("replaces ancestor regions individually without double alpha, retaining failure and clearing empty children", async function () {
    const pending = streaming();
    const layer = add(
      [
        definition(
          "fill",
          { "fill-color": ["get", "color"], "fill-opacity": 0.5 },
          "base",
        ),
        definition(
          "fill",
          { "fill-color": "#00ff00", "fill-opacity": 0.5 },
          "overlay",
        ),
      ],
      { maximumVisibleTiles: 4, tileCacheSize: 8 },
    );
    const errors = [];
    layer.errorEvent.addEventListener((event) => errors.push(event));
    scene.renderForSpecs();
    pending.get("0/0/0").resolve(whole("parent"));
    await loaded(layer);
    const parent = layer._drawOrder[0];
    const va = parent._resources._vertexArrays[0];
    scene.camera.position.z = 40;
    scene.renderForSpecs();
    expect(layer.statistics.fallbackTiles).toBe(1);
    expect(layer.statistics.renderRegions).toBe(4);
    expect(layer.tilesLoaded).toBeFalse();
    expect(
      new Set(parent.renderCommands.map((command) => command.uniformMap)).size,
    ).toBe(4);
    expect(
      parent.renderCommands.every((command) => command.vertexArray === va),
    ).toBeTrue();
    expect(read(-10, 10).color).toEqualEpsilon([64, 128, 0, 255], 1);
    pending.get("1/0/0").resolve(whole("child", "#0000ff"));
    await pollToPromise(() => {
      scene.renderForSpecs();
      return layer._sources.get("test").entries.get("1/0/0").state === "ready";
    });
    const child = read(-10, 10);
    expect(child.color).toEqualEpsilon([0, 128, 64, 255], 1);
    expect(child.pick?.id.featureId).toBe("child");
    expect(child.pick?.id.styleLayer).toBe("overlay");
    expect(read(10, 10).color).toEqualEpsilon([64, 128, 0, 255], 1);
    expect(read(10, 10).pick?.id.tile.level).toBe(0);
    expect(parent._resources._vertexArrays[0]).toBe(va);
    pending.get("1/1/0").resolve({ layers: [] });
    pending.get("1/0/1").reject(new Error("deliberate child failure"));
    pending.get("1/1/1").resolve(whole("southeast", "#0000ff"));
    await pollToPromise(() => {
      scene.renderForSpecs();
      return layer.tilesLoaded;
    });
    expect(read(10, 10).color).toEqual([0, 0, 0, 255]);
    expect(read(10, 10).pick?.primitive).not.toBe(layer);
    expect(read(-10, -10).color).toEqualEpsilon([64, 128, 0, 255], 1);
    expect(read(10, -10).color).toEqualEpsilon([0, 128, 64, 255], 1);
    expect(layer.tilesLoaded).toBeTrue();
    expect(layer.statistics.failedTiles).toBe(1);
    expect(errors.length).toBe(1);
    expect(layer.statistics.fallbackTiles).toBe(1);
    const uploads = layer.statistics.uploads;
    const command = parent.renderCommands[0];
    scene.pick(new Cartesian2(20, 40));
    if (scene.pickPositionSupported) {
      scene.pickPosition(new Cartesian2(20, 40));
    }
    scene.renderForSpecs();
    expect(parent.renderCommands[0]).toBe(command);
    expect(layer.statistics.uploads).toBe(uploads);
    expect(source.requestTile.calls.count()).toBe(5);
    layer.show = false;
    scene.renderForSpecs();
    expect(layer.statistics.renderRegions).toBe(0);
    layer.show = true;
    scene.renderForSpecs();
    expect(layer.statistics.fallbackTiles).toBe(1);
    expect(source.requestTile.calls.count()).toBe(5);
    scene.primitives.remove(layer);
    expect(va.isDestroyed()).toBeTrue();
  });

  it("retains disjoint descendants during zoom-out and atomically accepts an empty parent", async function () {
    const pending = streaming();
    scene.camera.position.z = 40;
    const layer = add(
      [definition("fill", { "fill-color": "#0000ff", "fill-opacity": 0.5 })],
      { maximumVisibleTiles: 4, tileCacheSize: 8 },
    );
    scene.renderForSpecs();
    for (const completion of pending.values()) {
      completion.resolve(whole("child"));
    }
    await loaded(layer);
    scene.camera.position.z = 80;
    scene.renderForSpecs();
    expect(layer.statistics.fallbackTiles).toBe(4);
    expect(layer.statistics.renderRegions).toBe(4);
    expect(layer.tilesLoaded).toBeFalse();
    expect(read().color).toEqualEpsilon([0, 0, 128, 255], 1);
    pending.get("0/0/0").resolve({ layers: [] });
    await loaded(layer);
    expect(layer.statistics.renderedTiles).toBe(1);
    expect(layer.statistics.fallbackTiles).toBe(0);
    expect(layer.statistics.drawCommands).toBe(0);
    expect(read().color).toEqual([0, 0, 0, 255]);
    scene.camera.position.z = 40;
    scene.renderForSpecs();
    expect(layer.tilesLoaded).toBeTrue();
    expect(read().color).toEqualEpsilon([0, 0, 128, 255], 1);
    expect(source.requestTile.calls.count()).toBe(5);
  });

  it("respects a cache with no fallback slots and cancels late child requests on view replacement", async function () {
    const pending = streaming();
    const layer = add([definition("fill")], {
      maximumVisibleTiles: 4,
      tileCacheSize: 4,
    });
    scene.renderForSpecs();
    pending.get("0/0/0").resolve(whole("parent"));
    await loaded(layer);
    const parent = layer._drawOrder[0]._resources;
    scene.camera.position.z = 40;
    scene.renderForSpecs();
    expect(layer.statistics.residentTiles).toBe(4);
    expect(layer.statistics.fallbackTiles).toBe(0);
    expect(parent.isDestroyed()).toBeTrue();
    const child = pending.get("1/0/0");
    scene.camera.position.z = 80;
    scene.renderForSpecs();
    expect(child.request.cancelled).toBeTrue();
    child.resolve(whole("stale"));
    await Promise.resolve();
    scene.renderForSpecs();
    expect(layer.statistics.drawCommands).toBe(0);
    expect(layer.statistics.uploads).toBe(1);
  });

  it("updates fractional line paint in place and rebuilds only the layer whose round-join envelope grows", async function () {
    const request = spyOn(source, "requestTile").and.resolveTo(
      data([
        polygon(),
        feature(2, [[1500, 2048, 2048, 2048, 2600, 1800]], "road"),
      ]),
    );
    const line = definition("line", {
      "line-width": ["interpolate", ["linear"], ["zoom"], 0, 4, 4, 20],
      "line-color": ["interpolate", ["linear"], ["zoom"], 0, "red", 4, "blue"],
    });
    line.layout = { "line-join": "round" };
    const layer = add([definition("fill", { "fill-color": "green" }), line]);
    await loaded(layer);
    const entry = [...layer._sources.values()][0].visible[0];
    const fill = entry.batches.get("fill")[0]._resources;
    const road = entry.batches.get("line")[0];
    const resources = road._resources,
      va = resources._vertexArrays[0];
    const pick = resources._pickIds[0];
    const initial = read(-20, 0).color;
    const width = resources._paintAttributes[0].dimensions[0];
    scene.camera.position.z /= 2 ** 0.2;
    await loaded(layer);
    expect(entry.batches.get("line")[0]).toBe(road);
    expect(road._resources._vertexArrays[0]).toBe(va);
    expect(resources._pickIds[0]).toBe(pick);
    expect(resources._paintAttributes[0].dimensions[0]).toBeGreaterThan(width);
    expect(read(-20, 0).color[0]).toBeLessThan(initial[0]);
    expect(read(-20, 0).pick.id.featureId).toBe("road");
    scene.camera.position.z = 20;
    await loaded(layer);
    expect(resources.isDestroyed()).toBeTrue();
    expect(entry.batches.get("fill")[0]._resources).toBe(fill);
    expect(fill.isDestroyed()).toBeFalse();
    expect(request.calls.count()).toBe(1);
    scene.primitives.remove(layer);
    expect(fill.isDestroyed()).toBeTrue();
  });

  it("refreshes camera paint on retained ancestors without rebuilding GPU geometry", async function () {
    const pending = streaming();
    const layer = add(
      [
        definition("fill", {
          "fill-color": "#ff0000",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.2, 4, 1],
        }),
      ],
      { maximumUploadsPerFrame: 1 },
    );
    scene.renderForSpecs();
    pending.get("0/0/0").resolve(whole("parent"));
    await loaded(layer);
    const before = read().color[0];
    const resources = layer._drawOrder[0]._resources;
    scene.camera.position.z = 40;
    scene.renderForSpecs();
    expect(layer.statistics.uploads).toBe(1);
    expect(read().color[0]).toBeGreaterThan(before);
    expect(layer.statistics.uploads).toBe(1);
    expect(layer._drawOrder[0]._resources).toBe(resources);
    for (const [key, completion] of pending) {
      if (key !== "0/0/0") {
        completion.reject(new Error("terminal"));
      }
    }
    await Promise.resolve();
    scene.renderForSpecs();
    expect(layer.tilesLoaded).toBeTrue();
    expect(layer.statistics.failedTiles).toBe(4);
    expect(layer.statistics.fallbackTiles).toBe(1);
  });

  it("validates configuration before requesting or allocating and exposes frozen layer metadata", function () {
    const request = spyOn(source, "requestTile");
    const compiled = new SceneGISVectorTileStyle(style([definition("fill")]));
    expect(Object.isFrozen(compiled.getLayerDefinition("fill"))).toBeTrue();
    expect(() =>
      compiled.getLayerDefinition("missing"),
    ).toThrowDeveloperError();
    expect(() =>
      add([definition("line", { "line-pattern": "unsupported-sprite" })]),
    ).toThrowDeveloperError();
    expect(() =>
      add([definition("fill")], { tileCacheSize: 1, maximumVisibleTiles: 2 }),
    ).toThrowDeveloperError();
    const layer = add([definition("fill")]);
    expect(request).not.toHaveBeenCalled();
    expect(layer.ready).toBeFalse();
    expect(layer.statistics.residentTiles).toBe(0);
  });

  it("renders a tile batch with a polygon hole and preserves feature identity", async function () {
    const polygonWithHole = feature(
      3,
      [
        [1888, 1888, 2208, 1888, 2208, 2208, 1888, 2208],
        [2016, 2016, 2016, 2080, 2080, 2080, 2080, 2016],
      ],
      "18446744073709551615",
      { color: "#ff0000" },
    );
    spyOn(source, "requestTile").and.returnValue(
      Promise.resolve(data([polygonWithHole])),
    );
    const layer = add([
      definition("fill", {
        "fill-color": ["get", "color"],
        "fill-opacity": 0.5,
      }),
    ]);
    const errors = [];
    layer.errorEvent.addEventListener((event) =>
      errors.push(event.error.message),
    );
    await loaded(layer);
    expect(errors).toEqual([]);
    expect(read().color).toEqual([0, 0, 0, 255]);
    const inside = read(-20, 0);
    expect(inside.color[0]).toEqualEpsilon(128, 1);
    expect(inside.pick?.primitive).toBe(layer);
    expect(inside.pick?.id.featureId).toBe("18446744073709551615");
    expect(inside.pick?.id.styleLayer).toBe("fill");
    expect(layer.statistics.drawCommands).toBe(1);
  });

  it("renders at full Mercator scale without losing the clipping ray to float translation", async function () {
    scene.destroyForSpecs();
    const width = 40075016.68557849;
    setup(width, 512);
    scene.camera.position.z = width * 0.64;
    scene.camera.frustum.far = width * 4;
    spyOn(source, "requestTile").and.returnValue(
      Promise.resolve(data([polygon()])),
    );
    const layer = add([
      definition("fill", { "fill-color": "#ff0000", "fill-opacity": 0.5 }),
    ]);
    await loaded(layer);
    const sample = read();
    expect(sample.color[0]).toEqualEpsilon(128, 1);
    expect(sample.pick?.id.featureId).toBe("7");
  });

  it("draws line and stroked circles in style order with pixel dimensions", async function () {
    spyOn(source, "requestTile").and.returnValue(
      Promise.resolve(
        data([
          feature(2, [[1888, 2048, 2208, 2048]], "road"),
          feature(1, [[2048, 2048]], "poi"),
        ]),
      ),
    );
    const layer = add([
      definition("line", { "line-color": "#ff0000", "line-width": 6 }),
      definition("circle", {
        "circle-color": "#0000ff",
        "circle-radius": 5,
        "circle-stroke-color": "#00ff00",
        "circle-stroke-width": 2,
      }),
    ]);
    const errors = [];
    layer.errorEvent.addEventListener((event) =>
      errors.push(event.error.message),
    );
    await loaded(layer);
    expect(errors).toEqual([]);
    const center = read();
    expect(center.color).toEqual([0, 0, 255, 255]);
    expect(center.pick?.id.featureId).toBe("poi");
    expect(read(-20, 0).color).toEqual([255, 0, 0, 255]);
    scene.renderForSpecs();
    expect(
      Array.from(
        scene.context.readPixels({ x: 38, y: 32, width: 1, height: 1 }),
      )[1],
    ).toBeGreaterThan(200);
    expect(layer.statistics.drawCommands).toBe(2);
  });

  it("retains GPU resources across warm frames and pick/depth replay and destroys them on removal", async function () {
    const request = spyOn(source, "requestTile").and.returnValue(
      Promise.resolve(data([polygon()])),
    );
    const layer = add([definition("fill", { "fill-color": "#ff0000" })]);
    await loaded(layer);
    const batch = layer._drawOrder[0];
    const resources = batch._resources;
    const vertexArray = resources._vertexArrays[0];
    const shader = resources._shaderProgram;
    const uploads = layer.statistics.uploads;
    read();
    const command = batch.renderCommands[0];
    const pickCommand = command.derivedCommands.picking.pickCommand;
    expect(command.pickId).toBe("v_pickColor");
    expect(pickCommand.vertexArray).toBe(vertexArray);
    expect(pickCommand.uniformMap).toBe(command.uniformMap);
    expect(command.renderState.blending.enabled).toBeTrue();
    expect(pickCommand.renderState.blending.enabled).toBeFalse();
    expect(pickCommand.renderState.depthTest.enabled).toBeFalse();
    if (scene.pickPositionSupported) {
      scene.pickPosition(new Cartesian2(32, 32));
    }
    for (let i = 0; i < 5; i++) {
      scene.renderForSpecs();
    }
    expect(layer._drawOrder[0]).toBe(batch);
    expect(resources._vertexArrays[0]).toBe(vertexArray);
    expect(resources._shaderProgram).toBe(shader);
    expect(batch.renderCommands[0]).toBe(command);
    expect(command.derivedCommands.picking.pickCommand).toBe(pickCommand);
    expect(layer.statistics.uploads).toBe(uploads);
    expect(request.calls.count()).toBe(1);
    scene.primitives.remove(layer);
    expect(layer.isDestroyed()).toBeTrue();
    expect(resources.isDestroyed()).toBeTrue();
    expect(vertexArray.isDestroyed()).toBeTrue();
    expect(world.isDestroyed()).toBeFalse();
  });

  it("defers throttled requests and reports terminal failures once without retry", async function () {
    const error = new Error("fixture HTTP failure");
    const request = spyOn(source, "requestTile").and.returnValues(
      undefined,
      Promise.reject(error),
    );
    const layer = add([definition("fill")]);
    const listener = jasmine.createSpy("error");
    layer.errorEvent.addEventListener(listener);
    scene.renderForSpecs();
    expect(layer.tilesLoaded).toBeFalse();
    scene.renderForSpecs();
    await Promise.resolve();
    scene.renderForSpecs();
    expect(layer.tilesLoaded).toBeTrue();
    expect(layer.statistics.failedTiles).toBe(1);
    expect(listener.calls.count()).toBe(1);
    expect(listener.calls.first().args[0].error).toBe(error);
    scene.renderForSpecs();
    expect(request.calls.count()).toBe(2);
    expect(listener.calls.count()).toBe(1);
  });

  it("ignores late completion after destruction", async function () {
    let complete;
    let request;
    spyOn(source, "requestTile").and.callFake((x, y, level, inputRequest) => {
      request = inputRequest;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    const layer = add([definition("fill")]);
    scene.renderForSpecs();
    expect(layer.statistics.pendingRequests).toBe(1);
    scene.primitives.remove(layer);
    expect(request.cancelled).toBeTrue();
    complete(data([polygon()]));
    await Promise.resolve();
    expect(layer.isDestroyed()).toBeTrue();
    expect(scene.primitives.length).toBe(0);
  });

  it("clips buffered geometry once at four adjacent tiles and preserves translucent feature order", async function () {
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: world.tilingScheme,
      minimumLevel: 1,
      maximumLevel: 1,
    });
    const whole = [-4096, -4096, 8192, -4096, 8192, 8192, -4096, 8192];
    spyOn(source, "requestTile").and.returnValue(
      Promise.resolve(
        data([
          feature(3, [whole], "red", { color: "#ff0000" }),
          feature(3, [whole], "blue", { color: "#0000ff" }),
        ]),
      ),
    );
    const layer = add([
      definition("fill", {
        "fill-color": ["get", "color"],
        "fill-opacity": 0.5,
      }),
    ]);
    await loaded(layer);
    expect(layer.statistics.visibleTiles).toBe(4);
    expect(layer.statistics.drawCommands).toBe(4);
    for (const [x, y] of [
      [0, 0],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const sample = read(x, y);
      expect(sample.color[0]).toEqualEpsilon(64, 1);
      expect(sample.color[2]).toEqualEpsilon(128, 1);
      expect(sample.pick?.id.featureId).toBe("blue");
    }
  });

  it("bounds requests and uploads and evicts GPU resources when the visible tile changes", async function () {
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: world.tilingScheme,
      minimumLevel: 1,
      maximumLevel: 1,
    });
    const pending = [];
    spyOn(source, "requestTile").and.callFake(
      () => new Promise((resolve) => pending.push(resolve)),
    );
    const layer = add([definition("fill")], {
      maximumRequests: 1,
      maximumUploadsPerFrame: 1,
      maximumVisibleTiles: 4,
      tileCacheSize: 4,
    });
    scene.renderForSpecs();
    expect(pending.length).toBe(1);
    expect(layer.statistics.pendingRequests).toBe(1);
    const activeScene = scene;
    for (let index = 0; index < 4; index++) {
      pending[index](data([polygon()]));
      await pollToPromise(() => {
        const before = layer.statistics.uploads;
        activeScene.renderForSpecs();
        expect(layer.statistics.uploads - before).toBeLessThanOrEqual(1);
        return layer.statistics.uploads === index + 1;
      });
      expect(layer.statistics.uploads).toBe(index + 1);
      expect(layer.statistics.pendingRequests).toBeLessThanOrEqual(1);
    }
    expect(layer.tilesLoaded).toBeTrue();
    scene.primitives.remove(layer);

    scene.camera.position = new Cartesian3(-256, 256, 80);
    source.requestTile.and.returnValue(Promise.resolve(data([polygon()])));
    const one = add([definition("fill")], {
      maximumVisibleTiles: 1,
      tileCacheSize: 1,
    });
    await loaded(one);
    const old = one._drawOrder[0]._resources;
    scene.camera.position = new Cartesian3(256, -256, 80);
    await loaded(one);
    expect(one.statistics.residentTiles).toBe(1);
    expect(old.isDestroyed()).toBeTrue();
  });

  it("reuses decoded data for camera styles and cancels hidden requests without accepting stale results", async function () {
    const request = spyOn(source, "requestTile").and.returnValue(
      Promise.resolve(data([polygon()])),
    );
    const layer = add([
      definition("fill", {
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.25, 3, 1],
        "fill-color": "#ff0000",
      }),
    ]);
    await loaded(layer);
    const original = layer._drawOrder[0]._resources;
    const before = read().color[0];
    scene.camera.position.z /= 2;
    await loaded(layer);
    expect(read().color[0]).toBeGreaterThan(before);
    expect(original.isDestroyed()).toBeFalse();
    expect(layer._drawOrder[0]._resources).toBe(original);
    expect(request.calls.count()).toBe(1);
    scene.primitives.remove(layer);

    expect(original.isDestroyed()).toBeTrue();

    const completions = [];
    const requests = [];
    request.and.callFake((_x, _y, _level, input) => {
      requests.push(input);
      return new Promise((resolve) => completions.push(resolve));
    });
    const hidden = add([definition("fill")]);
    scene.renderForSpecs();
    hidden.show = false;
    scene.renderForSpecs();
    expect(requests[0].cancelled).toBeTrue();
    expect(hidden.statistics.pendingRequests).toBe(0);
    hidden.show = true;
    scene.renderForSpecs();
    completions[0](data([polygon()]));
    await Promise.resolve();
    scene.renderForSpecs();
    expect(hidden.statistics.uploads).toBe(0);
    completions[1](data([polygon()]));
    await loaded(hidden);
    expect(hidden.statistics.uploads).toBe(1);
  });
});
