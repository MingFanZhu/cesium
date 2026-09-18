import {
  CesiumTerrainProvider,
  Request,
  Resource,
  RuntimeError,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarLayerTerrainProvider,
  SceneGISPlanarTilingScheme,
  SceneGISPlanarWorld,
} from "../../../index.js";

describe("SceneGIS/Core/SceneGISPlanarLayerTerrainProvider", function () {
  function metadata(mesh = false) {
    const profile = mesh
      ? "scenegis-planar-quantized-mesh-v2"
      : "scenegis-planar-heightmap-rgb24-v2";
    return {
      format: profile,
      version: "2.0.0",
      scheme: "slippyMap",
      tiles: [
        mesh
          ? "{z}/{y}/{x}.terrain?v={version}"
          : "{z}/{y}/{x}.png?v={version}",
      ],
      minzoom: 0,
      maxzoom: 1,
      available: [
        [{ startX: 0, startY: 0, endX: 0, endY: 0 }],
        [{ startX: 1, startY: 1, endX: 1, endY: 1 }],
      ],
      attribution: "Terrain producer",
      scenegis: {
        profile,
        unit: "metre",
        verticalTransform: false,
        logicalMaxLevel: 1,
        coordinateSpace: {
          role: "private",
          id: "test-local",
          unit: "metre",
          axes: ["east", "north", "up"],
          rootRange: [-100, -100, 100, 100],
        },
        grid: { width: 2, height: 2, placement: "posts" },
        heightRange: {
          source: "source-scan-conservative",
          minimum: -100,
          maximum: 100,
        },
        structure: {
          heightScale: 0.2,
          heightOffset: -1677721.6,
          elementsPerHeight: 3,
          stride: 4,
          elementMultiplier: 256,
          isBigEndian: true,
        },
        quantization: { maxError: 0.1 },
        skirt: { minimumDepth: 0.2 },
      },
    };
  }

  function respond(layer) {
    return spyOn(Resource.prototype, "fetchJson").and.resolveTo(layer);
  }

  it("loads metadata before publishing a ready provider and reuses its scheme in a World", async function () {
    respond(metadata());
    const provider = await SceneGISPlanarLayerTerrainProvider.fromUrl(
      "https://terrain.test/data",
    );
    expect(provider.url).toBe("https://terrain.test/data/layer.json");
    expect(provider.maximumLevel).toBe(1);
    expect(provider.minimumHeight).toBe(-100);
    expect(provider.maximumHeight).toBe(100);
    expect(provider.getLevelMaximumGeometricError(1)).toBe(25);
    expect(provider.credit.html).toBe("Terrain producer");
    const world = new SceneGISPlanarWorld({
      tilingScheme: provider.tilingScheme,
      maximumLevel: 1,
    });
    world.terrainProvider = provider;
    expect(world.tilingScheme).toBe(provider.tilingScheme);
    expect(world.coordinateSystem).toBe(provider.tilingScheme.coordinateSystem);
    expect(world.coordinateSystem.extent.minimumX).toBe(-100);
    world.destroy();
    expect(provider.getTileDataAvailable(0, 0, 0)).toBe(true);
  });

  it("preserves Resource credentials, relative URL resolution, version and scheduling defer", async function () {
    respond(metadata());
    let fetched;
    spyOn(Resource.prototype, "fetchImage").and.callFake(function (options) {
      fetched = {
        url: this.url,
        headers: this.headers,
        request: this.request,
        options,
      };
      return undefined;
    });
    const resource = new Resource({
      url: "https://terrain.test/data/layer.json?key=test",
      headers: { Authorization: "fixture" },
    });
    const provider = await SceneGISPlanarLayerTerrainProvider.fromUrl(resource);
    const request = new Request();
    expect(provider.requestTileGeometry(1, 0, 1, request)).toBeUndefined();
    expect(fetched.url).toContain("/data/1/0/1.png?");
    expect(fetched.url).toContain("v=2.0.0");
    expect(fetched.url).toContain("key=test");
    expect(fetched.headers.Authorization).toBe("fixture");
    expect(fetched.request).toBe(request);
    expect(fetched.options.skipColorSpaceConversion).toBe(true);
    expect(resource.url).toBe("https://terrain.test/data/layer.json?key=test");
  });

  it("exposes sparse TMS metadata in canonical XYZ without probing nonexistent tiles", async function () {
    const layer = metadata();
    respond(layer);
    const fetch = spyOn(Resource.prototype, "fetchImage");
    const provider = await SceneGISPlanarLayerTerrainProvider.fromUrl(
      "https://terrain.test/",
    );
    layer.available[1][0].startX = 0;
    expect(provider.getTileDataAvailable(1, 0, 1)).toBe(true);
    expect(provider.getTileDataAvailable(0, 0, 1)).toBe(false);
    expect(provider.getTileDataAvailable(1, 1, 1)).toBe(false);
    expect(provider.getTileDataAvailable(0, 0, 2)).toBe(false);
    expect(provider.loadTileDataAvailability(1, 0, 1)).toBeUndefined();
    await expectAsync(
      provider.requestTileGeometry(1, 1, 1),
    ).toBeRejectedWithError(RuntimeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("converts private TMS availability and URL rows without flipping image samples", async function () {
    const layer = metadata();
    layer.scheme = "tms";
    layer.available[1] = [{ startX: 1, startY: 0, endX: 1, endY: 0 }];
    respond(layer);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(2, 2);
    [10, 20, 30, 40].forEach((height, i) => {
      const value = Math.round(height / 0.2) + 8388608;
      pixels.data.set(
        [value >> 16, (value >> 8) & 255, value & 255, 255],
        i * 4,
      );
    });
    context.putImageData(pixels, 0, 0);
    let fetchedUrl;
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      fetchedUrl = this.url;
      return Promise.resolve(canvas);
    });
    const provider = await SceneGISPlanarLayerTerrainProvider.fromUrl(
      "https://terrain.test/",
    );
    expect(provider.getTileDataAvailable(1, 1, 1)).toBe(true);
    expect(provider.getTileDataAvailable(1, 0, 1)).toBe(false);
    const data = await provider.requestTileGeometry(1, 1, 1);
    expect(fetchedUrl).toContain("/1/0/1.png");
    expect(data).toBeInstanceOf(SceneGISPlanarHeightmapTerrainData);
    const extent = provider.tilingScheme.tileXYToExtent(1, 1, 1);
    expect(
      data.interpolateHeight(extent, extent.minimumX, extent.maximumY),
    ).toBeCloseTo(10, 7);
    expect(
      data.interpolateHeight(extent, extent.maximumX, extent.minimumY),
    ).toBeCloseTo(40, 7);
  });

  it("matches Cesium TMS availability independently of the tile URL scheme", async function () {
    const fetch = respond(metadata());
    for (const scheme of ["tms", "slippyMap"]) {
      const layer = metadata();
      layer.scheme = scheme;
      layer.available[1] = [{ startX: 1, startY: 1, endX: 1, endY: 1 }];
      fetch.and.resolveTo(layer);
      const planar = await SceneGISPlanarLayerTerrainProvider.fromUrl(
        "https://terrain.test/planar/",
      );
      fetch.and.resolveTo({
        ...layer,
        format: "quantized-mesh-1.0",
        projection: "EPSG:3857",
      });
      const globe = await CesiumTerrainProvider.fromUrl(
        "https://terrain.test/globe/",
      );
      expect(globe.getTileDataAvailable(1, 0, 1)).toBe(true);
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          expect(planar.getTileDataAvailable(x, y, 1))
            .withContext(`${scheme} availability at ${x}/${y}`)
            .toBe(globe.getTileDataAvailable(x, y, 1));
        }
      }
    }
  });

  it("requires honest global mesh bounds and preserves a quantization error floor", async function () {
    const layer = metadata(true);
    delete layer.scenegis.heightRange;
    respond(layer);
    await expectAsync(
      SceneGISPlanarLayerTerrainProvider.fromUrl("https://terrain.test/"),
    ).toBeRejectedWithError(RuntimeError, /global height range/);
    const provider = await SceneGISPlanarLayerTerrainProvider.fromUrl(
      "https://terrain.test/",
      {
        minimumHeight: -200,
        maximumHeight: 300,
        levelZeroMaximumGeometricError: 0,
      },
    );
    expect(provider.minimumHeight).toBe(-200);
    expect(provider.getLevelMaximumGeometricError(1)).toBe(0.1);
    let accept;
    spyOn(Resource.prototype, "fetchArrayBuffer").and.callFake(function () {
      accept = this.headers.Accept;
      return undefined;
    });
    expect(provider.requestTileGeometry(0, 0, 0)).toBeUndefined();
    expect(accept).toContain("application/vnd.quantized-mesh");
  });

  it("uses published global mesh bounds when present", async function () {
    const layer = metadata(true);
    layer.scenegis.heightRange = {
      source: "source-scan-conservative",
      minimum: -12,
      maximum: 98,
    };
    respond(layer);
    const provider = await SceneGISPlanarLayerTerrainProvider.fromUrl(
      "https://terrain.test/",
    );
    expect(provider.minimumHeight).toBe(-12);
    expect(provider.maximumHeight).toBe(98);
  });

  it("reuses a matching existing world scheme without treating the private id as a CRS", async function () {
    respond(metadata());
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -100,
          minimumY: -100,
          maximumX: 100,
          maximumY: 100,
        }),
        crs: "LOCAL",
      }),
      maximumLevel: 1,
    });
    const provider = await SceneGISPlanarLayerTerrainProvider.fromUrl(
      "https://terrain.test/",
      { tilingScheme: world.tilingScheme },
    );
    expect(provider.tilingScheme).toBe(world.tilingScheme);
    world.terrainProvider = provider;
    world.destroy();
  });

  it("rejects unsupported metadata before any terrain request", async function () {
    const fetch = respond(metadata());
    const images = spyOn(Resource.prototype, "fetchImage");
    const buffers = spyOn(Resource.prototype, "fetchArrayBuffer");
    const invalid = [
      (layer) => {
        layer.format = "unsupported-format";
        layer.scenegis.profile = layer.format;
      },
      (layer) => {
        layer.scheme = "xyz";
      },
      (layer) => {
        layer.format = "quantized-mesh-1.0";
        layer.projection = "EPSG:3857";
      },
      (layer) => {
        layer.parentUrl = "../parent";
      },
      (layer) => {
        layer.metadataAvailability = 10;
      },
      (layer) => {
        layer.maxzoom = 2;
      },
      (layer) => {
        layer.available[0] = [];
      },
      (layer) => {
        layer.available[1][0].endY = 2;
      },
      (layer) => {
        layer.scenegis.coordinateSpace.rootRange[3] = 101;
      },
      (layer) => {
        layer.scenegis.coordinateSpace.axes = ["north", "east", "up"];
      },
      (layer) => {
        layer.scenegis.grid.placement = "pixels";
      },
      (layer) => {
        layer.scenegis.structure.isBigEndian = false;
      },
      (layer) => {
        layer.scenegis.heightRange.minimum = null;
      },
    ];
    for (const mutate of invalid) {
      const layer = metadata();
      mutate(layer);
      fetch.and.resolveTo(layer);
      await expectAsync(
        SceneGISPlanarLayerTerrainProvider.fromUrl("https://terrain.test/"),
      ).toBeRejectedWithError(RuntimeError);
    }
    expect(images).not.toHaveBeenCalled();
    expect(buffers).not.toHaveBeenCalled();
  });

  it("rejects mismatched extents and contradictory World coordinate identity", async function () {
    respond(metadata());
    const coordinateSystem = new SceneGISPlanarCoordinateSystem({
      extent: new SceneGISPlanarExtent({
        minimumX: 0,
        minimumY: 0,
        maximumX: 200,
        maximumY: 200,
      }),
    });
    const tilingScheme = new SceneGISPlanarTilingScheme({ coordinateSystem });
    await expectAsync(
      SceneGISPlanarLayerTerrainProvider.fromUrl("https://terrain.test/", {
        tilingScheme,
      }),
    ).toBeRejectedWithError(RuntimeError, /rootRange/);
    const other = new SceneGISPlanarCoordinateSystem({
      extent: coordinateSystem.extent,
    });
    expect(
      () =>
        new SceneGISPlanarWorld({
          coordinateSystem: other,
          tilingScheme,
          maximumLevel: 1,
        }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISPlanarWorld({
          coordinateSystem,
          tilingScheme: {},
          maximumLevel: 1,
        }),
    ).toThrowDeveloperError();
  });

  it("propagates metadata request failures without guessing a fallback format", async function () {
    spyOn(Resource.prototype, "fetchJson").and.rejectWith(
      new RuntimeError("HTTP failure"),
    );
    await expectAsync(
      SceneGISPlanarLayerTerrainProvider.fromUrl("https://terrain.test/"),
    ).toBeRejectedWithError(RuntimeError, "HTTP failure");
  });
});
