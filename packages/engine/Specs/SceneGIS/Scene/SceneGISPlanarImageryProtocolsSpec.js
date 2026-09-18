import {
  Cartesian3,
  Color,
  OrthographicFrustum,
  Resource,
  SceneGISPlanarWorld,
  SceneGISPlanarSingleTileImageryProvider,
  SceneGISPlanarWebMapTileServiceImageryProvider,
} from "../../../index.js";
import createScheme from "./_private/createPlanarImageryScheme.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISPlanarImageryProtocols", function () {
  let scene;
  let world;
  function setup() {
    const tilingScheme = createScheme();
    world = new SceneGISPlanarWorld({
      tilingScheme,
      maximumLevel: 0,
      baseColor: Color.BLUE,
    });
    scene = createScene({ canvas: createCanvas(16, 16) });
    scene._initializeWorld(world);
    scene.camera.position = new Cartesian3(1128, 2128, 500);
    scene.camera.direction = new Cartesian3(0, 0, -1);
    scene.camera.up = new Cartesian3(0, 1, 0);
    scene.camera.right = new Cartesian3(1, 0, 0);
    scene.camera.frustum = new OrthographicFrustum({
      width: 256,
      aspectRatio: 1,
      near: 1,
      far: 1000,
    });
  }
  function image(color) {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 8;
    const context = canvas.getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, 16, 8);
    return canvas;
  }
  async function settle() {
    await pollToPromise(() => {
      scene.renderForSpecs();
      return world.tilesLoaded;
    });
  }
  function pixel() {
    return Array.from(
      scene.context.readPixels({ x: 8, y: 8, width: 1, height: 1 }),
    );
  }
  afterEach(function () {
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
    scene = undefined;
  });

  it("uploads rectangular single images in independent layers and releases textures exactly once", async function () {
    setup();
    spyOn(Resource.prototype, "fetchImage").and.returnValue(
      Promise.resolve(image("#ff0000")),
    );
    const provider = await SceneGISPlanarSingleTileImageryProvider.fromUrl(
      "local.png",
      { tilingScheme: world.tilingScheme },
    );
    const first = world.imageryLayers.addImageryProvider(provider);
    expect(world.tilesLoaded).toBe(false);
    world.imageryLayers.addImageryProvider(provider);
    await settle();
    expect(pixel()).toEqual([255, 0, 0, 255]);
    const debug = world._surface._imagery._debug;
    expect(debug.createdTextures).toBe(2);
    world.imageryLayers.remove(first);
    await settle();
    expect(pixel()).toEqual([255, 0, 0, 255]);
    const warm = { ...debug };
    for (let i = 0; i < 12; ++i) {
      scene.renderForSpecs();
    }
    expect(debug).toEqual(warm);
    scene.destroyForSpecs();
    expect(debug.destroyedTextures).toBe(debug.createdTextures);
  });

  it("invalidates request-render readiness without replacing published textures before a normal frame", async function () {
    setup();
    spyOn(Resource.prototype, "fetchImage").and.callFake(function () {
      return Promise.resolve(
        image(this.queryParameters.time === "first" ? "#ff0000" : "#00ff00"),
      );
    });
    const provider = new SceneGISPlanarWebMapTileServiceImageryProvider({
      url: "https://wmts.test/",
      layer: "image",
      style: "default",
      tileMatrixSetID: "local",
      tilingScheme: world.tilingScheme,
      tileWidth: 16,
      tileHeight: 8,
      maximumLevel: 0,
      dimensions: { time: "first" },
    });
    const layer = world.imageryLayers.addImageryProvider(provider);
    await settle();
    expect(pixel()).toEqual([255, 0, 0, 255]);
    const imagery = world._surface._imagery;
    const previous = imagery._runtimes.get(layer).entries.get("0/0/0").texture;
    provider.dimensions = { time: "second" };
    expect(world.tilesLoaded).toBe(false);
    expect(previous.isDestroyed()).toBe(false);
    world.update(scene.frameState);
    const requestFrame = scene.frameState.afterRender.at(-1);
    expect(requestFrame()).toBe(true);
    await settle();
    expect(requestFrame()).toBe(false);
    expect(previous.isDestroyed()).toBe(true);
    expect(pixel()).toEqual([0, 255, 0, 255]);
    const debug = imagery._debug;
    const warm = { ...debug };
    for (let i = 0; i < 12; ++i) {
      scene.renderForSpecs();
    }
    expect(debug).toEqual(warm);
    scene.destroyForSpecs();
    expect(debug.destroyedTextures).toBe(debug.createdTextures);
    expect(provider._reloadEvent.numberOfListeners).toBe(0);
    expect(requestFrame()).toBe(false);
  });
});
