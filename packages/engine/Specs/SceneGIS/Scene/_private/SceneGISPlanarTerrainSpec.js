import {
  Event,
  RequestType,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarTilingScheme,
} from "../../../../index.js";
import SceneGISPlanarTerrain, {
  validateTerrainProvider,
} from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarTerrain.js";
import SceneGISPlanarTile from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarTile.js";

describe("SceneGIS/Scene/SceneGISPlanarTerrain", function () {
  function createFixture(options = {}) {
    const tilingScheme = new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
      }),
    });
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-10.0, 10.0, 20.0, 40.0]),
      width: 2,
      height: 2,
    });
    const provider = {
      tilingScheme,
      minimumHeight: -10.0,
      maximumHeight: 40.0,
      maximumLevel: 2,
      errorEvent: options.errorEvent ?? new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: (level) => 4.0 / 2 ** level,
      requestTileGeometry:
        options.requestTileGeometry ?? (() => Promise.resolve(data)),
      getTileDataAvailable: options.getTileDataAvailable ?? (() => undefined),
      loadTileDataAvailability: () => undefined,
    };
    const tile = new SceneGISPlanarTile(tilingScheme, 0, 0, 0);
    return { tilingScheme, data, provider, tile };
  }

  it("preflights the canonical provider and effective geometric errors", function () {
    const fixture = createFixture();
    expect(
      validateTerrainProvider(fixture.provider, fixture.tilingScheme, 2),
    ).toEqual([4.0, 2.0, 1.0]);
    expect(() =>
      validateTerrainProvider(
        { ...fixture.provider, tilingScheme: {} },
        fixture.tilingScheme,
        2,
      ),
    ).toThrowDeveloperError();
    expect(() =>
      validateTerrainProvider(
        { ...fixture.provider, maximumLevel: 1 },
        fixture.tilingScheme,
        2,
      ),
    ).toThrowDeveloperError();
  });

  it("requests lazily with RequestType.TERRAIN and advances only to RECEIVED asynchronously", async function () {
    let request;
    const fixture = createFixture({
      requestTileGeometry: (x, y, level, value) => {
        request = value;
        return Promise.resolve(fixture.data);
      },
    });
    const runtime = new SceneGISPlanarTerrain((callback) =>
      callback(fixture.tile),
    );
    runtime.setProvider(
      fixture.provider,
      validateTerrainProvider(fixture.provider, fixture.tilingScheme, 2),
    );

    runtime.prepare(undefined, [fixture.tile], 1);
    expect(request.type).toBe(RequestType.TERRAIN);
    expect(fixture.tile.terrainEntry.state).toBe(runtime.State.LOADING);
    await Promise.resolve();
    expect(fixture.tile.terrainEntry.state).toBe(runtime.State.RECEIVED);
    expect(runtime.tilesLoaded).toBe(false);
    runtime.destroy();
  });

  it("settles known-unavailable tiles without raising provider errors", function () {
    const fixture = createFixture({ getTileDataAvailable: () => false });
    const listener = jasmine.createSpy("listener");
    fixture.provider.errorEvent.addEventListener(listener);
    const runtime = new SceneGISPlanarTerrain((callback) =>
      callback(fixture.tile),
    );
    runtime.setProvider(
      fixture.provider,
      validateTerrainProvider(fixture.provider, fixture.tilingScheme, 2),
    );
    runtime.prepare(undefined, [fixture.tile], 1);

    expect(fixture.tile.terrainEntry.state).toBe(runtime.State.FAILED);
    expect(fixture.tile.terrainEntry.knownUnavailable).toBe(true);
    expect(runtime.tilesLoaded).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    runtime.destroy();
  });

  it("keeps scheduler-deferred requests unloaded and retries on a later frame", function () {
    let calls = 0;
    const fixture = createFixture({
      requestTileGeometry: () => {
        ++calls;
        return undefined;
      },
    });
    const runtime = new SceneGISPlanarTerrain((callback) =>
      callback(fixture.tile),
    );
    runtime.setProvider(
      fixture.provider,
      validateTerrainProvider(fixture.provider, fixture.tilingScheme, 2),
    );
    runtime.prepare(undefined, [fixture.tile], 1);
    runtime.prepare(undefined, [fixture.tile], 1);
    expect(calls).toBe(1);
    expect(fixture.tile.terrainEntry.state).toBe(runtime.State.UNLOADED);
    runtime.prepare(undefined, [fixture.tile], 2);
    expect(calls).toBe(2);
    runtime.destroy();
  });

  it("reports unsupported resolved terrain through the provider error event", async function () {
    const listener = jasmine.createSpy("listener");
    const fixture = createFixture({
      requestTileGeometry: () => Promise.resolve({}),
    });
    fixture.provider.errorEvent.addEventListener(listener);
    const runtime = new SceneGISPlanarTerrain((callback) =>
      callback(fixture.tile),
    );
    runtime.setProvider(
      fixture.provider,
      validateTerrainProvider(fixture.provider, fixture.tilingScheme, 2),
    );
    runtime.prepare(undefined, [fixture.tile], 1);
    await Promise.resolve();
    runtime.prepare(undefined, [fixture.tile], 2);
    expect(fixture.tile.terrainEntry.state).toBe(runtime.State.FAILED);
    expect(listener).toHaveBeenCalledOnceWith(jasmine.any(Object));
    runtime.destroy();
  });

  it("retries structural provider errors on the next normal frame and isolates stale results", async function () {
    let calls = 0;
    let resolveLate;
    const event = {
      listeners: [],
      addEventListener(listener) {
        this.listeners.push(listener);
      },
      raiseEvent(error) {
        for (const listener of this.listeners) {
          listener(error);
        }
      },
    };
    event.addEventListener((error) => {
      error.retry = true;
    });
    const fixture = createFixture({
      errorEvent: event,
      requestTileGeometry: () => {
        ++calls;
        if (calls === 1) {
          throw new Error("retry");
        }
        return new Promise((resolve) => {
          resolveLate = resolve;
        });
      },
    });
    const runtime = new SceneGISPlanarTerrain((callback) =>
      callback(fixture.tile),
    );
    runtime.setProvider(
      fixture.provider,
      validateTerrainProvider(fixture.provider, fixture.tilingScheme, 2),
    );
    runtime.prepare(undefined, [fixture.tile], 1);
    expect(calls).toBe(1);
    expect(fixture.tile.terrainEntry.state).toBe(runtime.State.UNLOADED);
    runtime.prepare(undefined, [fixture.tile], 1);
    expect(calls).toBe(1);
    runtime.prepare(undefined, [fixture.tile], 2);
    expect(calls).toBe(2);
    runtime.setProvider(undefined, undefined);
    resolveLate(fixture.data);
    await Promise.resolve();
    expect(fixture.tile.terrainEntry).toBeUndefined();
    runtime.destroy();
  });
});
