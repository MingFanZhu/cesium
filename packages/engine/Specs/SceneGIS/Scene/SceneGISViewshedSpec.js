import {
  Cartesian3,
  Cesium3DTileset,
  ClippingPlane,
  ClippingPlaneCollection,
  Color,
  CustomShader,
  Event,
  Globe,
  Matrix4,
  Model,
  Resource,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
  SceneGISViewshed,
  SceneGISTemporalAntialiasing,
  Transforms,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISViewshed", function () {
  let scene, world, frame, analysis;
  function setup(globe = false, terrain = false) {
    scene = createScene({ canvas: createCanvas(64, 64) });
    world = globe
      ? new Globe()
      : new SceneGISPlanarWorld({
          coordinateSystem: new SceneGISPlanarCoordinateSystem({
            extent: new SceneGISPlanarExtent({
              minimumX: -64,
              minimumY: -64,
              maximumX: 64,
              maximumY: 64,
            }),
          }),
          maximumLevel: 0,
        });
    scene._initializeWorld(world);
    world.show = terrain;
    scene.postProcessStages.fxaa.enabled = false;
    frame = globe
      ? Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(118, 32, 50))
      : Matrix4.IDENTITY;
    lookAtGround();
  }
  function point(x, y, z) {
    return Matrix4.multiplyByPoint(
      frame,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function vector(x, y, z) {
    return Matrix4.multiplyByPointAsVector(
      frame,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function lookAtGround(x = 0, y = 10, height = 6) {
    scene.camera.setView({
      destination: point(x, y, height),
      orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 100000;
  }
  function render() {
    scene.renderForSpecs();
  }
  function until(condition) {
    return pollToPromise(
      () => {
        render();
        if (analysis?.error) {
          throw analysis.error;
        }
        return condition();
      },
      { timeout: 20000 },
    );
  }
  function center() {
    render();
    return Array.from(
      scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
    );
  }
  async function box(x, y, z, scale) {
    const matrix = Matrix4.multiply(
      frame,
      Matrix4.fromTranslation(new Cartesian3(x, y, z)),
      new Matrix4(),
    );
    Matrix4.multiplyByScale(matrix, scale, matrix);
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
        modelMatrix: matrix,
        incrementallyLoadTextures: false,
      }),
    );
    await until(() => model.ready);
    return model;
  }
  function add(sources, options = {}) {
    analysis = scene.postProcessStages.add(
      new SceneGISViewshed({
        scene,
        world,
        position: point(0, -10, 2),
        direction: vector(0, 1, 0),
        up: vector(0, 0, 1),
        distance: 100,
        resolution: 128,
        terrain: false,
        sources,
        visibleColor: Color.LIME,
        hiddenColor: Color.RED,
        ...options,
      }),
    );
    return analysis;
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    scene = undefined;
    analysis = undefined;
  });

  [false, true].forEach((globe) => {
    it(`classifies an offscreen wall in ${globe ? "Globe" : "Planar"} and updates after visibility changes`, async function () {
      setup(globe);
      const floor = await box(0, 0, -0.2, new Cartesian3(50, 50, 0.2));
      const wall = await box(0, 0, 3, new Cartesian3(4, 1, 6));
      const original = center();
      add([floor, wall]);
      await until(() => analysis.analysisReady && analysis.ready);
      expect(center()).toEqual([255, 0, 0, 255]);
      const depth = analysis._viewshed.depth.texture;
      lookAtGround(0, 12, 4);
      expect(center()).toEqual([255, 0, 0, 255]);
      expect(analysis._viewshed.depth.texture).toBe(depth);
      expect(scene.frameState.camera).toBe(scene.camera);
      wall.show = false;
      expect(center()).toEqual([0, 255, 0, 255]);
      wall.show = true;
      const shader = new CustomShader({
        vertexShaderText:
          "void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) { vsOutput.positionMC.y -= 100.0; }",
      });
      wall.customShader = shader;
      expect(center()).toEqual([0, 255, 0, 255]);
      wall.customShader = undefined;
      expect(center()).toEqual([255, 0, 0, 255]);
      shader.destroy();
      scene.highDynamicRange = true;
      const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
      for (let i = 0; i < 8; i++) {
        expect(center()).toEqual([255, 0, 0, 255]);
      }
      taa.enabled = false;
      wall.clippingPlanes = new ClippingPlaneCollection({
        planes: [new ClippingPlane(Cartesian3.UNIT_Z, -100)],
      });
      expect(center()).toEqual([0, 255, 0, 255]);
      analysis.enabled = false;
      expect(analysis.status).toBe("disabled");
      expect(center()).not.toEqual([0, 255, 0, 255]);
      expect(scene.postProcessStages.remove(analysis)).toBe(true);
      expect(depth.isDestroyed()).toBe(true);
      expect(wall.isDestroyed()).toBe(false);
      expect(original[3]).toBe(255);
    });
  });

  it("keeps pending planar terrain uncolored and shares the normal mesh budget", async function () {
    setup(false, true);
    let finish;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0,
      maximumHeight: 5,
      maximumLevel: 0,
      errorEvent: new Event(),
      getLevelMaximumGeometricError: () => 1,
      requestTileGeometry: () => pending,
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    add([], { terrain: true });
    render();
    expect(analysis.analysisReady).toBe(false);
    expect(analysis.status).toBe("loading");
    expect(center()).not.toEqual([0, 255, 0, 255]);
    const terrain = world._surface._terrain;
    let starts = terrain._debug.startedMeshTasks;
    let promotions = terrain._debug.promotions;
    finish(
      new SceneGISPlanarHeightmapTerrainData({
        width: 2,
        height: 2,
        buffer: new Float32Array([0, 0, 0, 0]),
      }),
    );
    await until(() => {
      expect(terrain._debug.startedMeshTasks - starts).toBeLessThanOrEqual(2);
      expect(terrain._debug.promotions - promotions).toBeLessThanOrEqual(2);
      starts = terrain._debug.startedMeshTasks;
      promotions = terrain._debug.promotions;
      return analysis.analysisReady;
    });
    expect(center()).toEqual([0, 255, 0, 255]);
    const view = analysis._viewshed.terrainView;
    const tile = view.tiles[0];
    expect(view.commandStates.get(tile).command).not.toBe(tile.command);
    expect(view.commandStates.get(tile).command.vertexArray).toBe(
      tile.command.vertexArray,
    );
    expect(view.commandStates.get(tile).command.count).toBe(
      tile.terrainEntry.activeContent.mesh.surfaceIndexCount,
    );
    const errors = jasmine.createSpy("coverageError");
    analysis.errorEvent.addEventListener(errors);
    const failedProvider = {
      ...world.terrainProvider,
      errorEvent: new Event(),
      requestTileGeometry: () => Promise.reject(new Error("missing fixture")),
    };
    failedProvider.errorEvent.addEventListener(() => {});
    world.terrainProvider = failedProvider;
    await pollToPromise(
      () => {
        render();
        return analysis.status === "error";
      },
      { timeout: 5000 },
    );
    expect(analysis.analysisReady).toBe(false);
    expect(center()).not.toEqual([0, 255, 0, 255]);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("validates World identity and rejects camera-sized occluders", async function () {
    setup();
    const otherWorld = new Globe();
    expect(() => add([], { world: otherWorld })).toThrowDeveloperError();
    otherWorld.destroy();
    const model = await box(0, 0, 3, Cartesian3.ONE);
    add([model]);
    model.minimumPixelSize = 10;
    expect(render).toThrowDeveloperError();
    expect(analysis.status).toBe("error");
    expect(scene.frameState.camera).toBe(scene.camera);
  });

  it("loads Globe terrain outside the main view and excludes native skirts", async function () {
    setup(true, true);
    world.maximumScreenSpaceError = 10;
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(-80, 40, 2000000),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    add([], {
      terrain: true,
      position: point(0, 0, 200000),
      direction: vector(0, 0, -1),
      up: vector(0, 1, 0),
      distance: 500000,
      resolution: 32,
    });
    await until(() => analysis.analysisReady);
    const selected = analysis._viewshed.globeSelection.tiles;
    expect(selected.length).toBeGreaterThan(0);
    expect(analysis.statistics.drawCalls).toBeGreaterThan(0);
    expect(
      world._surface._tilesToRender.some((tile) => selected.includes(tile)),
    ).toBe(false);
    const commands = analysis._viewshed.commands;
    for (const command of commands) {
      expect(command.count).toBe(
        command.owner.data.renderedMesh.indexCountWithoutSkirts,
      );
    }
    expect(world._surface.tileProvider.showSkirts).toBe(true);
    expect(scene.frameState.camera).toBe(scene.camera);
  });

  it("requests a native 3D Tiles source unseen by the display camera", async function () {
    setup();
    const floor = await box(0, 0, -0.2, new Cartesian3(50, 50, 0.2));
    const transform = Matrix4.fromTranslation(new Cartesian3(0, 0, 3));
    Matrix4.multiplyByScale(transform, new Cartesian3(4, 1, 6), transform);
    const originalFetch = Resource.prototype.fetchJson;
    spyOn(Resource.prototype, "fetchJson").and.callFake(function (...args) {
      if (this.url.includes("Viewshed/tileset.json")) {
        return Promise.resolve({
          asset: { version: "1.1" },
          geometricError: 1000,
          root: {
            boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
            transform: Matrix4.toArray(transform),
            geometricError: 0,
            refine: "REPLACE",
            content: {
              uri: "../Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
            },
          },
        });
      }
      return originalFetch.apply(this, args);
    });
    const tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl("Data/Viewshed/tileset.json"),
    );
    render();
    expect(tileset.statistics.numberOfTilesWithContentReady).toBe(0);
    add([floor, tileset]);
    await until(() => analysis.analysisReady);
    expect(tileset.statistics.numberOfTilesWithContentReady).toBe(1);
    expect(center()).toEqual([255, 0, 0, 255]);
    expect(scene.frameState.camera).toBe(scene.camera);
  });
});
