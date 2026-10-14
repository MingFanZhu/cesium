import {
  BoxGeometry,
  Cartesian3,
  Cesium3DTileset,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Matrix3,
  Matrix4,
  PolygonHierarchy,
  PerInstanceColorAppearance,
  PerspectiveFrustum,
  Primitive,
  SceneGISWaterSurface,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import Cesium3DTilesTester from "../../../../../Specs/Cesium3DTilesTester.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredGaussian", function () {
  let scene;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, -15),
      orientation: { direction: Cartesian3.UNIT_Z, up: Cartesian3.UNIT_Y },
    });
    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 0.1,
      far: 100,
    });
  });
  afterEach(function () {
    scene.destroyForSpecs();
  });

  function pixels() {
    scene.renderForSpecs();
    return scene.context.readPixels();
  }
  function greenBlueMax(rgba) {
    let maximum = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      maximum = Math.max(maximum, rgba[i + 1], rgba[i + 2]);
    }
    return maximum;
  }
  function expectRed() {
    const rgba = pixels();
    const center = (32 * 64 + 32) * 4;
    expect(Array.from(rgba.slice(center, center + 3))).toEqual([255, 0, 0]);
    expect(greenBlueMax(rgba)).toBe(0);
  }

  async function loadSplats() {
    const tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        "./Data/Cesium3DTiles/GaussianSplats/sh_unit_cube/tileset.json",
        {
          modelMatrix: Matrix4.multiplyByUniformScale(
            Matrix4.fromTranslation(new Cartesian3(6999997, 3, 3)),
            0.06,
            new Matrix4(),
          ),
          cullRequestsWhileMoving: false,
          maximumScreenSpaceError: 1,
        },
      ),
    );
    await Cesium3DTilesTester.waitForTilesLoaded(scene, tileset);
    await pollToPromise(() => {
      scene.renderForSpecs();
      return tileset.gaussianSplatPrimitive?.isStable;
    });
    return tileset;
  }

  it("preserves native splat color and foreground opaque occlusion across frusta", async function () {
    const tileset = await loadSplats();
    expect(greenBlueMax(pixels())).toBeGreaterThan(30);
    const surface = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(10, 10, 0.2),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
          },
        }),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 5)),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
      }),
    );
    expect(greenBlueMax(pixels())).toBeGreaterThan(30);
    surface.modelMatrix = Matrix4.fromTranslation(
      new Cartesian3(7000000, 0, -5),
    );
    expectRed();
    scene.logarithmicDepthBuffer = true;
    scene.logarithmicDepthFarToNearRatio = 1.3;
    expectRed();
    expect(scene._sceneGISDeferred._multiFrustum).toBe(true);
    surface.modelMatrix = Matrix4.fromTranslation(
      new Cartesian3(7000000, 0, 5),
    );
    expect(greenBlueMax(pixels())).toBeGreaterThan(30);
    tileset.show = false;
    expectRed();
    const waterMatrix = (z) =>
      Matrix4.fromRotationTranslation(
        Matrix3.fromRotationX(Math.PI),
        new Cartesian3(7000000, 0, z),
      );
    const water = scene.primitives.add(
      new SceneGISWaterSurface({
        polygonHierarchy: new PolygonHierarchy([
          new Cartesian3(-5, -5, 0),
          new Cartesian3(5, -5, 0),
          new Cartesian3(5, 5, 0),
          new Cartesian3(-5, 5, 0),
        ]),
        modelMatrix: waterMatrix(-5),
        waveAmplitude: 0,
        foamIntensity: 0,
        reflections: false,
        refractionStrength: 0,
      }),
    );
    const waterOnly = pixels();
    tileset.show = true;
    expect(pixels()).toEqual(waterOnly);
    water.modelMatrix = waterMatrix(4);
    const waterBehind = pixels();
    tileset.show = false;
    const withoutSplats = pixels();
    const difference = waterBehind.reduce(
      (maximum, value, i) =>
        Math.max(maximum, Math.abs(value - withoutSplats[i])),
      0,
    );
    expect(difference).toBeGreaterThan(30);
    expect(scene.context._gl.getError()).toBe(0);
    const primitive = tileset.gaussianSplatPrimitive;
    const texture = primitive.gaussianSplatTexture;
    const harmonics = primitive.sphericalHarmonicsTexture;
    const vertexArray = primitive._vertexArray;
    expect(texture).toBeDefined();
    expect(harmonics).toBeDefined();
    expect(vertexArray).toBeDefined();
    scene.primitives.remove(tileset);
    expect(primitive.isDestroyed()).toBe(true);
    expect(texture.isDestroyed()).toBe(true);
    expect(harmonics.isDestroyed()).toBe(true);
    expect(vertexArray.isDestroyed()).toBe(true);
    expect(tileset.gaussianSplatPrimitive).toBeUndefined();
  });

  it("allows collection removal after explicit splat destruction", async function () {
    const tileset = await loadSplats();
    const primitive = tileset.gaussianSplatPrimitive;
    primitive.destroy();
    expect(scene.primitives.remove(tileset)).toBe(true);
    expect(tileset.isDestroyed()).toBe(true);
    expect(tileset.gaussianSplatPrimitive).toBeUndefined();
  });
});
