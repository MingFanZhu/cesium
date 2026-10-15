import {
  Request,
  Resource,
  SceneGISPlanarExtent,
  SceneGISPlanarWebMapServiceImageryProvider,
} from "../../../index.js";
import createScheme from "./_private/createPlanarImageryScheme.js";

describe("SceneGIS/Scene/SceneGISPlanarWebMapServiceImageryProvider", function () {
  it("sends WMS 1.1.1 XY bounds and preserves Resource authentication and Request identity", function () {
    const resource = new Resource({
      url: "https://wms.test/map?Token=keep&VERSION=1.1.1",
      headers: { "X-Test": "header" },
    });
    const request = new Request();
    const fetch = spyOn(Resource.prototype, "fetchImage").and.callFake(
      function () {
        const query = new URL(this.url).searchParams;
        expect(query.get("Token")).toBe("keep");
        expect(query.get("version")).toBe("1.1.1");
        expect(query.get("VERSION")).toBeNull();
        expect(query.get("srs")).toBe("LOCAL:TEST");
        expect(query.has("crs")).toBe(false);
        expect(query.get("bbox")).toBe("1128,2128,1256,2256");
        expect(query.get("width")).toBe("256");
        expect(query.get("height")).toBe("128");
        expect(query.get("layers")).toBe("ortho,labels");
        expect(query.get("format")).toBe("image/png");
        expect(query.get("time")).toBe("2026-09-18");
        expect(this.headers["X-Test"]).toBe("header");
        expect(this.request).toBe(request);
        return undefined;
      },
    );
    const provider = new SceneGISPlanarWebMapServiceImageryProvider({
      url: resource,
      layers: "ortho,labels",
      tilingScheme: createScheme(),
      tileHeight: 128,
      axisOrder: "yx",
      parameters: { FORMAT: "image/png", TIME: "2026-09-18" },
    });
    expect(provider.layers).toBe("ortho,labels");
    expect(provider.requestImage(1, 0, 1, request)).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(resource.queryParameters.VERSION).toBe("1.1.1");
    expect(resource.queryParameters.layers).toBeUndefined();
  });

  it("sends WMS 1.3.0 CRS with explicit YX ordering", function () {
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      const query = new URL(this.url).searchParams;
      expect(query.get("bbox")).toBe("2128,1128,2256,1256");
      expect(query.get("crs")).toBe("LOCAL:NORTH-EAST");
      expect(query.has("srs")).toBe(false);
      return Promise.resolve({ width: 256, height: 256 });
    });
    const provider = new SceneGISPlanarWebMapServiceImageryProvider({
      url: "https://wms.test/",
      layers: "image",
      tilingScheme: createScheme(),
      parameters: { version: "1.3.0", srs: "ignored" },
      crs: "LOCAL:NORTH-EAST",
      axisOrder: "yx",
    });
    return provider.requestImage(1, 0, 1, new Request());
  });

  it("rejects missing CRS, unsupported versions, axes and time animation", function () {
    const options = {
      url: "https://wms.test/",
      layers: "image",
      tilingScheme: createScheme(),
    };
    for (const invalid of [
      { ...options, layers: "" },
      { ...options, tilingScheme: createScheme(undefined), srs: "" },
      { ...options, parameters: { version: "2.0.0" } },
      { ...options, axisOrder: "guess" },
      { ...options, times: {} },
      { ...options, minimumLevel: -1 },
    ]) {
      expect(
        () => new SceneGISPlanarWebMapServiceImageryProvider(invalid),
      ).toThrowDeveloperError();
    }
  });
  it("retains the complete canonical BBOX for nonaligned coverage at nonzero levels", function () {
    const provider = new SceneGISPlanarWebMapServiceImageryProvider({
      url: "https://wms.test/",
      layers: "image",
      tilingScheme: createScheme(),
      minimumLevel: 3,
      maximumLevel: 3,
      coverageExtent: new SceneGISPlanarExtent({
        minimumX: 1163,
        minimumY: 2162,
        maximumX: 1180,
        maximumY: 2180,
      }),
    });
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      expect(new URL(this.url).searchParams.get("bbox")).toBe(
        "1160,2160,1192,2192",
      );
      return undefined;
    });
    provider.requestImage(5, 2, 3, new Request());
  });
});
