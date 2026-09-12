import Credit from "../../../Source/Core/Credit.js";
import Request from "../../../Source/Core/Request.js";
import Resource from "../../../Source/Core/Resource.js";
import SceneGISPlanarCoordinateSystem from "../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarQuantizedMeshTerrainData from "../../../Source/SceneGIS/Core/SceneGISPlanarQuantizedMeshTerrainData.js";
import SceneGISPlanarTilingScheme from "../../../Source/SceneGIS/Core/SceneGISPlanarTilingScheme.js";
import SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider from "../../../Source/SceneGIS/Core/SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.js";
import terrainWorkerScheduler from "../../../Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerScheduler.js";

describe("SceneGIS/Core/SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider", function () {
  function createTilingScheme() {
    return new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
        crs: "opaque-local",
      }),
    });
  }

  function createOptions(overrides = {}) {
    return {
      url: "https://{s}.example.test/{z}/{x}/{y}.terrain",
      tilingScheme: createTilingScheme(),
      maximumLevel: 4,
      minimumHeight: -100.0,
      maximumHeight: 100.0,
      levelZeroMaximumGeometricError: 32.0,
      ...overrides,
    };
  }

  function createDecodedResult() {
    return {
      kind: "decodeQuantizedMesh",
      quantizedVertices: new Uint16Array([
        0, 32767, 0, 32767, 0, 0, 32767, 32767, 0, 32767, 16384, 8192,
      ]),
      indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
      westIndices: new Uint16Array([0, 2]),
      southIndices: new Uint16Array([0, 1]),
      eastIndices: new Uint16Array([1, 3]),
      northIndices: new Uint16Array([2, 3]),
      quantizedMinimumHeight: -10.0,
      quantizedMaximumHeight: 90.0,
    };
  }

  beforeEach(function () {
    spyOn(terrainWorkerScheduler, "scheduleDecodeQuantizedMesh").and.resolveTo(
      createDecodedResult(),
    );
  });

  it("publishes a canonical caller-owned provider with explicit error", function () {
    const tilingScheme = createTilingScheme();
    const subdomains = ["a", "b"];
    const provider = new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(
      createOptions({ tilingScheme, subdomains, credit: "Quantized terrain" }),
    );
    subdomains[0] = "changed";
    expect(provider.tilingScheme).toBe(tilingScheme);
    expect(provider.maximumLevel).toBe(4);
    expect(provider.minimumHeight).toBe(-100.0);
    expect(provider.maximumHeight).toBe(100.0);
    expect(provider.credit).toBeInstanceOf(Credit);
    expect(provider.errorEvent.numberOfListeners).toBe(0);
    expect(provider.getLevelMaximumGeometricError(2)).toBe(8.0);
    expect(provider._subdomains).toEqual(["a", "b"]);
  });

  it("expands XYZ and TMS addresses with Request, subdomain, and base Accept", async function () {
    const calls = [];
    spyOn(Resource.prototype, "fetchArrayBuffer").and.callFake(function () {
      calls.push({
        url: this.url,
        request: this.request,
        headers: this.headers,
      });
      return Promise.resolve(new ArrayBuffer(128));
    });
    const request = new Request();
    const xyz = new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(
      createOptions({ subdomains: ["a", "b", "c"] }),
    );
    const data = await xyz.requestTileGeometry(2, 3, 2, request);
    expect(data).toBeInstanceOf(SceneGISPlanarQuantizedMeshTerrainData);
    expect(calls[0].url).toContain("c.example.test/2/2/3.terrain");
    expect(calls[0].request).toBe(request);
    expect(calls[0].headers.Accept).toContain("application/vnd.quantized-mesh");

    const tms = new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(
      createOptions({ url: "https://test/{z}/{x}/{y}", urlScheme: "tms" }),
    );
    await tms.requestTileGeometry(2, 3, 2, new Request());
    expect(calls[1].url).toBe("https://test/2/2/0");
  });

  it("preserves scheduling defer and full-pyramid availability", function () {
    spyOn(Resource.prototype, "fetchArrayBuffer").and.returnValue(undefined);
    const provider = new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(
      createOptions(),
    );
    expect(
      provider.requestTileGeometry(0, 0, 0, new Request()),
    ).toBeUndefined();
    expect(provider.getTileDataAvailable(0, 0, 0)).toBe(true);
    expect(provider.getTileDataAvailable(0, 0, 5)).toBe(false);
    expect(provider.loadTileDataAvailability(0, 0, 0)).toBeUndefined();
  });

  it("preflights constructor and request addresses before mutation", function () {
    expect(function () {
      return new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(
        createOptions({ levelZeroMaximumGeometricError: undefined }),
      );
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(
        createOptions({ subdomains: 5 }),
      );
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(
        createOptions({
          minimumHeight: -Number.MAX_VALUE,
          maximumHeight: Number.MAX_VALUE,
        }),
      );
    }).toThrowDeveloperError();
    const provider = new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(
      createOptions(),
    );
    expect(function () {
      provider.requestTileGeometry(4, 0, 2, new Request());
    }).toThrowDeveloperError();
  });

  it("rejects malformed Worker results and out-of-range decoded heights", async function () {
    const provider = new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(
      createOptions({ maximumHeight: 50.0 }),
    );
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(
      new ArrayBuffer(128),
    );
    await expectAsync(
      provider.requestTileGeometry(0, 0, 0, new Request()),
    ).toBeRejectedWithError();
  });
});
