import {
  Request,
  Resource,
  SceneGISPlanarWebMapTileServiceImageryProvider,
} from "../../../index.js";
import createScheme from "./_private/createPlanarImageryScheme.js";

describe("SceneGIS/Scene/SceneGISPlanarWebMapTileServiceImageryProvider", function () {
  function options() {
    return {
      url: "https://wmts.test/",
      tilingScheme: createScheme(),
      layer: "ortho",
      style: "default",
      tileMatrixSetID: "LOCAL",
      tileMatrixLabels: ["overview", "detail"],
    };
  }

  it("requests KVP with matrix labels, dimensions, and scheduling intact", function () {
    const input = options();
    const dimensions = { Time: "first", elevation: 12 };
    input.url = new Resource({
      url: "https://{s}.test/wmts?auth=kept&SERVICE=WMTS&REQUEST=GetCapabilities",
      headers: { "X-Test": "header" },
    });
    const request = new Request();
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      const url = new URL(this.url);
      expect(url.hostname).toBe("b.test");
      const query = url.searchParams;
      expect(query.get("auth")).toBe("kept");
      expect(query.get("request")).toBe("GetTile");
      expect(query.has("REQUEST")).toBe(false);
      expect(query.has("SERVICE")).toBe(false);
      expect(query.get("tilematrix")).toBe("detail");
      expect(query.get("tilematrixset")).toBe("LOCAL");
      expect(query.get("tilerow")).toBe("0");
      expect(query.get("tilecol")).toBe("1");
      expect(query.get("Time")).toBe("first");
      expect(query.get("elevation")).toBe("12");
      expect(this.headers["X-Test"]).toBe("header");
      expect(this.request).toBe(request);
      return undefined;
    });
    const provider = new SceneGISPlanarWebMapTileServiceImageryProvider({
      ...input,
      dimensions,
    });
    dimensions.Time = "mutated";
    input.tileMatrixLabels[1] = "mutated";
    expect(provider.maximumLevel).toBe(1);
    expect(provider.requestImage(1, 0, 1, request)).toBeUndefined();
  });

  it("expands REST templates and replaces dimensions atomically", function () {
    const provider = new SceneGISPlanarWebMapTileServiceImageryProvider({
      ...options(),
      url: "https://wmts.test/{Layer}/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}/{Time}.png",
      dimensions: { Time: "first" },
    });
    const reload = jasmine.createSpy("reload");
    provider._reloadEvent.addEventListener(reload);
    const urls = [];
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      urls.push(this.url);
      return undefined;
    });
    provider.requestImage(1, 0, 1, new Request());
    provider.dimensions = { Time: "second" };
    provider.requestImage(1, 0, 1, new Request());
    provider.dimensions = { Time: "second" };
    expect(reload).toHaveBeenCalledTimes(1);
    expect(urls).toEqual([
      "https://wmts.test/ortho/default/LOCAL/detail/0/1/first.png",
      "https://wmts.test/ortho/default/LOCAL/detail/0/1/second.png",
    ]);
    expect(() => {
      provider.dimensions = { tilecol: "wrong" };
    }).toThrowDeveloperError();
    expect(provider.dimensions.Time).toBe("second");
  });

  it("rejects incomplete matrix mappings and unsupported options", function () {
    for (const invalid of [
      { ...options(), style: undefined },
      { ...options(), tileMatrixLabels: [] },
      { ...options(), maximumLevel: 2 },
      { ...options(), times: {} },
      { ...options(), dimensions: { Time: {} } },
      { ...options(), dimensions: "first" },
      { ...options(), format: 1 },
      { ...options(), minimumLevel: -1 },
    ]) {
      expect(
        () => new SceneGISPlanarWebMapTileServiceImageryProvider(invalid),
      ).toThrowDeveloperError();
    }
  });
  it("uses canonical matrix labels while permitting absent labels below minimum", function () {
    const labels = [];
    labels[2] = "service-two";
    labels[3] = "service-three";
    const provider = new SceneGISPlanarWebMapTileServiceImageryProvider({
      ...options(),
      minimumLevel: 2,
      tileMatrixLabels: labels,
    });
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      const query = new URL(this.url).searchParams;
      expect(query.get("tilematrix")).toBe("service-three");
      expect(query.get("tilecol")).toBe("5");
      expect(query.get("tilerow")).toBe("2");
      return undefined;
    });
    provider.requestImage(5, 2, 3, new Request());
    expect(
      () =>
        new SceneGISPlanarWebMapTileServiceImageryProvider({
          ...options(),
          minimumLevel: 1,
          tileMatrixLabels: labels,
        }),
    ).toThrowDeveloperError();
  });
});
