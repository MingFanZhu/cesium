import Lerc from "lerc";
import Credit from "../../../Source/Core/Credit.js";
import Request from "../../../Source/Core/Request.js";
import Resource from "../../../Source/Core/Resource.js";
import SceneGISPlanarCoordinateSystem from "../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarHeightmapTerrainData from "../../../Source/SceneGIS/Core/SceneGISPlanarHeightmapTerrainData.js";
import SceneGISPlanarTilingScheme from "../../../Source/SceneGIS/Core/SceneGISPlanarTilingScheme.js";
import SceneGISPlanarUrlTemplateHeightmapTerrainProvider from "../../../Source/SceneGIS/Core/SceneGISPlanarUrlTemplateHeightmapTerrainProvider.js";
import SceneGISPlanarWorld from "../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";

describe("SceneGIS/Core/SceneGISPlanarUrlTemplateHeightmapTerrainProvider", function () {
  function createTilingScheme(options = {}) {
    const limit = options.limit ?? 128.0;
    return new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -limit,
          minimumY: -limit,
          maximumX: limit,
          maximumY: limit,
        }),
        crs: options.crs,
      }),
    });
  }

  function createOptions(overrides = {}) {
    return {
      url: "https://{s}.example.test/{z}/{x}/{y}",
      tilingScheme: createTilingScheme(),
      maximumLevel: 4,
      heightmapWidth: 3,
      heightmapHeight: 3,
      minimumHeight: -1000.0,
      maximumHeight: 9000.0,
      format: "lerc",
      ...overrides,
    };
  }

  function createLercResult(overrides = {}) {
    return {
      width: 3,
      height: 3,
      pixels: [new Float32Array([8, 7, 6, 5, 4, 3, 2, 1, 0])],
      mask: null,
      statistics: [{ minValue: 0, maxValue: 8 }],
      ...overrides,
    };
  }

  it("publishes an immutable structural provider and owns Resource and subdomain inputs", function () {
    const resource = new Resource({
      url: "https://{s}.example.test/{z}/{x}/{y}",
      queryParameters: { token: "local" },
      headers: { "X-Test": "kept" },
    });
    const subdomains = ["a", "b"];
    const tilingScheme = createTilingScheme();
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider({
      ...createOptions(),
      url: resource,
      tilingScheme,
      subdomains,
      credit: "Local terrain",
      levelZeroMaximumGeometricError: 12.0,
    });
    resource.url = "https://changed.invalid";
    subdomains[0] = "changed";

    expect(provider.tilingScheme).toBe(tilingScheme);
    expect(provider.minimumHeight).toBe(-1000.0);
    expect(provider.maximumHeight).toBe(9000.0);
    expect(provider.maximumLevel).toBe(4);
    expect(provider.heightmapWidth).toBe(3);
    expect(provider.heightmapHeight).toBe(3);
    expect(provider.format).toBe("lerc");
    expect(provider.urlScheme).toBe("xyz");
    expect(provider.credit).toBeInstanceOf(Credit);
    expect(provider.errorEvent.numberOfListeners).toBe(0);
    expect(provider.url).toContain("example.test");
    expect(provider.getLevelMaximumGeometricError(2)).toBe(3.0);
    expect(function () {
      provider.maximumLevel = 8;
    }).toThrowError(TypeError);
  });

  it("derives its default error from the sparser sample axis", function () {
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions({ heightmapWidth: 5, heightmapHeight: 3 }),
    );
    expect(provider.getLevelMaximumGeometricError(0)).toBe(32.0);
    expect(provider.getLevelMaximumGeometricError(4)).toBe(2.0);
  });

  it("expands arbitrary xyz and tms templates with Request identity and owned subdomains", async function () {
    const calls = [];
    spyOn(Resource.prototype, "fetchArrayBuffer").and.callFake(function () {
      calls.push({ url: this.url, request: this.request });
      return Promise.resolve(new ArrayBuffer(1));
    });
    spyOn(Lerc, "decode").and.returnValue(createLercResult());
    const request = new Request();
    const xyz = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions({
        url: "https://{s}.test/{y}/{x}/{z}?fixed=yes",
        subdomains: ["a", "b", "c"],
      }),
    );
    await xyz.requestTileGeometry(2, 3, 2, request);
    expect(calls[0].url).toContain("https://c.test/3/2/2");
    expect(calls[0].url).toContain("fixed=yes");
    expect(calls[0].request).toBe(request);

    const tms = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions({
        url: "https://test/{z}/{x}/{y}",
        urlScheme: "tms",
      }),
    );
    await tms.requestTileGeometry(2, 3, 2, new Request());
    expect(calls[1].url).toBe("https://test/2/2/0");
  });

  it("returns undefined when Resource scheduling defers a request", function () {
    spyOn(Resource.prototype, "fetchArrayBuffer").and.returnValue(undefined);
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions(),
    );
    expect(
      provider.requestTileGeometry(0, 0, 0, new Request()),
    ).toBeUndefined();
  });

  it("decodes north-first RGBA image samples and closes the image exactly once", async function () {
    const image = document.createElement("canvas");
    image.width = 2;
    image.height = 2;
    const context = image.getContext("2d");
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray([
          0, 0, 10, 255, 0, 0, 20, 255, 0, 0, 30, 255, 0, 0, 40, 255,
        ]),
        2,
        2,
      ),
      0,
      0,
    );
    image.close = jasmine.createSpy("close");
    const fetchImage = spyOn(Resource.prototype, "fetchImage").and.resolveTo(
      image,
    );
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions({
        format: "image",
        heightmapWidth: 2,
        heightmapHeight: 2,
        structure: {
          elementsPerHeight: 3,
          stride: 4,
          elementMultiplier: 256,
          isBigEndian: true,
        },
      }),
    );
    const data = await provider.requestTileGeometry(0, 0, 0, new Request());

    expect(fetchImage.calls.mostRecent().args[0]).toEqual({
      preferImageBitmap: true,
      skipColorSpaceConversion: true,
    });
    expect(data).toBeInstanceOf(SceneGISPlanarHeightmapTerrainData);
    expect(data._getSample(0, 0)).toBe(10);
    expect(data._getSample(0, 1)).toBe(20);
    expect(data._getSample(1, 0)).toBe(30);
    expect(data._getSample(1, 1)).toBe(40);
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it("closes image payloads once when dimensions or decoded heights fail", async function () {
    const firstImage = {
      width: 1,
      height: 2,
      close: jasmine.createSpy("dimensionClose"),
    };
    const images = [firstImage, document.createElement("canvas")];
    images[1].width = 2;
    images[1].height = 2;
    images[1]
      .getContext("2d")
      .putImageData(
        new ImageData(
          new Uint8ClampedArray([
            255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
          ]),
          2,
          2,
        ),
        0,
        0,
      );
    images[1].close = jasmine.createSpy("decodeClose");
    spyOn(Resource.prototype, "fetchImage").and.callFake(() =>
      Promise.resolve(images.shift()),
    );
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions({
        format: "image",
        heightmapWidth: 2,
        heightmapHeight: 2,
        minimumHeight: -100,
        maximumHeight: 100,
        structure: { elementsPerHeight: 1, stride: 4 },
      }),
    );
    await expectAsync(
      provider.requestTileGeometry(0, 0, 0, new Request()),
    ).toBeRejected();
    expect(firstImage.close).toHaveBeenCalledTimes(1);
    const secondImage = images[0];
    await expectAsync(
      provider.requestTileGeometry(0, 0, 0, new Request()),
    ).toBeRejected();
    expect(secondImage.close).toHaveBeenCalledTimes(1);
  });

  it("decodes one valid finite LERC band without copying its TypedArray", async function () {
    const samples = new Float64Array([8, 7, 6, 5, 4, 3, 2, 1, 0]);
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      new ArrayBuffer(1),
    );
    spyOn(Lerc, "decode").and.returnValue(
      createLercResult({ pixels: [samples] }),
    );
    const credit = new Credit("Local terrain");
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions({ credit }),
    );
    const data = await provider.requestTileGeometry(0, 0, 0, new Request());
    expect(data._buffer).toBe(samples);
    expect(data.minimumHeight).toBe(0);
    expect(data.maximumHeight).toBe(8);
    expect(data.isChildAvailable(0, 0, 0, 1)).toBe(true);
    expect(provider.credit).toBe(credit);
    expect(data.credits).toBeUndefined();
  });

  it("rejects invalid LERC bands, dimensions, masks, statistics, NoData, and samples", async function () {
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      new ArrayBuffer(1),
    );
    const decode = spyOn(Lerc, "decode");
    const invalidResults = [
      createLercResult({ pixels: [] }),
      createLercResult({ width: 4 }),
      createLercResult({ pixels: [new Float32Array(8)] }),
      createLercResult({ mask: new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1]) }),
      createLercResult({ statistics: [{ minValue: Number.NaN, maxValue: 8 }] }),
      createLercResult({
        statistics: [{ minValue: 0, maxValue: 8, noDataValue: 4 }],
      }),
      createLercResult({
        pixels: [new Float32Array([8, 7, 6, 5, 4, 3, 2, 1, Number.NaN])],
      }),
      createLercResult({
        pixels: [new Float32Array([10000, 7, 6, 5, 4, 3, 2, 1, 0])],
        statistics: [{ minValue: 0, maxValue: 10000 }],
      }),
    ];
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions(),
    );
    for (const result of invalidResults) {
      decode.and.returnValue(result);
      await expectAsync(
        provider.requestTileGeometry(0, 0, 0, new Request()),
      ).toBeRejected();
    }
  });

  it("reports a full pyramid with exact child masks", async function () {
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      new ArrayBuffer(1),
    );
    spyOn(Lerc, "decode").and.returnValue(createLercResult());
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions({ maximumLevel: 2 }),
    );
    expect(provider.getTileDataAvailable(0, 0, 0)).toBe(true);
    expect(provider.getTileDataAvailable(3, 3, 2)).toBe(true);
    expect(provider.getTileDataAvailable(0, 0, 3)).toBe(false);
    expect(provider.loadTileDataAvailability(0, 0, 3)).toBeUndefined();
    const intermediate = await provider.requestTileGeometry(
      0,
      0,
      1,
      new Request(),
    );
    const leaf = await provider.requestTileGeometry(0, 0, 2, new Request());
    expect(intermediate.isChildAvailable(0, 0, 0, 1)).toBe(true);
    expect(leaf.isChildAvailable(0, 0, 0, 1)).toBe(false);
  });

  it("rejects invalid construction and programmer tile addresses before fetch", function () {
    const fetch = spyOn(Resource.prototype, "fetchArrayBuffer");
    const fetchImage = spyOn(Resource.prototype, "fetchImage");
    const valid = createOptions();
    for (const options of [
      { ...valid, url: undefined },
      { ...valid, tilingScheme: {} },
      { ...valid, maximumLevel: -1 },
      { ...valid, heightmapWidth: 1 },
      { ...valid, heightmapHeight: 2.5 },
      { ...valid, minimumHeight: Number.NaN },
      { ...valid, maximumHeight: valid.minimumHeight - 1 },
      { ...valid, format: "quantized-mesh" },
      { ...valid, urlScheme: "quadkey" },
      { ...valid, subdomains: [] },
      { ...valid, credit: {} },
      { ...valid, structure: {} },
      { ...valid, levelZeroMaximumGeometricError: -1 },
      { ...valid, format: "image", structure: undefined },
      {
        ...valid,
        format: "image",
        structure: { elementsPerHeight: 3, stride: 3 },
      },
      {
        ...valid,
        format: "image",
        structure: {
          elementsPerHeight: 1,
          stride: 4,
          heightScale: Number.POSITIVE_INFINITY,
        },
      },
      {
        ...valid,
        format: "image",
        structure: {
          elementsPerHeight: 1,
          stride: 4,
          heightOffset: Number.NaN,
        },
      },
      {
        ...valid,
        format: "image",
        structure: {
          elementsPerHeight: 1,
          stride: 4,
          elementMultiplier: 0,
        },
      },
      {
        ...valid,
        format: "image",
        structure: {
          elementsPerHeight: 1,
          stride: 4,
          isBigEndian: 1,
        },
      },
      {
        ...valid,
        format: "image",
        heightmapWidth: Number.MAX_SAFE_INTEGER,
        heightmapHeight: 2,
        structure: { elementsPerHeight: 1, stride: 4 },
      },
    ]) {
      expect(function () {
        return new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(options);
      }).toThrowDeveloperError();
    }

    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      valid,
    );
    for (const address of [
      [-1, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 5],
      [0.5, 0, 1],
    ]) {
      expect(function () {
        provider.requestTileGeometry(...address, new Request());
      }).toThrowDeveloperError();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it("preserves synchronous fetch throws, promise rejection, and decode causes", async function () {
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions(),
    );
    const fetch = spyOn(Resource.prototype, "fetchArrayBuffer");
    const syncError = new Error("sync fetch");
    fetch.and.throwError(syncError);
    expect(function () {
      provider.requestTileGeometry(0, 0, 0, new Request());
    }).toThrow(syncError);

    const networkError = new Error("network");
    fetch.and.returnValue(Promise.reject(networkError));
    await expectAsync(
      provider.requestTileGeometry(0, 0, 0, new Request()),
    ).toBeRejectedWith(networkError);

    const decodeError = new Error("decode");
    fetch.and.resolveTo(new ArrayBuffer(1));
    spyOn(Lerc, "decode").and.throwError(decodeError);
    await expectAsync(
      provider.requestTileGeometry(0, 0, 0, new Request()),
    ).toBeRejectedWith(decodeError);
    expect(provider.maximumLevel).toBe(4);
  });

  it("closes a fetched image when pixel extraction throws", async function () {
    const image = {
      width: 2,
      height: 2,
      close: jasmine.createSpy("close"),
    };
    spyOn(Resource.prototype, "fetchImage").and.resolveTo(image);
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions({
        format: "image",
        heightmapWidth: 2,
        heightmapHeight: 2,
        structure: { elementsPerHeight: 1, stride: 4 },
      }),
    );
    await expectAsync(
      provider.requestTileGeometry(0, 0, 0, new Request()),
    ).toBeRejected();
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it("composes with an EPSG:3857 world without reading its CRS", async function () {
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      new ArrayBuffer(1),
    );
    spyOn(Lerc, "decode").and.returnValue(createLercResult());
    const webMercatorLimit = 20037508.342789244;
    const tilingScheme = createTilingScheme({
      limit: webMercatorLimit,
      crs: "EPSG:3857",
    });
    const provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
      createOptions({
        tilingScheme,
        maximumLevel: 4,
        levelZeroMaximumGeometricError: 1000.0,
      }),
    );
    const world = new SceneGISPlanarWorld({
      coordinateSystem: tilingScheme.coordinateSystem,
      maximumLevel: 4,
    });
    expect(function () {
      world.terrainProvider = provider;
    }).toThrowDeveloperError();
    expect(world.terrainProvider).toBeUndefined();
    expect(world.tilingScheme).not.toBe(tilingScheme);

    const canonicalProvider =
      new SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
        createOptions({
          tilingScheme: world.tilingScheme,
          maximumLevel: 4,
          levelZeroMaximumGeometricError: 1000.0,
        }),
      );
    world.terrainProvider = canonicalProvider;
    expect(world.terrainProvider).toBe(canonicalProvider);
    expect(canonicalProvider.tilingScheme.coordinateSystem.crs).toBe(
      "EPSG:3857",
    );
    const terrainData = await canonicalProvider.requestTileGeometry(
      0,
      0,
      0,
      new Request(),
    );
    expect(
      terrainData.interpolateHeight(world.coordinateSystem.extent, 0.0, 0.0),
    ).toBe(4.0);
    world.destroy();
  });
});
