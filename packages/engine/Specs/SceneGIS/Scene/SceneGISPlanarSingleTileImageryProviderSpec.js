import {
  Resource,
  Request,
  SceneGISPlanarSingleTileImageryProvider,
  SceneGISPlanarImageryLayer,
} from "../../../index.js";
import createScheme from "./_private/createPlanarImageryScheme.js";

describe("SceneGIS/Scene/SceneGISPlanarSingleTileImageryProvider", function () {
  it("detects non-square image dimensions and shares a non-closable source between layers", async function () {
    const image = document.createElement("img");
    image.width = 512;
    image.height = 128;
    spyOn(Resource.prototype, "fetchImage").and.callFake(function (options) {
      expect(options.preferImageBitmap).toBe(false);
      expect(this.headers["X-Test"]).toBe("header");
      return Promise.resolve(image);
    });
    const provider = await SceneGISPlanarSingleTileImageryProvider.fromUrl(
      new Resource({
        url: "https://images.test/single.png",
        headers: { "X-Test": "header" },
      }),
      { tilingScheme: createScheme() },
    );
    expect(provider.tileWidth).toBe(512);
    expect(provider.tileHeight).toBe(128);
    expect(provider.maximumLevel).toBe(0);
    const first = new SceneGISPlanarImageryLayer(provider);
    const second = new SceneGISPlanarImageryLayer(provider);
    expect(
      await first.imageryProvider.requestImage(0, 0, 0, new Request()),
    ).toBe(image);
    first.destroy();
    expect(
      await second.imageryProvider.requestImage(0, 0, 0, new Request()),
    ).toBe(image);
    second.destroy();
    expect(Resource.prototype.fetchImage).toHaveBeenCalledTimes(1);
  });

  it("keeps cancellation and synchronous throttling for a lazily requested image", function () {
    const request = new Request();
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      expect(this.request).toBe(request);
      return undefined;
    });
    const provider = new SceneGISPlanarSingleTileImageryProvider({
      url: "https://images.test/",
      tilingScheme: createScheme(),
      tileWidth: 512,
      tileHeight: 128,
    });
    expect(provider.requestImage(0, 0, 0, request)).toBeUndefined();
    expect(() =>
      provider.requestImage(0, 0, 1, request),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISPlanarSingleTileImageryProvider({
          url: "https://images.test/",
          tilingScheme: createScheme(),
        }),
    ).toThrowDeveloperError();
  });

  it("propagates initial image failure", async function () {
    spyOn(Resource.prototype, "fetchImage").and.returnValue(
      Promise.reject(new Error("image unavailable")),
    );
    await expectAsync(
      SceneGISPlanarSingleTileImageryProvider.fromUrl("https://images.test/", {
        tilingScheme: createScheme(),
      }),
    ).toBeRejectedWithError("image unavailable");
  });
});
