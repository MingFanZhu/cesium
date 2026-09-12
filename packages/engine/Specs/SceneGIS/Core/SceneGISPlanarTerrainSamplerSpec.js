import {
  Cartesian3,
  RequestType,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarQuantizedMeshTerrainData,
  SceneGISPlanarTerrainSampler,
  SceneGISPlanarTilingScheme,
} from "../../../index.js";

describe("SceneGIS/Core/SceneGISPlanarTerrainSampler", function () {
  function createProvider(options = {}) {
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
    const raised = jasmine.createSpy("raised");
    const provider = {
      tilingScheme,
      minimumHeight: -100.0,
      maximumHeight: 100.0,
      maximumLevel: 2,
      errorEvent: {
        addEventListener: function () {},
        raiseEvent: raised,
      },
      credit: undefined,
      getLevelMaximumGeometricError: (level) => 4.0 / 2 ** level,
      requestTileGeometry:
        options.requestTileGeometry ??
        ((x, y) =>
          Promise.resolve({
            minimumHeight: x + y,
            maximumHeight: x + y,
            interpolateHeight: () => x + y,
          })),
      getTileDataAvailable: options.getTileDataAvailable ?? (() => undefined),
      loadTileDataAvailability:
        options.loadTileDataAvailability ?? (() => undefined),
    };
    return { provider, raised };
  }

  it("is a non-instantiable namespace and preflights every position before requests", function () {
    const fixture = createProvider();
    spyOn(fixture.provider, "requestTileGeometry").and.callThrough();
    expect(typeof SceneGISPlanarTerrainSampler).toBe("object");
    expect(() =>
      SceneGISPlanarTerrainSampler.sampleAtLevel(fixture.provider, 1, [
        new Cartesian3(0, 0, 0),
        new Cartesian3(Number.NaN, 0, 0),
      ]),
    ).toThrowDeveloperError();
    expect(fixture.provider.requestTileGeometry).not.toHaveBeenCalled();
    expect(() =>
      SceneGISPlanarTerrainSampler.sampleAtLevel(fixture.provider, 3, []),
    ).toThrowDeveloperError();
    expect(() =>
      SceneGISPlanarTerrainSampler.sampleAtLevel(
        { ...fixture.provider, tilingScheme: {} },
        0,
        [],
      ),
    ).toThrowDeveloperError();
  });

  it("groups unique tiles, restores order, and leaves positions unchanged", async function () {
    const fixture = createProvider();
    const calls = [];
    fixture.provider.requestTileGeometry = (x, y, level, request) => {
      calls.push({ x, y, level, request });
      const height = x * 10 + y;
      return Promise.resolve({
        minimumHeight: height,
        maximumHeight: height,
        interpolateHeight: () => height,
      });
    };
    const positions = [
      new Cartesian3(-96, 96, 7),
      new Cartesian3(96, -96, 8),
      new Cartesian3(-64, 64, 9),
      new Cartesian3(200, 0, 10),
    ];
    const copies = positions.map((position) => Cartesian3.clone(position));

    const heights = await SceneGISPlanarTerrainSampler.sampleAtLevel(
      fixture.provider,
      1,
      positions,
    );

    expect(heights).toEqual([0, 11, 0, undefined]);
    expect(calls.length).toBe(2);
    expect(
      calls.every((call) => call.request.type === RequestType.TERRAIN),
    ).toBe(true);
    expect(calls[0].request).not.toBe(calls[1].request);
    expect(positions).toEqual(copies);
    expect(fixture.raised).not.toHaveBeenCalled();
  });

  it("uses availability once and never requests known unavailable tiles", async function () {
    let metadataCalls = 0;
    let available;
    const fixture = createProvider({
      getTileDataAvailable: () => available,
      loadTileDataAvailability: () => {
        ++metadataCalls;
        available = false;
        return Promise.resolve();
      },
    });
    spyOn(fixture.provider, "requestTileGeometry").and.callThrough();

    expect(
      await SceneGISPlanarTerrainSampler.sampleAtLevel(fixture.provider, 0, [
        new Cartesian3(0, 0, 0),
        new Cartesian3(10, 10, 0),
      ]),
    ).toEqual([undefined, undefined]);
    expect(metadataCalls).toBe(1);
    expect(fixture.provider.requestTileGeometry).not.toHaveBeenCalled();
  });

  it("delays a scheduler-deferred unique tile without busy polling", async function () {
    jasmine.clock().install();
    let calls = 0;
    const fixture = createProvider({
      requestTileGeometry: () => {
        ++calls;
        if (calls === 1) {
          return undefined;
        }
        return Promise.resolve({
          minimumHeight: 12,
          maximumHeight: 12,
          interpolateHeight: () => 12,
        });
      },
    });
    try {
      const promise = SceneGISPlanarTerrainSampler.sampleAtLevel(
        fixture.provider,
        0,
        [new Cartesian3(0, 0, 0)],
      );
      expect(calls).toBe(1);
      jasmine.clock().tick(99);
      await Promise.resolve();
      expect(calls).toBe(1);
      jasmine.clock().tick(1);
      await Promise.resolve();
      await Promise.resolve();
      expect(calls).toBe(2);
      expect(await promise).toEqual([12]);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("isolates tile failures by default and optionally rejects", async function () {
    const fixture = createProvider({
      requestTileGeometry: (x) => {
        if (x === 0) {
          throw new Error("tile failed");
        }
        return Promise.resolve({
          minimumHeight: 9,
          maximumHeight: 9,
          interpolateHeight: () => 9,
        });
      },
    });
    const positions = [new Cartesian3(-96, 96, 1), new Cartesian3(96, 96, 2)];
    expect(
      await SceneGISPlanarTerrainSampler.sampleAtLevel(
        fixture.provider,
        1,
        positions,
      ),
    ).toEqual([undefined, 9]);
    await expectAsync(
      SceneGISPlanarTerrainSampler.sampleAtLevel(
        fixture.provider,
        1,
        positions,
        true,
      ),
    ).toBeRejectedWithError("tile failed");
    expect(fixture.raised).not.toHaveBeenCalled();
  });

  it("treats invalid data and interpolation as tile-local failures", async function () {
    const fixture = createProvider({
      requestTileGeometry: () =>
        Promise.resolve({
          minimumHeight: -200,
          maximumHeight: 0,
          interpolateHeight: () => Number.NaN,
        }),
    });
    expect(
      await SceneGISPlanarTerrainSampler.sampleAtLevel(fixture.provider, 0, [
        new Cartesian3(0, 0, 0),
      ]),
    ).toEqual([undefined]);
  });

  it("commits all samples for a tile atomically", async function () {
    const fixture = createProvider({
      requestTileGeometry: (x) => {
        let sample = 0;
        return Promise.resolve({
          minimumHeight: 7,
          maximumHeight: 9,
          interpolateHeight: () => {
            if (x === 0 && ++sample === 2) {
              return Number.NaN;
            }
            return x === 0 ? 7 : 9;
          },
        });
      },
    });
    const positions = [
      new Cartesian3(-96, 96, 1),
      new Cartesian3(-64, 64, 2),
      new Cartesian3(96, 96, 3),
    ];
    const copies = positions.map((position) => Cartesian3.clone(position));

    expect(
      await SceneGISPlanarTerrainSampler.sampleAtLevel(
        fixture.provider,
        1,
        positions,
      ),
    ).toEqual([undefined, undefined, 9]);
    await expectAsync(
      SceneGISPlanarTerrainSampler.sampleAtLevel(
        fixture.provider,
        1,
        positions,
        true,
      ),
    ).toBeRejectedWithDeveloperError();
    expect(positions).toEqual(copies);
  });

  it("samples a quantized irregular triangle without a World cache", async function () {
    const fixture = createProvider({
      requestTileGeometry: () =>
        Promise.resolve(
          new SceneGISPlanarQuantizedMeshTerrainData({
            quantizedVertices: new Uint16Array([
              0, 32767, 0, 32767, 0, 0, 32767, 32767, 0, 32767, 16384, 8192,
            ]),
            indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
            westIndices: new Uint16Array([0, 2]),
            southIndices: new Uint16Array([1, 0]),
            eastIndices: new Uint16Array([3, 1]),
            northIndices: new Uint16Array([2, 3]),
            quantizedMinimumHeight: -10.0,
            quantizedMaximumHeight: 40.0,
          }),
        ),
    });

    expect(
      await SceneGISPlanarTerrainSampler.sampleAtLevel(fixture.provider, 0, [
        new Cartesian3(-128.0, -128.0, 999.0),
      ]),
    ).toEqual([-10.0]);
  });
});
