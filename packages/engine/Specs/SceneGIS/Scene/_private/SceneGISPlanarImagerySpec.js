import {
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarTilingScheme,
  SceneGISPlanarWebMapTileServiceImageryProvider,
  Resource,
} from "../../../../index.js";
import Event from "../../../../Source/Core/Event.js";
import TileProviderError from "../../../../Source/Core/TileProviderError.js";
import SceneGISPlanarImagery from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarImagery.js";

describe("SceneGIS/Scene/SceneGISPlanarImagery", function () {
  function createProvider(requestImage, options = {}) {
    const tilingScheme = new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: 0,
          minimumY: 0,
          maximumX: 1,
          maximumY: 1,
        }),
      }),
    });
    return {
      tilingScheme,
      minimumLevel: 0,
      maximumLevel: 1,
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: true,
      errorEvent: options.errorEvent ?? new Event(),
      credit: undefined,
      requestImage,
    };
  }

  function createStructuralEvent() {
    const listeners = [];
    return {
      addEventListener: function (listener) {
        listeners.push(listener);
        return function () {
          const index = listeners.indexOf(listener);
          if (index !== -1) {
            listeners.splice(index, 1);
          }
        };
      },
      raiseEvent: function (error) {
        for (const listener of listeners.slice()) {
          listener(error);
        }
      },
    };
  }

  it("keeps undefined requests unloaded for a later normal frame", function () {
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValue(undefined);
    const layer = new SceneGISPlanarImageryLayer(createProvider(requestImage));
    const tiles = [{ x: 0, y: 0, level: 0, imageryBindings: new Map() }];
    const imagery = new SceneGISPlanarImagery({}, (callback) =>
      tiles.forEach(callback),
    );
    imagery.prepare({}, tiles, [layer], 1);
    expect(requestImage).toHaveBeenCalledTimes(1);
    expect(imagery.tilesLoaded).toBe(false);
    imagery.prepare({}, tiles, [layer], 2);
    expect(requestImage).toHaveBeenCalledTimes(2);
    imagery.destroy();
    layer.destroy();
  });

  it("reloads every layer sharing a provider on the next normal frame and closes stale images", async function () {
    const resolves = [];
    const provider = new SceneGISPlanarWebMapTileServiceImageryProvider({
      url: "https://wmts.test/",
      layer: "image",
      style: "default",
      tileMatrixSetID: "local",
      tilingScheme: createProvider(() => undefined).tilingScheme,
      maximumLevel: 0,
      tileWidth: 1,
      tileHeight: 1,
      dimensions: { time: "first" },
    });
    spyOn(Resource.prototype, "fetchImage").and.callFake(
      () => new Promise((resolve) => resolves.push(resolve)),
    );
    const layers = [
      new SceneGISPlanarImageryLayer(provider),
      new SceneGISPlanarImageryLayer(provider),
    ];
    const tile = { x: 0, y: 0, level: 0 };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));
    imagery.prepare({}, [tile], layers, 1);
    const old = layers.map((layer) => tile.imageryBindings.get(layer));
    expect(provider._reloadEvent.numberOfListeners).toBe(2);
    provider.dimensions = { time: "second" };
    expect(tile.imageryBindings.get(layers[0])).toBe(old[0]);
    imagery.prepare({}, [tile], layers, 2);
    expect(tile.imageryBindings.get(layers[0])).not.toBe(old[0]);
    expect(imagery._debug.cancelledRequests).toBe(2);
    expect(provider._reloadEvent.numberOfListeners).toBe(2);
    const images = resolves.map(() => ({
      width: 1,
      height: 1,
      close: jasmine.createSpy("close"),
    }));
    resolves[0](images[0]);
    resolves[1](images[1]);
    await Promise.resolve();
    expect(images[0].close).toHaveBeenCalledTimes(1);
    expect(images[1].close).toHaveBeenCalledTimes(1);
    imagery.destroy();
    expect(provider._reloadEvent.numberOfListeners).toBe(0);
    resolves[2](images[2]);
    resolves[3](images[3]);
    await Promise.resolve();
    expect(images[2].close).toHaveBeenCalledTimes(1);
    expect(images[3].close).toHaveBeenCalledTimes(1);
    layers.forEach((layer) => layer.destroy());
  });

  it("cancels released requests and isolates stale completion", async function () {
    let resolve;
    const promise = new Promise((value) => {
      resolve = value;
    });
    const provider = createProvider(() => promise);
    const errorListener = jasmine.createSpy("errorListener");
    provider.errorEvent.addEventListener(errorListener);
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0, imageryBindings: new Map() };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));
    imagery.prepare({}, [tile], [layer], 1);
    const entry = tile.imageryBindings.get(layer).desired;
    imagery.releaseLayer(layer);
    expect(entry.request).toBeUndefined();
    expect(imagery._debug.cancelledRequests).toBe(1);

    const image = { width: 1, height: 1, close: jasmine.createSpy("close") };
    resolve(image);
    await Promise.resolve();
    await Promise.resolve();
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(errorListener).not.toHaveBeenCalled();
    expect(imagery._runtimes.size).toBe(0);
    imagery.destroy();
    layer.destroy();
  });

  it("reports provider failure with retry metadata", async function () {
    const failure = new Error("fixture failure");
    const provider = createProvider(() => Promise.reject(failure));
    const errors = [];
    provider.errorEvent.addEventListener((error) => errors.push(error));
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0, imageryBindings: new Map() };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));
    imagery.prepare({}, [tile], [layer], 1);
    await Promise.resolve();
    await Promise.resolve();
    expect(errors.length).toBe(1);
    expect(errors[0].x).toBe(0);
    expect(errors[0].y).toBe(0);
    expect(errors[0].level).toBe(0);
    expect(errors[0].error).toBe(failure);
    expect(tile.imageryBindings.get(layer).desired.state).toBe(
      imagery.State.FAILED,
    );
    imagery.destroy();
    layer.destroy();
  });

  it("retries only on a later normal frame when the error listener requests it", async function () {
    let secondResolve;
    const secondPromise = new Promise((resolve) => {
      secondResolve = resolve;
    });
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValues(Promise.reject(new Error("retry me")), secondPromise);
    const provider = createProvider(requestImage);
    provider.errorEvent.addEventListener((error) => {
      error.retry = true;
    });
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0, imageryBindings: new Map() };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));
    imagery.prepare({}, [tile], [layer], 1);
    await Promise.resolve();
    await Promise.resolve();
    expect(requestImage).toHaveBeenCalledTimes(1);
    expect(tile.imageryBindings.get(layer).desired.state).toBe(
      imagery.State.UNLOADED,
    );
    imagery.prepare({}, [tile], [layer], 2);
    expect(requestImage).toHaveBeenCalledTimes(2);
    expect(tile.imageryBindings.get(layer).desired.state).toBe(
      imagery.State.LOADING,
    );
    imagery.destroy();
    secondResolve({ width: 1, height: 1 });
    await Promise.resolve();
    layer.destroy();
  });

  it("reports and retries through an add/raise-only structural event", async function () {
    const structuralEvent = createStructuralEvent();
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValues(
        Promise.reject(new Error("structural retry")),
        undefined,
      );
    const provider = createProvider(requestImage, {
      errorEvent: structuralEvent,
    });
    const errors = [];
    structuralEvent.addEventListener((error) => {
      errors.push(error);
      error.retry = true;
    });
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0 };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));

    imagery.prepare({}, [tile], [layer], 1);
    await Promise.resolve();
    await Promise.resolve();
    expect(errors.length).toBe(1);
    expect(errors[0].provider).toBe(provider);
    expect(errors[0].x).toBe(0);
    expect(errors[0].y).toBe(0);
    expect(errors[0].level).toBe(0);
    expect(tile.imageryBindings.get(layer).desired.state).toBe(
      imagery.State.UNLOADED,
    );
    expect(requestImage).toHaveBeenCalledTimes(1);

    imagery.prepare({}, [tile], [layer], 2);
    expect(requestImage).toHaveBeenCalledTimes(2);
    imagery.destroy();
    layer.destroy();
  });

  it("ignores extra numberOfListeners metadata on a structural event", async function () {
    const structuralEvent = createStructuralEvent();
    structuralEvent.numberOfListeners = 0;
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValues(
        Promise.reject(new Error("structural retry")),
        undefined,
      );
    const provider = createProvider(requestImage, {
      errorEvent: structuralEvent,
    });
    const errors = [];
    structuralEvent.addEventListener((error) => {
      errors.push(error);
      error.retry = true;
    });
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0 };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));

    imagery.prepare({}, [tile], [layer], 1);
    await Promise.resolve();
    await Promise.resolve();
    expect(errors.length).toBe(1);
    expect(errors[0]).toBeInstanceOf(TileProviderError);
    expect(errors[0].provider).toBe(provider);
    expect(tile.imageryBindings.get(layer).desired.state).toBe(
      imagery.State.UNLOADED,
    );
    expect(requestImage).toHaveBeenCalledTimes(1);

    imagery.prepare({}, [tile], [layer], 2);
    expect(requestImage).toHaveBeenCalledTimes(2);
    imagery.destroy();
    layer.destroy();
  });

  it("reports synchronous provider throws without escaping prepare", function () {
    const failure = new Error("synchronous failure");
    const provider = createProvider(() => {
      throw failure;
    });
    const errors = [];
    provider.errorEvent.addEventListener((error) => errors.push(error));
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0 };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));

    expect(() => imagery.prepare({}, [tile], [layer], 1)).not.toThrow();
    expect(errors.length).toBe(1);
    expect(errors[0].error).toBe(failure);
    expect(tile.imageryBindings.get(layer).desired.state).toBe(
      imagery.State.FAILED,
    );
    imagery.destroy();
    layer.destroy();
  });

  it("isolates a stale rejection after its layer is released", async function () {
    let rejectRequest;
    const provider = createProvider(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    const listener = jasmine.createSpy("listener");
    provider.errorEvent.addEventListener(listener);
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0 };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));

    imagery.prepare({}, [tile], [layer], 1);
    imagery.releaseLayer(layer);
    rejectRequest(new Error("stale rejection"));
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
    expect(imagery._runtimes.size).toBe(0);
    imagery.destroy();
    layer.destroy();
  });

  it("reports upload failure and closes the received image once", async function () {
    const image = { width: 1, height: 1, close: jasmine.createSpy("close") };
    const provider = createProvider(() => Promise.resolve(image));
    const errors = [];
    provider.errorEvent.addEventListener((error) => errors.push(error));
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0 };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));

    imagery.prepare({}, [tile], [layer], 1);
    await Promise.resolve();
    await Promise.resolve();
    imagery.prepare({}, [tile], [layer], 2);
    expect(errors.length).toBe(1);
    expect(tile.imageryBindings.get(layer).desired.state).toBe(
      imagery.State.FAILED,
    );
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(imagery._debug.createdTextures).toBe(0);
    imagery.destroy();
    layer.destroy();
  });

  it("reports success after a retried request resolves", async function () {
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValues(
        Promise.reject(new Error("first failure")),
        Promise.resolve({ width: 1, height: 1 }),
      );
    const provider = createProvider(requestImage);
    provider.errorEvent.addEventListener((error) => {
      error.retry = true;
    });
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0 };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));

    imagery.prepare({}, [tile], [layer], 1);
    await Promise.resolve();
    await Promise.resolve();
    imagery.prepare({}, [tile], [layer], 2);
    await Promise.resolve();
    await Promise.resolve();
    expect(imagery._runtimes.get(layer).error.timesRetried).toBe(-1);
    expect(tile.imageryBindings.get(layer).desired.state).toBe(
      imagery.State.RECEIVED,
    );
    imagery.destroy();
    layer.destroy();
  });

  it("preserves real Event zero-listener reporting behavior", function () {
    const provider = createProvider(() => {
      throw new Error("unobserved failure");
    });
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0 };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));
    spyOn(console, "log");

    imagery.prepare({}, [tile], [layer], 1);
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(tile.imageryBindings.get(layer).desired.state).toBe(
      imagery.State.FAILED,
    );
    imagery.destroy();
    layer.destroy();
  });

  it("isolates caches for two layers sharing one provider", function () {
    const provider = createProvider(() => undefined);
    const firstLayer = new SceneGISPlanarImageryLayer(provider);
    const secondLayer = new SceneGISPlanarImageryLayer(provider);
    const tile = { x: 0, y: 0, level: 0 };
    const imagery = new SceneGISPlanarImagery({}, (callback) => callback(tile));

    imagery.prepare({}, [tile], [firstLayer, secondLayer], 1);
    const firstEntry = tile.imageryBindings.get(firstLayer).desired;
    const secondEntry = tile.imageryBindings.get(secondLayer).desired;
    expect(firstEntry).not.toBe(secondEntry);
    expect(imagery._runtimes.size).toBe(2);
    imagery.releaseLayer(firstLayer);
    expect(imagery._runtimes.has(firstLayer)).toBe(false);
    expect(imagery._runtimes.has(secondLayer)).toBe(true);
    expect(tile.imageryBindings.has(secondLayer)).toBe(true);

    imagery.destroy();
    firstLayer.destroy();
    secondLayer.destroy();
  });

  it("shares capped ancestor entries and releases them at the last reference", function () {
    const requestImage = jasmine
      .createSpy("requestImage")
      .and.returnValue(undefined);
    const provider = createProvider(requestImage);
    provider.maximumLevel = 0;
    const layer = new SceneGISPlanarImageryLayer(provider);
    const tiles = [
      { x: 0, y: 0, level: 1, imageryBindings: new Map() },
      { x: 1, y: 0, level: 1, imageryBindings: new Map() },
    ];
    const imagery = new SceneGISPlanarImagery({}, (callback) =>
      tiles.forEach(callback),
    );
    imagery.prepare({}, tiles, [layer], 1);
    expect(requestImage).toHaveBeenCalledTimes(1);
    const runtime = imagery._runtimes.get(layer);
    const root = runtime.entries.get("0/0/0");
    expect(root.references).toBe(2);
    imagery.releaseTile(tiles[0]);
    expect(root.references).toBe(1);
    expect(runtime.entries.get("0/0/0")).toBe(root);
    imagery.releaseTile(tiles[1]);
    expect(runtime.entries.has("0/0/0")).toBe(false);
    imagery.destroy();
    layer.destroy();
  });
});
