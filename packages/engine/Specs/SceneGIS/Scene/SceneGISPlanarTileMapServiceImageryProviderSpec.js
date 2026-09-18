import {
  Request,
  Resource,
  RuntimeError,
  SceneGISPlanarTileMapServiceImageryProvider,
} from "../../../index.js";
import createScheme from "./_private/createPlanarImageryScheme.js";

describe("SceneGIS/Scene/SceneGISPlanarTileMapServiceImageryProvider", function () {
  const metadata = `<TileMap version="1.0.0">
    <SRS>LOCAL:TEST</SRS><BoundingBox minx="1000" miny="2000" maxx="1256" maxy="2256"/>
    <Origin x="1000" y="2000"/><TileFormat width="256" height="256" extension="png" mime-type="image/png"/>
    <TileSets profile="local">
      <TileSet href="tiles/detail?variant=detail" units-per-pixel="0.5" order="5"/>
      <TileSet href="tiles/overview" units-per-pixel="1" order="4"/>
    </TileSets></TileMap>`;

  function xml(value = metadata) {
    return new DOMParser().parseFromString(value, "text/xml");
  }

  it("reads directory metadata, preserves relative hrefs/authentication and flips only service rows", async function () {
    const source = new Resource({
      url: "https://tms.test/maps?key=kept",
      headers: { "X-Test": "header" },
    });
    spyOn(Resource.prototype, "fetchXML").and.callFake(function () {
      expect(this.url).toBe(
        "https://tms.test/maps/tilemapresource.xml?key=kept",
      );
      return Promise.resolve(xml());
    });
    const request = new Request();
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      const url = new URL(this.url);
      expect(url.pathname).toBe("/maps/tiles/detail/1/1.png");
      expect(url.searchParams.get("key")).toBe("kept");
      expect(url.searchParams.get("variant")).toBe("detail");
      expect(this.headers["X-Test"]).toBe("header");
      expect(this.request).toBe(request);
      return undefined;
    });
    const scheme = createScheme();
    const provider = await SceneGISPlanarTileMapServiceImageryProvider.fromUrl(
      source,
      { tilingScheme: scheme },
    );
    expect(provider.tilingScheme).toBe(scheme);
    expect(provider.maximumLevel).toBe(1);
    expect(provider.requestImage(1, 0, 1, request)).toBeUndefined();
    expect(source.url).toBe("https://tms.test/maps?key=kept");
  });

  it("accepts a direct XML URL and a lower maximumLevel", async function () {
    spyOn(Resource.prototype, "fetchXML").and.callFake(function () {
      expect(this.url).toBe("https://tms.test/maps/custom.xml");
      return Promise.resolve(xml());
    });
    const provider = await SceneGISPlanarTileMapServiceImageryProvider.fromUrl(
      "https://tms.test/maps/custom.xml",
      { tilingScheme: createScheme(), maximumLevel: 0 },
    );
    expect(provider.maximumLevel).toBe(0);
    expect(() =>
      provider.requestImage(0, 0, 1, new Request()),
    ).toThrowDeveloperError();
  });

  it("rejects incompatible metadata instead of guessing a global projection", async function () {
    const fetch = spyOn(Resource.prototype, "fetchXML");
    const options = { tilingScheme: createScheme() };
    for (const document of [
      metadata.replace("LOCAL:TEST", "EPSG:3857"),
      metadata.replace('maxx="1256"', 'maxx="1512"'),
      metadata.replace(
        '<Origin x="1000" y="2000"',
        '<Origin x="1000" y="2256"',
      ),
      metadata.replace('units-per-pixel="0.5"', 'units-per-pixel="0.4"'),
      metadata.replace('order="5"', 'order="4"'),
      metadata.replace('href="tiles/overview"', ""),
      metadata.replace('width="256"', 'width="128"'),
      metadata.replace("<SRS>LOCAL:TEST</SRS>", ""),
      "<TileMap/>",
    ]) {
      fetch.and.returnValue(Promise.resolve(xml(document)));
      await expectAsync(
        SceneGISPlanarTileMapServiceImageryProvider.fromUrl(
          "https://tms.test/",
          options,
        ),
      ).toBeRejectedWithError(RuntimeError);
    }
    fetch.and.returnValue(Promise.resolve(xml()));
    await expectAsync(
      SceneGISPlanarTileMapServiceImageryProvider.fromUrl("https://tms.test/", {
        ...options,
        maximumLevel: 2,
      }),
    ).toBeRejectedWithError(RuntimeError);
    fetch.and.returnValue(Promise.reject(new Error("metadata unavailable")));
    await expectAsync(
      SceneGISPlanarTileMapServiceImageryProvider.fromUrl(
        "https://tms.test/",
        options,
      ),
    ).toBeRejectedWithError("metadata unavailable");
  });

  it("supports explicitly configured TMS paths without fetching metadata", function () {
    const fetchXML = spyOn(Resource.prototype, "fetchXML");
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      expect(this.url).toBe("https://tms.test/map/2/2/3.jpg?key=kept");
      return undefined;
    });
    const provider = new SceneGISPlanarTileMapServiceImageryProvider({
      url: "https://tms.test/map?key=kept",
      tilingScheme: createScheme(),
      maximumLevel: 3,
      fileExtension: "jpg",
    });
    provider.requestImage(2, 0, 2, new Request());
    expect(fetchXML).not.toHaveBeenCalled();
  });
});
