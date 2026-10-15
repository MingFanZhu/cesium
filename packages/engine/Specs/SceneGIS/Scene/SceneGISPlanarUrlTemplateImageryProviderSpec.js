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
      preferBlob: true,
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
      { ...valid, tileHeight: 0 },
      { ...valid, minimumLevel: 3 },
      { ...valid, customTags: { id: 1 } },
      { ...valid, urlSchemeZeroPadding: { "{x}": 4 } },
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

  it("expands projected bounds, reverse tags, custom tags and padding without geographic conversion", function () {
    const fetch = spyOn(Resource.prototype, "fetchImage").and.callFake(
      function () {
        const url = new URL(this.url);
        expect(url.searchParams.get("bbox")).toBe("-64,0,0,64");
        expect(url.searchParams.get("size")).toBe("256,128");
        expect(url.pathname).toBe("/002/01/2/2/2/5/local-1-1-2.png");
        return undefined;
      },
    );
    const custom = jasmine
      .createSpy("tag")
      .and.callFake((provider, x, y, level) => `local-${x}-${y}-${level}`);
    const provider = new SceneGISPlanarUrlTemplateImageryProvider({
      url: "https://test/{z}/{x}/{y}/{reverseX}/{reverseY}/{reverseZ}/{id}.png?bbox={westProjected},{southProjected},{eastProjected},{northProjected}&size={width},{height}",
      tilingScheme: createTilingScheme(),
      maximumLevel: 8,
      urlScheme: "tms",
      tileHeight: 128,
      customTags: { id: custom },
      urlSchemeZeroPadding: { "{z}": "000", "{x}": "00" },
    });
    expect(provider.requestImage(1, 1, 2, new Request())).toBeUndefined();
    expect(custom).toHaveBeenCalledOnceWith(provider, 1, 1, 2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("matches Cesium reverseZ semantics at the maximum level", function () {
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      expect(this.url).toBe("https://test/4.png");
      return undefined;
    });
    const provider = new SceneGISPlanarUrlTemplateImageryProvider({
      url: "https://test/{reverseZ}.png",
      tilingScheme: createTilingScheme(),
      maximumLevel: 4,
    });
    provider.requestImage(0, 0, 4, new Request());
  });
  it("preserves global XYZ with a nonzero minimum and rectangular coverage", function () {
    const coverageExtent = new SceneGISPlanarExtent({
      minimumX: 10,
      minimumY: 15,
      maximumX: 40,
      maximumY: 35,
    });
    const provider = new SceneGISPlanarUrlTemplateImageryProvider({
      url: "https://test/{z}/{x}/{y}.png",
      tilingScheme: createTilingScheme(),
      minimumLevel: 2,
      maximumLevel: 4,
      coverageExtent,
    });
    expect(provider.minimumLevel).toBe(2);
    expect(provider.coverageExtent).toBe(coverageExtent);
    const fetch = spyOn(Resource.prototype, "fetchImage").and.callFake(
      function (options) {
        expect(this.url).toBe("https://test/3/5/2.png");
        expect(options.preferBlob).toBe(true);
        return undefined;
      },
    );
    provider.requestImage(5, 2, 3, new Request());
    expect(() =>
      provider.requestImage(0, 0, 1, new Request()),
    ).toThrowDeveloperError();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
