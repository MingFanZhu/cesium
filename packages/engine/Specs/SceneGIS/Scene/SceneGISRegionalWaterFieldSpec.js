import {
  BoundingRectangle,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  DirectionalLight,
  Ellipsoid,
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
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISRegionalWaterField", function () {
  let scene, water, waves, matrix;
  const time = JulianDate.fromIso8601("2026-06-21T04:00:00Z");
  function point(x, y, z) {
    return Matrix4.multiplyByPoint(
      matrix,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function vector(x, y, z) {
    return Matrix4.multiplyByPointAsVector(
      matrix,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function ring(size, z = 0) {
    return new PolygonHierarchy([
      point(-size, -size, z),
      point(size, -size, z),
      point(size, size, z),
      point(-size, size, z),
    ]);
  }
  function setup(planar) {
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
      // Exact ENU at an equatorial source, away from the ECEF origin.
      matrix = Matrix4.fromArray([
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        1,
        0,
        0,
        0,
        Ellipsoid.WGS84.maximumRadius + 100,
        0,
        0,
        1,
      ]);
    }
    scene.light = new DirectionalLight({
      direction: vector(0, 0, -1),
      color: Color.WHITE,
    });
    camera(0, 0, 8);
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 200;
  }
  function camera(x, y, z) {
    scene.camera.setView({
      destination: point(x, y, z),
      orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
    });
  }
  function bathymetry() {
    return {
      modelMatrix: matrix,
      rectangle: new BoundingRectangle(-12, -12, 24, 24),
      width: 33,
      height: 33,
      depths: new Float32Array(33 * 33).fill(2),
    };
  }
  function pixels(field) {
    return scene.context.readPixels({
      framebuffer: field.caustics,
      x: 112,
      y: 112,
      width: 32,
      height: 32,
    });
  }
  afterEach(function () {
    scene?.primitives.removeAll();
    waves?.destroy();
    scene?.destroyForSpecs();
    scene = water = waves = undefined;
  });
  [true, false].forEach(function (planar) {
    it(`refracts actual ${planar ? "Planar" : "Globe"} river waves on a sloping mean field with stable phase and ownership`, function () {
      setup(planar);
      const descriptor = bathymetry();
      water = scene.primitives.add(
        new SceneGISRiverSurface({
          world: scene.world,
          positions: [point(-30, 0, 1.5), point(30, 0, -1.5)],
          widths: 50,
          speeds: 1.2,
          bathymetry: descriptor,
          causticsIntensity: 1,
          underwaterDepth: 5,
          currentRippleAmplitude: 0,
          foamIntensity: 0,
          reflections: false,
          absorption: new Cartesian3(0.05, 0.05, 0.05),
          scattering: Cartesian3.ZERO,
        }),
      );
      const surface = water._surface,
        field = surface._field;
      expect(field.regional.surface[2]).toEqualEpsilon(0.6, 0.001);
      const center = (16 * 33 + 16) * 4;
      expect(field.regional.flow[center]).toEqualEpsilon(1, 1e-5);
      expect(field.regional.flow[center + 2]).toEqualEpsilon(1.2, 1e-5);
      expect(
        field.regional.chartOrigin.x + field.regional.surface[center],
      ).toEqualEpsilon(
        surface._gridMesh.chart.project(point(0, 0, 0)).x,
        0.001,
      );
      descriptor.depths.fill(100);
      descriptor.modelMatrix = Matrix4.ZERO;
      expect(field.data[0]).toEqual(2);
      scene.renderForSpecs(time);
      const calm = pixels(field);
      expect(calm[0]).toEqualEpsilon(0x3c00, 4);
      const draw = spyOn(field.causticsCommand, "execute").and.callThrough();
      camera(1, 0, 8);
      scene.renderForSpecs(time);
      expect(draw).not.toHaveBeenCalled();
      expect(pixels(field)).toEqual(calm);
      water.currentRippleAmplitude = 0.3;
      scene.renderForSpecs(time);
      expect(draw).toHaveBeenCalled();
      expect(pixels(field)).not.toEqual(calm);
      const moving = pixels(field);
      scene.renderForSpecs(JulianDate.addSeconds(time, 1, new JulianDate()));
      expect(pixels(field)).not.toEqual(moving);
      const beforeLight = pixels(field);
      scene.light.direction = vector(0.3, 0, -1);
      scene.renderForSpecs(JulianDate.addSeconds(time, 1, new JulianDate()));
      expect(pixels(field)).not.toEqual(beforeLight);
      // An actual opaque bed exercises both receiver transforms and depth paths.
      scene.primitives.add(
        new Primitive({
          geometryInstances: new GeometryInstance({
            geometry: new CoplanarPolygonGeometry({
              polygonHierarchy: new PolygonHierarchy([
                new Cartesian3(-20, -20, -1),
                new Cartesian3(20, -20, -3),
                new Cartesian3(20, 20, -3),
                new Cartesian3(-20, 20, -1),
              ]),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
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
      const pixel = () =>
        Array.from(
          scene.context.readPixels({ x: 56, y: 56, width: 16, height: 16 }),
        );
      for (const z of [6, -0.3]) {
        camera(0, 0, z);
        water.causticsIntensity = 0;
        scene.renderForSpecs(time);
        const plain = pixel();
        water.causticsIntensity = 2;
        scene.renderForSpecs(time);
        expect(pixel()).not.toEqual(plain);
        const frozen = pixel();
        scene.renderForSpecs(time);
        expect(pixel()).toEqual(frozen);
      }
      expect(surface._underwater.active).toBeTrue();
      const textures = [
        field.bed,
        field.surfaceMap,
        field.tangentMap,
        field.flowMap,
        field.caustics.getColorTexture(0),
        ...field.foam.map((f) => f.getColorTexture(0)),
        surface._domain.texture,
      ];
      scene.primitives.remove(water);
      expect(textures.every((t) => t.isDestroyed())).toBeTrue();
    });
  });
  it("uses the borrowed ellipsoid wind FFT and rejects invalid regional frames", function () {
    setup(false);
    waves = new SceneGISWindWaves({
      resolution: 32,
      patchLength: 16,
      windSpeed: 6,
    });
    const options = {
      geometryMode: "ellipsoid",
      polygonHierarchy: ring(40),
      perPositionHeight: true,
      windWaves: waves,
      bathymetry: bathymetry(),
      causticsIntensity: 1,
      foamIntensity: 0,
    };
    for (const modelMatrix of [
      undefined,
      Matrix4.fromUniformScale(2),
      Matrix4.IDENTITY,
    ]) {
      expect(
        () =>
          new SceneGISWaterSurface({
            ...options,
            bathymetry: { ...options.bathymetry, modelMatrix },
          }),
      ).toThrowDeveloperError();
    }
    expect(
      () =>
        new SceneGISWaterSurface({
          ...options,
          bathymetry: {
            ...options.bathymetry,
            rectangle: new BoundingRectangle(-5000, 0, 20, 20),
          },
        }),
    ).toThrowDeveloperError();
    water = scene.primitives.add(new SceneGISWaterSurface(options));
    scene.renderForSpecs(time);
    const field = water._field,
      before = pixels(field);
    scene.renderForSpecs(JulianDate.addSeconds(time, 1, new JulianDate()));
    expect(pixels(field)).not.toEqual(before);
    waves.windSpeed = 0;
    scene.renderForSpecs(time);
    expect(pixels(field)[0]).toEqualEpsilon(0x3c00, 4);
    const textures = [
      field.bed,
      field.surfaceMap,
      field.tangentMap,
      field.caustics.getColorTexture(0),
    ];
    scene.primitives.remove(water);
    expect(textures.every((t) => t.isDestroyed())).toBeTrue();
    expect(waves.isDestroyed()).toBeFalse();
  });

  it("keeps the original corridor and hole mask in the regional grid", function () {
    setup(true);
    const mask = ring(40);
    mask.holes.push(ring(2));
    water = scene.primitives.add(
      new SceneGISRiverSurface({
        world: scene.world,
        positions: [point(-30, 0, 0), point(30, 0, 0)],
        widths: 20,
        polygonHierarchy: mask,
        bathymetry: bathymetry(),
        currentRippleAmplitude: 0,
        causticsIntensity: 1,
        foamIntensity: 0,
      }),
    );
    const field = water._surface._field;
    expect(field.data[(16 * 33 + 16) * 4 + 1]).toBe(0);
    expect(field.data[(0 * 33 + 16) * 4 + 1]).toBe(0);
    expect(field.data[(16 * 33 + 26) * 4 + 1]).toBe(1);
    scene.renderForSpecs(time);
    expect(
      scene.context.readPixels({
        framebuffer: field.caustics,
        x: 128,
        y: 128,
        width: 1,
        height: 1,
      })[0],
    ).toBe(0);
  });
});
