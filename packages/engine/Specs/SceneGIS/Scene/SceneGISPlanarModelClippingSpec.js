import {
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  DirectionalLight,
  Intersect,
  Matrix4,
  Model,
  OrthographicFrustum,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  ShadowMode,
  TileBoundingSphere,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISPlanarModelClipping", function () {
  let scene;
  let offset;

  function setup(origin = 0) {
    offset = origin;
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: origin - 128,
          minimumY: origin - 128,
          maximumX: origin + 128,
          maximumY: origin + 128,
        }),
      }),
      maximumLevel: 0,
    });
    world.show = false;
    scene = createScene({ canvas: createCanvas(80, 80) });
    scene._initializeWorld(world);
    scene.backgroundColor = Color.BLUE;
    scene.camera.position = new Cartesian3(origin, origin, 100);
    scene.camera.direction = new Cartesian3(0, 0, -1);
    scene.camera.up = Cartesian3.clone(Cartesian3.UNIT_Y);
    scene.camera.right = Cartesian3.clone(Cartesian3.UNIT_X);
    scene.camera.frustum = new OrthographicFrustum({
      width: 80,
      aspectRatio: 1,
      near: 1,
      far: 200,
    });
  }

  function polygon(x0, x1) {
    return new ClippingPolygon({
      positions: [
        [x0, -6],
        [x1, -6],
        [x1, 6],
        [x0, 6],
      ].map(([x, y]) => new Cartesian3(offset + x, offset + y, 0)),
    });
  }

  function collection() {
    return new ClippingPolygonCollection({
      polygons: [polygon(-18, -8), polygon(8, 18)],
    });
  }

  async function loadModel(options = {}) {
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(offset, offset, 0)),
        scale: 40,
        environmentMapOptions: { enabled: false },
        gltfCallback(gltf) {
          gltf.extensionsUsed = ["KHR_materials_unlit"];
          gltf.materials[0].extensions = { KHR_materials_unlit: {} };
          gltf.materials[0].pbrMetallicRoughness.baseColorFactor = [1, 0, 0, 1];
        },
        ...options,
      }),
    );
    await pollToPromise(() => {
      scene.renderForSpecs();
      return model.ready;
    });
    scene.renderForSpecs();
    return model;
  }

  function pixel(x, y = 0) {
    return Array.from(
      scene.context.readPixels({
        x: 40 + x,
        y: 40 + y,
        width: 1,
        height: 1,
      }),
    );
  }

  function pick(x, y = 0) {
    return scene.pick(new Cartesian2(40 + x, 39 - y), 1, 1)?.primitive;
  }

  afterEach(function () {
    scene?.destroyForSpecs();
    scene = undefined;
  });

  it("clips disjoint XY regions on a native model and reverses their union", async function () {
    setup(13000000);
    const model = await loadModel();
    const visible = pixel(0);
    expect(pick(-13)).toBe(model);
    model.clippingPolygons = collection();
    scene.renderForSpecs();
    expect(pixel(-13)).not.toEqual(visible);
    expect(pixel(13)).not.toEqual(visible);
    expect(pixel(0)).toEqual(visible);
    expect(pick(-13)).toBeUndefined();
    expect(pick(0)).toBe(model);
    model.clippingPolygons.inverse = true;
    scene.renderForSpecs();
    expect(pixel(-13)).toEqual(visible);
    expect(pixel(13)).toEqual(visible);
    expect(pixel(0)).not.toEqual(visible);
    expect(pick(-13)).toBe(model);
    expect(pick(0)).toBeUndefined();
  });

  it("publishes edits on render, reuses resources and releases them on replacement and destruction", async function () {
    setup();
    const model = await loadModel();
    expect(model.clippingPolygons).toBeUndefined();
    const polygons = collection();
    model.clippingPolygons = polygons;
    scene.renderForSpecs();
    const clipping = polygons._sceneGISPlanarClipping;
    const texture = clipping.texture;
    const resources = model._pipelineResources.slice();
    const debug = { ...clipping._debug };
    for (let i = 0; i < 20; ++i) {
      scene.renderForSpecs();
    }
    expect(clipping._debug).toEqual(debug);
    expect(model._pipelineResources).toEqual(resources);
    expect(polygons._signedDistanceTexture).toBeUndefined();
    expect(polygons._signedDistanceComputeCommand).toBeUndefined();

    for (const p of polygons.get(0).positions) {
      p.x += 13;
    }
    // Picking replays the last published clipping data.
    expect(pick(-13)).toBeUndefined();
    expect(pick(0)).toBe(model);
    expect(clipping._debug).toEqual(debug);
    scene.renderForSpecs();
    expect(pick(-13)).toBe(model);
    expect(pick(0)).toBeUndefined();
    expect(clipping.texture).toBe(texture);
    expect(model._pipelineResources).toEqual(resources);
    polygons.inverse = true;
    scene.renderForSpecs();
    expect(pick(0)).toBe(model);
    expect(model._pipelineResources).toEqual(resources);
    polygons.remove(polygons.get(1));
    scene.renderForSpecs();
    expect(pick(13)).toBeUndefined();
    expect(model._pipelineResources).toEqual(resources);
    polygons.enabled = false;
    scene.renderForSpecs();
    expect(pick(13)).toBe(model);
    polygons.enabled = true;
    polygons.removeAll();
    scene.renderForSpecs();
    expect(pick(0)).toBe(model);
    expect(pick(13)).toBe(model);
    polygons.add(polygon(8, 18));
    scene.renderForSpecs();
    expect(pick(0)).toBeUndefined();
    expect(pick(13)).toBe(model);

    const replacement = collection();
    model.clippingPolygons = replacement;
    expect(polygons.isDestroyed()).toBe(true);
    expect(texture.isDestroyed()).toBe(true);
    scene.renderForSpecs();
    const lastTexture = replacement._sceneGISPlanarClipping.texture;
    scene.primitives.remove(model);
    expect(replacement.isDestroyed()).toBe(true);
    expect(lastTexture.isDestroyed()).toBe(true);
  });

  it("keeps regions fixed in world space as a node, model and camera move", async function () {
    setup(13000000);
    const model = await loadModel();
    model.clippingPolygons = collection();
    scene.renderForSpecs();
    model.modelMatrix[12] += 10;
    scene.renderForSpecs();
    expect(pick(13)).toBeUndefined();
    expect(pick(0)).toBe(model);
    // The mesh node moves in model space, below the public model transform.
    const node = model._sceneGraph._runtimeNodes.find(
      (n) => n?.runtimePrimitives.length,
    );
    const oldTransform = Matrix4.clone(node.transform);
    node.transform = Matrix4.multiplyByTranslation(
      oldTransform,
      new Cartesian3(0.1, 0, 0),
      new Matrix4(),
    );
    node.transformDirty = true;
    scene.renderForSpecs();
    expect(pick(13)).toBeUndefined();
    expect(pick(3)).toBe(model);
    scene.camera.position.x += 4;
    scene.renderForSpecs();
    expect(pick(9)).toBeUndefined();
    expect(pick(-1)).toBe(model);
  });

  [false, true].forEach(function (logarithmic) {
    it(`clips native depth with logarithmic depth ${logarithmic}`, async function () {
      setup(13000000);
      scene.logarithmicDepthBuffer = logarithmic;
      const model = await loadModel();
      model.clippingPolygons = collection();
      scene.renderForSpecs();
      expect(scene.pickPosition(new Cartesian2(27, 39))).toBeUndefined();
      expect(scene.pickPosition(new Cartesian2(40, 39)).z).toBeCloseTo(20, 2);
    });
  });

  it("shares one planar collection through native tileset loading and updates", async function () {
    setup(13000000);
    const transform = Matrix4.fromUniformScale(40);
    transform[12] = transform[13] = offset;
    const json = {
      asset: { version: "1.1" },
      geometricError: 1000,
      root: {
        boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
        geometricError: 0,
        content: {
          uri: new URL(
            "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
            window.location.href,
          ).href,
        },
      },
    };
    const polygons = collection();
    const tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        `data:application/json,${encodeURIComponent(JSON.stringify(json))}`,
        { modelMatrix: transform, clippingPolygons: polygons },
      ),
    );
    await pollToPromise(() => {
      scene.renderForSpecs();
      return tileset.tilesLoaded && tileset.root.contentReady;
    });
    scene.renderForSpecs();
    expect(pick(-13)).toBeUndefined();
    expect(pick(13)).toBeUndefined();
    expect(pick(0)).toBe(tileset);
    const texture = polygons._sceneGISPlanarClipping.texture;
    expect(tileset.root.content._model.clippingPolygons).toBe(polygons);
    expect(
      polygons.computeIntersectionWithBoundingVolume(
        new TileBoundingSphere(new Cartesian3(offset, offset, 0), 20),
      ),
    ).toBe(Intersect.INTERSECTING);
    polygons.inverse = true;
    scene.renderForSpecs();
    expect(pick(0)).toBeUndefined();
    expect(pick(13)).toBe(tileset);
    polygons.enabled = false;
    scene.renderForSpecs();
    expect(pick(0)).toBe(tileset);
    polygons.enabled = true;
    scene.renderForSpecs();
    expect(pick(0)).toBeUndefined();
    tileset.clippingPolygons = undefined;
    scene.renderForSpecs();
    expect(pick(0)).toBe(tileset);
    expect(texture.isDestroyed()).toBe(true);
  });

  it("clips the native model shadow with the same world-space regions", async function () {
    setup(13000000);
    scene.world.show = true;
    scene.world.baseColor = Color.WHITE;
    scene.gamma = 1;
    scene.world.shadows = ShadowMode.RECEIVE_ONLY;
    scene.light = new DirectionalLight({ direction: new Cartesian3(1, 0, -1) });
    scene.shadowMap.enabled = true;
    scene.shadowMap.size = 1024;
    scene.shadowMap.maximumDistance = 200;
    scene.shadowMap.darkness = 0.2;
    const model = await loadModel({
      scale: 8,
      modelMatrix: Matrix4.fromTranslation(new Cartesian3(offset, offset, 16)),
      shadows: ShadowMode.CAST_ONLY,
    });
    expect(pixel(16)[0]).toBeLessThan(180);
    model.clippingPolygons = new ClippingPolygonCollection({
      polygons: [polygon(-6, 6)],
    });
    scene.renderForSpecs();
    expect(pixel(16)[0]).toBeGreaterThan(240);
    model.clippingPolygons.inverse = true;
    scene.renderForSpecs();
    expect(pixel(16)[0]).toBeLessThan(180);
  });
});
