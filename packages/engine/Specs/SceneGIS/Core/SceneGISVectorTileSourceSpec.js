import {
  Resource,
  Request,
  RuntimeError,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
  SceneGISVectorTileSource,
} from "../../../index.js";
import fixture from "./_private/VectorTileFixture.js";

describe("SceneGIS/Core/SceneGISVectorTileSource", function () {
  function options(extra) {
    return {
      url: "/tiles/{z}/{x}/{y}.mvt",
      tilingScheme: new SceneGISPlanarTilingScheme({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          extent: new SceneGISPlanarExtent({
            minimumX: 100,
            minimumY: 200,
            maximumX: 1100,
            maximumY: 1200,
          }),
        }),
      }),
      ...extra,
    };
  }

  it("does not fetch or mutate a supplied Resource and retains headers and credit", function () {
    const fetch = spyOn(Resource.prototype, "fetchArrayBuffer");
    const resource = new Resource({
      url: "/tiles/{z}/{x}/{y}.mvt?key=a",
      headers: { "X-Test": "local" },
    });
    const source = new SceneGISVectorTileSource(
      options({ url: resource, credit: "Local fixture" }),
    );
    const request = new Request();
    const tile = source.getTileResource(3, 2, 3, request);
    expect(fetch).not.toHaveBeenCalled();
    expect(tile.url).toBe("/tiles/3/3/2.mvt?key=a");
    expect(tile.headers["X-Test"]).toBe("local");
    expect(tile.request).toBe(request);
    expect(source.credit.html).toBe("Local fixture");
    expect(resource.url).toContain("{z}");
  });

  it("changes only the URL row for TMS", async function () {
    const fetch = spyOn(Resource.prototype, "fetchArrayBuffer").and.callFake(
      function () {
        expect(this.url).toBe("/tiles/3/3/5.mvt");
        return Promise.resolve(fixture().buffer);
      },
    );
    const source = new SceneGISVectorTileSource(options({ scheme: "tms" }));
    const tile = await source.requestTile(3, 2, 3);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(tile.layers[0].features[0].geometry.parts[0]).toEqual(
      new Float64Array([10, 20]),
    );
  });

  it("returns raw bytes without decoding when the consuming layer requests Worker preparation", async function () {
    const bytes = fixture().buffer;
    spyOn(Resource.prototype, "fetchArrayBuffer").and.resolveTo(bytes);
    const source = new SceneGISVectorTileSource(options());
    expect(await source.requestTile(0, 0, 0, undefined, false)).toBe(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(() =>
      source.requestTile(0, 0, 0, undefined, "raw"),
    ).toThrowDeveloperError();
  });

  it("distinguishes scheduling deferral from a fulfilled empty response", async function () {
    const fetch = spyOn(Resource.prototype, "fetchArrayBuffer").and.returnValue(
      undefined,
    );
    const source = new SceneGISVectorTileSource(options());
    expect(source.requestTile(0, 0, 0)).toBeUndefined();
    fetch.and.returnValue(Promise.resolve(undefined));
    expect(await source.requestTile(0, 0, 0)).toEqual({ layers: [] });
    fetch.and.returnValue(Promise.resolve(new ArrayBuffer(0)));
    expect(await source.requestTile(0, 0, 0)).toEqual({ layers: [] });
  });

  it("preserves HTTP, network and cancellation failures without retry or empty success", async function () {
    const source = new SceneGISVectorTileSource(options());
    const fetch = spyOn(Resource.prototype, "fetchArrayBuffer");
    for (const error of [
      { statusCode: 404 },
      new Error("network"),
      new Error("cancelled"),
    ]) {
      fetch.and.returnValue(Promise.reject(error));
      await expectAsync(source.requestTile(0, 0, 0)).toBeRejectedWith(error);
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed bytes after a successful request", async function () {
    spyOn(Resource.prototype, "fetchArrayBuffer").and.returnValue(
      Promise.resolve(new Uint8Array([26, 50]).buffer),
    );
    const source = new SceneGISVectorTileSource(options());
    await expectAsync(source.requestTile(0, 0, 0)).toBeRejectedWithError(
      RuntimeError,
    );
  });

  it("validates configuration and availability before making requests", function () {
    const fetch = spyOn(Resource.prototype, "fetchArrayBuffer");
    for (const extra of [
      { url: "/no-template.mvt" },
      { url: "/{z}/{x}/{y}/{other}" },
      { scheme: "invalid" },
      { minimumLevel: 2, maximumLevel: 1 },
      { maximumLevel: 100 },
      { credit: 4 },
    ]) {
      expect(
        () => new SceneGISVectorTileSource(options(extra)),
      ).toThrowDeveloperError();
    }
    const source = new SceneGISVectorTileSource(options({ maximumLevel: 2 }));
    expect(() => source.requestTile(0, 0, 3)).toThrowDeveloperError();
    expect(() => source.requestTile(-1, 0, 0)).toThrowDeveloperError();
    expect(() => source.requestTile(0, 0, 0, {})).toThrowDeveloperError();
    expect(fetch).not.toHaveBeenCalled();
  });
});
