import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  Ellipsoid,
  Framebuffer,
  GeometryInstance,
  Globe,
  JulianDate,
  Matrix3,
  Matrix4,
  OrthographicFrustum,
  PerInstanceColorAppearance,
  PixelDatatype,
  PixelFormat,
  PolygonHierarchy,
  Primitive,
  Sampler,
  SceneGISWaterSurface,
  SceneGISWindWaves,
  ShaderSource,
  Texture,
  Transforms,
} from "../../../index.js";
import Underwater from "../../../Source/SceneGIS/Scene/_private/_SceneGISUnderwater.js";
import Mesh from "../../../Source/SceneGIS/Scene/_private/_SceneGISEllipsoidWaterMesh.js";
import volume from "../../../Source/Shaders/SceneGIS/Water/SceneGISUnderwaterVolume.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createContext from "../../../../../Specs/createContext.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISGlobeUnderwater", function () {
  let scene, water, waves, context, target, command, edges;
  const time = JulianDate.fromIso8601("2026-06-21T04:00:00Z");
  function polygon(west, south, east, north) {
    return new PolygonHierarchy(
      Cartesian3.fromDegreesArray([
        west,
        south,
        east,
        south,
        east,
        north,
        west,
        north,
      ]),
    );
  }
  function ring(size, z = 0) {
    return new PolygonHierarchy([
      new Cartesian3(-size, -size, z),
      new Cartesian3(size, -size, z),
      new Cartesian3(size, size, z),
      new Cartesian3(-size, size, z),
    ]);
  }
  afterEach(function () {
    scene?.primitives.removeAll();
    if (!scene) {
      water?.destroy();
    }
    waves?.destroy();
    scene?.destroyForSpecs();
    command?.shaderProgram.destroy();
    edges?.destroy();
    target?.destroy();
    context?.destroyForSpecs();
    scene = water = waves = context = target = command = edges = undefined;
  });

  it("uses actual ellipsoid height away from the chart origin and excludes holes, caps and the opposite hemisphere", function () {
    const hierarchy = polygon(117, 30, 120, 33);
    hierarchy.holes.push(polygon(118.1, 31, 118.4, 31.3));
    const mesh = new Mesh(hierarchy, Ellipsoid.WGS84, 30, false, 1);
    const medium = new Underwater(mesh.hierarchy, mesh);
    const surface = { show: true, underwaterDepth: 10 };
    const update = (lon, lat, height) =>
      medium.update(surface, {
        camera: { positionWC: Cartesian3.fromDegrees(lon, lat, height) },
      });
    update(119.5, 32.5, 29.75);
    expect(medium.active).toBeTrue();
    expect(medium.camera.z).toEqualEpsilon(-0.25, 1e-7);
    update(118.2, 31.1, 29.75);
    expect(medium.active).toBeFalse();
    for (const height of [30.1, 19.9]) {
      update(119.5, 32.5, height);
      expect(medium.active).toBeFalse();
    }
    expect(() => update(-60, -32.5, 29.75)).not.toThrow();
    expect(medium.active).toBeFalse();
    medium.destroy();
  });

  it("keeps immersion stable across the date line and near a polar chart", function () {
    for (const [hierarchy, lon, lat] of [
      [polygon(179, 40, -179, 42), 179.7, 41],
      [
        new PolygonHierarchy(
          Cartesian3.fromDegreesArray([-135, 89, -45, 89, 45, 89, 135, 89]),
        ),
        0,
        89.9,
      ],
    ]) {
      const mesh = new Mesh(hierarchy, Ellipsoid.WGS84, 20, false, 1);
      const medium = new Underwater(mesh.hierarchy, mesh);
      medium.update(
        { show: true, underwaterDepth: 5 },
        { camera: { positionWC: Cartesian3.fromDegrees(lon, lat, 19) } },
      );
      expect(medium.active).toBeTrue();
      expect(medium.camera.z).toEqualEpsilon(-1, 1e-7);
      medium.destroy();
    }
  });

  function rayHarness(hierarchy, curved = true) {
    context = createContext();
    target = new Framebuffer({
      context,
      colorTextures: [
        new Texture({
          context,
          width: 1,
          height: 1,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: PixelDatatype.FLOAT,
        }),
      ],
    });
    const medium = new Underwater(hierarchy);
    edges = new Texture({
      context,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      sampler: Sampler.NEAREST,
      flipY: false,
      source: {
        width: medium.edges.length / 4,
        height: 1,
        arrayBufferView: medium.edges,
      },
    });
    const state = {
      origin: new Cartesian3(0, 0, -0.25),
      direction: Cartesian3.clone(Cartesian3.UNIT_Z),
    };
    command = context.createViewportQuadCommand(
      new ShaderSource({
        defines: curved ? ["SCENEGIS_ELLIPSOID_UNDERWATER"] : [],
        sources: [
          `uniform float u_underwaterDepth, u_cameraDepth;`,
          volume,
          `
        uniform vec3 u_origin, u_direction;
        void main() {
          float distance = 0.0;
          bool inside = sceneGISWaterVolumeRay(u_origin, normalize(u_direction), distance);
          out_FragColor = vec4(inside ? distance : -1.0,
            sceneGISWaterVolumeDepth(u_origin), 0.0, 1.0);
        }`,
        ],
      }),
      {
        framebuffer: target,
        uniformMap: {
          u_edges: () => edges,
          u_edgeCount: () => medium.edges.length / 4,
          u_underwaterDepth: () => 2,
          u_cameraDepth: () => 0.25,
          u_volumeRadius: () => 6371000,
          u_chartRadius: () => 6371000,
          u_waterToChart: () => Matrix3.IDENTITY,
          u_chartCamera: () => Cartesian2.ZERO,
          u_origin: () => state.origin,
          u_direction: () => state.direction,
        },
      },
    );
    return (origin, direction) => {
      Cartesian3.clone(origin, state.origin);
      Cartesian3.clone(direction, state.direction);
      command.execute(context);
      return Array.from(
        context.readPixels({ framebuffer: target, width: 1, height: 1 }),
      );
    };
  }

  it("clips GPU rays at curved surface and bottom with stable Earth-scale roots", function () {
    const ray = rayHarness(ring(10000));
    expect(
      ray(new Cartesian3(0, 0, -0.25), Cartesian3.UNIT_Z)[0],
    ).toEqualEpsilon(0.25, 1e-5);
    expect(
      ray(new Cartesian3(0, 0, -0.25), new Cartesian3(0, 0, -1))[0],
    ).toEqualEpsilon(1.75, 1e-5);
    // A horizontal ray exits the curved surface; a tangent plane cannot give this root.
    expect(ray(new Cartesian3(0, 0, -1), Cartesian3.UNIT_X)[0]).toEqualEpsilon(
      Math.sqrt(2 * 6371000 - 1),
      0.01,
    );
    expect(
      ray(new Cartesian3(0, 0, -0.0001), Cartesian3.UNIT_Z)[0],
    ).toEqualEpsilon(0.0001, 1e-7);
    expect(ray(new Cartesian3(0, 0, 0.1), Cartesian3.UNIT_Z)[0]).toBe(-1);
    expect(ray(new Cartesian3(0, 0, -2.1), Cartesian3.UNIT_Z)[0]).toBe(-1);
  });

  for (const curved of [false, true]) {
    it(`clips ${curved ? "curved" : "local"} shore/hole rays and independently checks orthographic origins`, function () {
      const hierarchy = ring(20);
      hierarchy.holes.push(ring(2));
      const ray = rayHarness(hierarchy, curved);
      expect(
        ray(new Cartesian3(6, 0, -0.25), new Cartesian3(-1, 0, 0))[0],
      ).toEqualEpsilon(4, 1e-4);
      expect(
        ray(new Cartesian3(6, 0, -0.25), Cartesian3.UNIT_X)[0],
      ).toEqualEpsilon(14, 1e-4);
      expect(ray(new Cartesian3(0, 0, -0.25), Cartesian3.UNIT_X)[0]).toBe(-1);
      expect(
        ray(new Cartesian3(21, 0, -0.25), new Cartesian3(-1, 0, 0))[0],
      ).toBe(-1);
    });
  }

  it("validates unsupported variable levels and curved bathymetry without allocating GPU resources", function () {
    waves = new SceneGISWindWaves({ resolution: 32 });
    const hierarchy = polygon(117, 30, 118, 31);
    const options = {
      geometryMode: "ellipsoid",
      polygonHierarchy: hierarchy,
      windWaves: waves,
      underwaterDepth: 2,
      height: 30,
    };
    water = new SceneGISWaterSurface(options);
    expect(water.ready).toBeFalse();
    expect(water.underwaterDepth).toBe(2);
    hierarchy.positions[0] = Cartesian3.fromDegrees(117, 30, 10);
    expect(
      () => new SceneGISWaterSurface({ ...options, perPositionHeight: true }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISWaterSurface({
          ...options,
          underwaterDepth: Ellipsoid.WGS84.minimumRadius + 30,
        }),
    ).toThrowDeveloperError();
    expect(
      () => new SceneGISWaterSurface({ ...options, bathymetry: {} }),
    ).toThrowDeveloperError();
  });

  function setup(orthographic = false, hole = true) {
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.globe = new Globe();
    scene.globe.show = false;
    const transform = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(-74, 40, 100),
    );
    const point = (x, y, z) =>
      Matrix4.multiplyByPoint(
        transform,
        new Cartesian3(x, y, z),
        new Cartesian3(),
      );
    const vector = (x, y, z) =>
      Matrix4.multiplyByPointAsVector(
        transform,
        new Cartesian3(x, y, z),
        new Cartesian3(),
      );
    const hierarchy = ring(12);
    if (hole) {
      hierarchy.holes.push(ring(2));
    }
    const worldRing = (r) =>
      new PolygonHierarchy(
        r.positions.map((p) => point(p.x, p.y, 0)),
        r.holes.map(worldRing),
      );
    waves = new SceneGISWindWaves({
      resolution: 32,
      windSpeed: 0,
      whitecapIntensity: 0,
    });
    water = scene.primitives.add(
      new SceneGISWaterSurface({
        geometryMode: "ellipsoid",
        polygonHierarchy: worldRing(hierarchy),
        height: 100,
        windWaves: waves,
        foamIntensity: 0,
        absorption: new Cartesian3(0.5, 0, 0),
        scattering: Cartesian3.ZERO,
        reflections: false,
        reflectionColor: Color.BLUE,
        maximumTileCount: 64,
      }),
    );
    scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: new CoplanarPolygonGeometry({
            polygonHierarchy: ring(30, -1),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
          },
        }),
        modelMatrix: transform,
        asynchronous: false,
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
      }),
    );
    const camera = (x, y, z, dy = 0, dz = -1) =>
      scene.camera.setView({
        destination: point(x, y, z),
        orientation: {
          direction: Cartesian3.normalize(vector(0, dy, dz), new Cartesian3()),
          up: vector(
            0,
            dz === -1 || dz === 1 ? 1 : 0,
            dz === -1 || dz === 1 ? 0 : 1,
          ),
        },
      });
    camera(6, 0, -0.25);
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 200;
    if (orthographic) {
      scene.camera.frustum = new OrthographicFrustum({
        width: 10,
        aspectRatio: 1,
        near: 0.1,
        far: 200,
      });
    }
    return { camera, point };
  }
  const center = () =>
    Array.from(scene.context.readPixels({ x: 64, y: 64, width: 1, height: 1 }));
  [false, true].forEach(function (orthographic) {
    it(`renders immersed curved water looking down, preserves boundaries and releases resources (${orthographic ? "orthographic" : "perspective"})`, function () {
      const { camera } = setup(orthographic);
      scene.renderForSpecs(time);
      const clear = center();
      water.underwaterDepth = 2;
      scene.renderForSpecs(time);
      expect(water._underwater.active).toBeTrue();
      expect(scene.frameState._sceneGISWater.ready).toBeTrue();
      const tinted = center();
      expect(tinted[0]).toBeLessThan(clear[0] * 0.9);
      expect(tinted[1]).toEqualEpsilon(clear[1], 1);
      scene.renderForSpecs(time);
      expect(center()).toEqual(tinted);
      const medium = water._underwater,
        texture = medium.texture;
      const execute = spyOn(medium.command, "execute").and.callThrough();
      scene.pick(new Cartesian2(64, 64));
      expect(execute).not.toHaveBeenCalled();
      for (const [x, z] of [
        [0, -0.25],
        [13, -0.25],
        [6, -2.1],
        [6, 0.25],
      ]) {
        camera(x, 0, z);
        scene.renderForSpecs(time);
        expect(medium.active).toBeFalse();
      }
      camera(6, 0, -0.25);
      water.underwaterDepth = 0;
      scene.renderForSpecs(time);
      expect(center()).toEqual(clear);
      water.underwaterDepth = 2;
      scene.renderForSpecs(time);
      const program = medium.command.shaderProgram;
      const destroy = spyOn(program, "destroy").and.callThrough();
      scene.primitives.remove(water);
      water = undefined;
      expect(texture.isDestroyed()).toBeTrue();
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(waves.isDestroyed()).toBeFalse();
    });
  });
  it("reflects submerged opaque receivers from the curved FFT underside", function () {
    const { camera } = setup(false, false);
    water.underwaterDepth = 2;
    water.absorption = Cartesian3.clone(Cartesian3.ZERO);
    water.reflectionColor = Color.BLACK;
    camera(0, -4, -0.5, 4, 0.5);
    scene.renderForSpecs(time);
    const without = scene.context.readPixels();
    water.reflections = true;
    water.reflectionSteps = 16;
    scene.renderForSpecs(time);
    expect(
      scene.context
        .readPixels()
        .some((v, i) => i % 4 !== 3 && v > without[i] + 20),
    ).toBeTrue();
  });
});
