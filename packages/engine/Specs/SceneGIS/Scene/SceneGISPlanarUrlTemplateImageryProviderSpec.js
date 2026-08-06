import {
  Credit,
  Request,
  Resource,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
  SceneGISPlanarUrlTemplateImageryProvider,
} from "../../../index.js";

describe("SceneGIS/Scene/SceneGISPlanarUrlTemplateImageryProvider", function () {
  function createTilingScheme() {
    return new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128,
          minimumY: -128,
          maximumX: 128,
          maximumY: 128,
        }),
      }),
    });
  }

  it("publishes normalized defaults and owns Resource and subdomain inputs", function () {
    const resource = new Resource("https://{s}.example.test/{z}/{x}/{y}.png");
    const subdomains = ["a", "b"];
    const provider = new SceneGISPlanarUrlTemplateImageryProvider({
      url: resource,
      tilingScheme: createTilingScheme(),
      maximumLevel: 4,
      subdomains,
      credit: "Example attribution",
    });
    resource.url = "https://changed.test";
    subdomains[0] = "changed";
    expect(provider.minimumLevel).toBe(0);
    expect(provider.maximumLevel).toBe(4);
    expect(provider.tileWidth).toBe(256);
    expect(provider.tileHeight).toBe(256);
    expect(provider.hasAlphaChannel).toBe(true);
    expect(provider.credit).toBeInstanceOf(Credit);
    expect(provider.url).toContain("example.test");
  });

  it("expands xyz, tms, and safe subdomain template values", function () {
    const requests = [];
    spyOn(Resource.prototype, "fetchImage").and.callFake(function (options) {
      requests.push({ url: this.url, request: this.request, options });
      return Promise.resolve({ width: 256, height: 256 });
    });
    const tilingScheme = createTilingScheme();
    const request = new Request();
    const xyz = new SceneGISPlanarUrlTemplateImageryProvider({
      url: "https://{s}.test/{z}/{x}/{y}.png",
      tilingScheme,
      maximumLevel: 4,
      subdomains: ["a", "b", "c"],
    });
    xyz.requestImage(2, 3, 2, request);
    expect(requests[0].url).toBe("https://c.test/2/2/3.png");
    expect(requests[0].request).toBe(request);
    expect(requests[0].options).toEqual({
      preferImageBitmap: true,
      flipY: true,
    });

    const tms = new SceneGISPlanarUrlTemplateImageryProvider({
      url: "https://test/{z}/{x}/{y}.png",
      tilingScheme,
      urlScheme: "tms",
      maximumLevel: 4,
    });
    tms.requestImage(2, 3, 2, new Request());
    expect(requests[1].url).toBe("https://test/2/2/0.png");
  });

  it("rejects invalid constructor and tile address inputs", function () {
    const tilingScheme = createTilingScheme();
    const valid = { url: "fixed.png", tilingScheme, maximumLevel: 2 };
    for (const options of [
      { ...valid, url: undefined },
      { ...valid, tilingScheme: {} },
      { ...valid, urlScheme: "quadkey" },
      { ...valid, maximumLevel: -1 },
      { ...valid, tileWidth: 0 },
      { ...valid, tileHeight: 128 },
      { ...valid, subdomains: [] },
      { ...valid, hasAlphaChannel: 1 },
      { ...valid, credit: {} },
    ]) {
      expect(function () {
        return new SceneGISPlanarUrlTemplateImageryProvider(options);
      }).toThrowDeveloperError();
    }
    const provider = new SceneGISPlanarUrlTemplateImageryProvider(valid);
    for (const address of [
      [-1, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 3],
      [0.5, 0, 1],
    ]) {
      expect(function () {
        provider.requestImage(...address, new Request());
      }).toThrowDeveloperError();
    }
  });
});
