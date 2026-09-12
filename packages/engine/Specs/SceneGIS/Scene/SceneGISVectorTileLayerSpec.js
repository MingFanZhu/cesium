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

  it("validates configuration before requesting or allocating and exposes frozen layer metadata", function () {
    const request = spyOn(source, "requestTile");
    const compiled = new SceneGISVectorTileStyle(style([definition("fill")]));
    expect(Object.isFrozen(compiled.getLayerDefinition("fill"))).toBeTrue();
    expect(() =>
      compiled.getLayerDefinition("missing"),
    ).toThrowDeveloperError();
    expect(() =>
      add([definition("line", { "line-dasharray": [2, 4] })]),
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
    const primitive = batch.primitive;
    const vertexArray = primitive._va[0];
    const shader = primitive._sp;
    const uploads = layer.statistics.uploads;
    read();
    if (scene.pickPositionSupported) {
      scene.pickPosition(new Cartesian2(32, 32));
    }
    for (let i = 0; i < 5; i++) {
      scene.renderForSpecs();
    }
    expect(layer._drawOrder[0]).toBe(batch);
    expect(primitive._va[0]).toBe(vertexArray);
    expect(primitive._sp).toBe(shader);
    expect(layer.statistics.uploads).toBe(uploads);
    expect(request.calls.count()).toBe(1);
    scene.primitives.remove(layer);
    expect(layer.isDestroyed()).toBeTrue();
    expect(primitive.isDestroyed()).toBeTrue();
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
    for (let index = 0; index < 4; index++) {
      pending[index](data([polygon()]));
      await Promise.resolve();
      scene.renderForSpecs();
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
    const old = one._drawOrder[0].primitive;
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
    const original = layer._drawOrder[0].primitive;
    const before = read().color[0];
    scene.camera.position.z /= 2;
    await loaded(layer);
    expect(read().color[0]).toBeGreaterThan(before);
    expect(original.isDestroyed()).toBeTrue();
    expect(request.calls.count()).toBe(1);
    scene.primitives.remove(layer);

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
