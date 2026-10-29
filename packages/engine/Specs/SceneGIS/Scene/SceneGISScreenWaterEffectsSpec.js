import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  DirectionalLight,
  GeometryInstance,
  Globe,
  JulianDate,
  Matrix4,
  PerInstanceColorAppearance,
  PolygonHierarchy,
  Primitive,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISRiverSurface,
  SceneGISWaterSurface,
  SceneGISWindWaves,
  Transforms,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISScreenWaterEffects", function () {
  let scene, water, waves, matrix;
  const time = JulianDate.fromIso8601("2026-06-21T04:00:00Z");
  const point = (x, y, z) =>
    Matrix4.multiplyByPoint(matrix, new Cartesian3(x, y, z), new Cartesian3());
  const vector = (x, y, z) =>
    Matrix4.multiplyByPointAsVector(
      matrix,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  function ring(size, z = 0, world = false, slope = 0) {
    const p = [
      [-size, -size],
      [size, -size],
      [size, size],
      [-size, size],
    ];
    return new PolygonHierarchy(
      p.map(([x, y]) =>
        world
          ? point(x, y, z + slope * x)
          : new Cartesian3(x, y, z + slope * x),
      ),
    );
  }
  function camera(z, x = 0) {
    scene.camera.setView({
      destination: point(x, -1, z),
      orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
    });
  }
  function render(t = time) {
    scene.renderForSpecs(t);
  }
  const pixels = () =>
    Array.from(
      scene.context.readPixels({ x: 40, y: 40, width: 48, height: 48 }),
    );
  function setup(mode) {
    const planar = mode.includes("planar"),
      river = mode.includes("river"),
      curved = mode.includes("curved");
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    if (planar) {
      matrix = Matrix4.fromTranslation(
        new Cartesian3(20000000, -30000000, 100),
      );
      scene._initializeWorld(
        new SceneGISPlanarWorld({
          coordinateSystem: new SceneGISPlanarCoordinateSystem({
            extent: new SceneGISPlanarExtent({
              minimumX: 19999000,
              maximumX: 20001000,
              minimumY: -30001000,
              maximumY: -29999000,
            }),
          }),
          maximumLevel: 0,
        }),
      );
    } else {
      scene.globe = new Globe();
      scene.globe.show = false;
      matrix = Transforms.eastNorthUpToFixedFrame(
        Cartesian3.fromDegrees(118, 32, 100),
      );
    }
    scene.light = new DirectionalLight({
      direction: vector(0.1, 0, -1),
      color: Color.WHITE,
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 200;
    camera(8);
    const options = {
      underwaterDepth: 6,
      causticsIntensity: 0,
      foamIntensity: 0,
      roughness: 0.7,
      refractionStrength: 0,
      reflections: false,
      reflectionColor: Color.BLACK,
      absorption: new Cartesian3(0.03, 0.03, 0.03),
      scattering: Cartesian3.ZERO,
    };
    if (river) {
      water = scene.primitives.add(
        new SceneGISRiverSurface({
          ...options,
          world: scene.world,
          positions: [point(-30, 0, 1.5), point(30, 0, -1.5)],
          widths: 50,
          speeds: [0.6, 1.5],
          currentRippleAmplitude: 0.35,
        }),
      );
    } else {
      waves = mode.includes("normal")
        ? undefined
        : new SceneGISWindWaves({
            resolution: 32,
            patchLength: 16,
            windSpeed: 6,
            whitecapIntensity: 0,
          });
      water = scene.primitives.add(
        new SceneGISWaterSurface({
          ...options,
          windWaves: waves,
          ...(curved
            ? {
                geometryMode: "ellipsoid",
                polygonHierarchy: ring(
                  40,
                  0,
                  true,
                  mode.includes("slope") ? -0.05 : 0,
                ),
                perPositionHeight: true,
              }
            : { polygonHierarchy: ring(40), modelMatrix: matrix }),
        }),
      );
    }
    scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: new CoplanarPolygonGeometry({
            polygonHierarchy: ring(
              40,
              -2,
              false,
              river || mode.includes("slope") ? -0.05 : 0,
            ),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(0.5, 0.5, 0.5, 1),
            ),
          },
        }),
        modelMatrix: matrix,
        asynchronous: false,
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
      }),
    );
  }
  afterEach(function () {
    scene?.primitives.removeAll();
    waves?.destroy();
    scene?.destroyForSpecs();
    scene = water = waves = undefined;
  });

  [
    "normal-planar",
    "normal-globe",
    "local-planar",
    "local-globe",
    "curved-globe",
    "curved-slope-globe",
    "river-planar",
    "river-globe",
  ].forEach(function (mode) {
    it(`uses visible receivers for ${mode} caustics above/below water without effect fields`, function () {
      setup(mode);
      render();
      const surface = water._surface ?? water;
      expect(surface._field).toBeUndefined();
      for (const z of [8, -0.3]) {
        camera(z);
        water.causticsIntensity = 0;
        render();
        const plain = pixels();
        water.causticsIntensity = 1;
        render();
        const focused = pixels();
        expect(focused).not.toEqual(plain);
        render();
        expect(pixels()).toEqual(focused);
        render(JulianDate.addSeconds(time, 1, new JulianDate()));
        expect(pixels()).not.toEqual(focused);
        scene.light.direction = vector(z > 0 ? -0.35 : 0.25, 0, -1);
        render();
        expect(pixels()).not.toEqual(focused);
        camera(z, 0.5);
        render();
        expect(surface._field).toBeUndefined();
      }
      expect(surface._underwater.active).toBeTrue();
      const textures = [
        surface._underwater.texture,
        surface._domain?.texture,
      ].filter(Boolean);
      scene.primitives.remove(water);
      expect(textures.every((t) => t.isDestroyed())).toBeTrue();
      if (waves) {
        expect(waves.isDestroyed()).toBeFalse();
      }
    });
  });
  it("keeps calm focusing neutral and never invents sky/hidden receivers", function () {
    setup("local-planar");
    waves.windSpeed = 0;
    for (const z of [8, -0.3]) {
      camera(z);
      water.causticsIntensity = 0;
      render();
      const plain = pixels();
      water.causticsIntensity = 2;
      render();
      expect(pixels()).toEqual(plain);
    }
    scene.primitives.get(1).show = false;
    camera(8);
    water.causticsIntensity = 0;
    render();
    const sky = pixels();
    water.causticsIntensity = 2;
    render();
    expect(pixels()).toEqual(sky);
  });
  ["river-planar", "river-globe"].forEach(function (mode) {
    it(`generates ${mode} contact foam even with zero current waves`, async function () {
      setup(mode);
      water.currentRippleAmplitude = 0;
      water.causticsIntensity = 0;
      water.foamWidth = 0.5;
      scene.primitives.get(1).modelMatrix = Matrix4.multiplyByTranslation(
        matrix,
        new Cartesian3(0, 0, 1.9),
        new Matrix4(),
      );
      camera(8);
      water.foamIntensity = 0;
      render();
      const plain = pixels();
      water.foamIntensity = 1;
      render();
      const state = scene.frameState._sceneGISWater;
      await state.foamMaterial._promise;
      render();
      expect(pixels()).not.toEqual(plain);
      const frozen = pixels();
      render();
      expect(pixels()).toEqual(frozen);
      water.foamWidth = 0;
      render();
      expect(pixels()).toEqual(plain);
    });
  });
  it("accepts caustics without any depth-grid descriptor", function () {
    matrix = Matrix4.IDENTITY;
    const value = new SceneGISWaterSurface({
      polygonHierarchy: ring(1),
      causticsIntensity: 1,
    });
    expect(value.causticsIntensity).toBe(1);
    value.destroy();
  });
});
