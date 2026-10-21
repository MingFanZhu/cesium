import {
  Cartesian3,
  Color,
  DirectionalLight,
  Ellipsoid,
  Globe,
  JulianDate,
  Matrix4,
  PolygonHierarchy,
  SceneGISRiverSurface,
  SceneGISWindWaves,
  SceneGISPlanarWorld,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneTransforms,
  Transforms,
} from "../../../index.js";
import RiverGeometry from "../../../Source/SceneGIS/Scene/_private/_SceneGISRiverGeometry.js";
import Mesh from "../../../Source/SceneGIS/Scene/_private/_SceneGISEllipsoidWaterMesh.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISRiverSurface", function () {
  let scene, river, waves, matrix;
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
  function ring(x0, y0, x1, y1) {
    return new PolygonHierarchy([
      new Cartesian3(x0, y0, 999),
      new Cartesian3(x1, y0, 999),
      new Cartesian3(x1, y1, 999),
      new Cartesian3(x0, y1, 999),
    ]);
  }
  function mesh(options, ellipsoid) {
    const domain = new RiverGeometry(options, ellipsoid);
    return new Mesh(undefined, ellipsoid, 0, true, 1, domain);
  }
  afterEach(function () {
    if (scene) {
      scene.primitives.removeAll();
    } else {
      river?.destroy();
    }
    waves?.destroy();
    scene?.destroyForSpecs();
    scene = river = waves = undefined;
  });

  it("validates profile values and rejects reversed, folded and self-crossing corridors", function () {
    const options = {
      positions: [new Cartesian3(0, 0, 20), new Cartesian3(100, 0, 10)],
      widths: 20,
    };
    for (const change of [
      { widths: 0 },
      { speeds: -1 },
      { widths: [10] },
      { speeds: [1, NaN] },
      { positions: [new Cartesian3(), new Cartesian3(0, 0, 10)] },
      {
        positions: [new Cartesian3(), new Cartesian3(100, 0), new Cartesian3()],
      },
      {
        positions: [
          new Cartesian3(),
          new Cartesian3(100, 100),
          new Cartesian3(0, 100),
          new Cartesian3(100, 0),
        ],
      },
      {
        positions: [
          new Cartesian3(),
          new Cartesian3(10, 0),
          new Cartesian3(10, 10),
        ],
        widths: 100,
      },
    ]) {
      expect(
        () => new RiverGeometry({ ...options, ...change }),
      ).toThrowDeveloperError();
    }
    expect(() => new SceneGISRiverSurface(options)).toThrowDeveloperError();
  });

  it("clips concavity and holes without taking water heights from the mask", function () {
    const mask = ring(0, -20, 100, 20);
    mask.holes.push(ring(40, -5, 60, 5));
    mask.positions.splice(3, 0, new Cartesian3(80, 0, 999));
    const m = mesh({
      positions: [new Cartesian3(0, 0, 20), new Cartesian3(100, 0, 10)],
      widths: 40,
      speeds: [1, 3],
      polygonHierarchy: mask,
    });
    const g = m.createGeometry(m.root),
      p = g.attributes.position.values,
      data = g.attributes.riverData.values;
    let area = 0;
    for (let i = 0; i < p.length; i += 3) {
      const w = Matrix4.multiplyByPoint(
        m.root.modelMatrix,
        Cartesian3.fromArray(p, i),
        new Cartesian3(),
      );
      expect(w.z).toEqualEpsilon(20 - w.x * 0.1, 1e-5);
      expect(data[i]).toEqualEpsilon(w.x, 1e-5);
      expect(data[i + 2]).toEqualEpsilon(1 + w.x * 0.02, 1e-5);
    }
    for (let i = 0; i < g.indices.length; i += 3) {
      const [a, b, c] = Array.from(g.indices.slice(i, i + 3), (j) =>
        Cartesian3.fromArray(p, j * 3),
      );
      area += ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5;
    }
    expect(area).toEqualEpsilon(2800, 1e-3);
  });

  it("keeps height, flow and mixed LOD edge attributes continuous through bends", function () {
    const m = mesh({
      positions: [
        new Cartesian3(0, 0, 20),
        new Cartesian3(400, 0, 10),
        new Cartesian3(800, 400, 0),
      ],
      widths: [120, 180, 120],
      speeds: [0, 2, 1],
    });
    const frame = {
      frameNumber: 1,
      context: { drawingBufferWidth: 512, drawingBufferHeight: 512 },
      camera: {
        positionWC: new Cartesian3(150, -60, 25),
        frustum: {
          getPixelDimensions(w, h, d, r, result) {
            result.x = result.y = d / h;
            return result;
          },
        },
      },
      cullingVolume: {
        computeVisibility() {
          return 1;
        },
      },
    };
    const selected = m.select(frame, 0, 2, 96),
      shared = new Map();
    expect(selected.length).toBeGreaterThan(1);
    expect(new Set(selected.map((n) => n.size)).size).toBeGreaterThan(1);
    let matches = 0;
    for (const node of selected) {
      const g = m.createGeometry(node),
        p = g.attributes.position.values,
        data = g.attributes.riverData.values;
      for (let i = 0; i < p.length; i += 3) {
        const w = Matrix4.multiplyByPoint(
          node.modelMatrix,
          Cartesian3.fromArray(p, i),
          new Cartesian3(),
        );
        const key = `${Math.round(w.x * 10000)},${Math.round(w.y * 10000)}`;
        const v = [w.z, ...data.slice(i, i + 3)];
        if (shared.has(key)) {
          const previous = shared.get(key);
          v.forEach((value, j) =>
            expect(value).toEqualEpsilon(previous[j], 1e-4),
          );
          ++matches;
        } else {
          shared.set(key, v);
        }
      }
    }
    expect(matches).toBeGreaterThan(50);
  });

  it("preserves ellipsoid heights over a regional river crossing the date line", function () {
    const positions = Cartesian3.fromDegreesArrayHeights([
      179.7, 35, 80, 179.9, 35.1, 40, -179.9, 35, 10,
    ]);
    const m = mesh(
      { positions, widths: [800, 1500, 1000], speeds: [1, 2, 0.5] },
      Ellipsoid.WGS84,
    );
    const g = m.createGeometry(m.root),
      p = g.attributes.position.values,
      data = g.attributes.riverData.values;
    expect(m.root.size).toBeLessThan(100000);
    let lo = Infinity,
      hi = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const w = Matrix4.multiplyByPoint(
        m.root.modelMatrix,
        Cartesian3.fromArray(p, i),
        new Cartesian3(),
      );
      const h = Ellipsoid.WGS84.cartesianToCartographic(w).height;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      expect(data[i + 2]).toBeGreaterThanOrEqual(0.5);
      expect(data[i + 2]).toBeLessThanOrEqual(2);
    }
    expect(lo).toEqualEpsilon(10, 0.02);
    expect(hi).toEqualEpsilon(80, 0.02);
  });

  function setup(planar, wind = false) {
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
      scene.globe.baseColor = Color.GRAY;
      scene.globe.showGroundAtmosphere = false;
      scene.globe.show = false;
      matrix = Transforms.eastNorthUpToFixedFrame(
        Cartesian3.fromDegrees(118.7, 32, 100),
      );
    }
    scene.light = new DirectionalLight({
      direction: new Cartesian3(0, 0, -1),
      color: Color.BLACK,
    });
    const mask = new PolygonHierarchy(
      [
        point(-30, -15, 0),
        point(30, -15, 0),
        point(30, 15, 0),
        point(-30, 15, 0),
      ],
      [
        new PolygonHierarchy([
          point(-2, -2, 0),
          point(2, -2, 0),
          point(2, 2, 0),
          point(-2, 2, 0),
        ]),
      ],
    );
    if (wind) {
      waves = new SceneGISWindWaves({
        resolution: 32,
        patchLength: 32,
        windSpeed: 8,
      });
    }
    river = scene.primitives.add(
      new SceneGISRiverSurface({
        world: scene.world,
        positions: [point(-30, 0, 1), point(0, 0, 0), point(30, 0, -1)],
        widths: [20, 24, 20],
        speeds: [0.5, 1, 2],
        polygonHierarchy: mask,
        windWaves: waves,
        id: "river",
        currentFoamIntensity: 1,
        currentRippleLength: 12,
        reflections: false,
        maximumTileCount: 32,
      }),
    );
    scene.camera.setView({
      destination: point(0, 0, 75),
      orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 500;
  }
  [true, false].forEach(function (planar) {
    it(`renders, animates, picks and releases river resources in ${planar ? "Planar" : "Globe"}`, function () {
      setup(planar);
      scene.renderForSpecs(time);
      expect(river.ready).toBeTrue();
      const screen = SceneTransforms.worldToWindowCoordinates(
        scene,
        point(10, 0, 0),
      );
      expect(scene.pick(screen)).toEqual({ primitive: river, id: "river" });
      expect(
        scene.pick(
          SceneTransforms.worldToWindowCoordinates(scene, point(0, 0, 0)),
        )?.id,
      ).not.toBe("river");
      scene.renderForSpecs(time);
      const before = scene.context.readPixels();
      scene.renderForSpecs(JulianDate.addSeconds(time, 0.75, new JulianDate()));
      expect(
        scene.context.readPixels().some((v, i) => v !== before[i]),
      ).toBeTrue();
      expect(river.statistics.geometryBuilds).toBe(0);
      scene.renderForSpecs(time);
      expect(scene.context.readPixels()).toEqual(before);
      scene.renderForSpecs(
        JulianDate.addSeconds(time, 7.9999, new JulianDate()),
      );
      const phaseEnd = scene.context.readPixels();
      scene.renderForSpecs(
        JulianDate.addSeconds(time, 8.0001, new JulianDate()),
      );
      const phaseStart = scene.context.readPixels();
      expect(
        phaseStart.every((v, i) => Math.abs(v - phaseEnd[i]) <= 1),
      ).toBeTrue();
      river.currentSpeedScale = 0;
      scene.renderForSpecs(time);
      const frozen = scene.context.readPixels();
      scene.renderForSpecs(JulianDate.addSeconds(time, 1.25, new JulianDate()));
      expect(scene.context.readPixels()).toEqual(frozen);
      river.id = "edited";
      scene.renderForSpecs(time);
      expect(scene.pick(screen).id).toBe("edited");
      river.show = false;
      scene.renderForSpecs(time);
      expect(scene.pick(screen)?.id).not.toBe("edited");
      const arrays = [...river._mesh.nodes].flatMap((n) =>
        n.cache.map((e) => e.vertexArray),
      );
      const pickColor = river._surface._pickId.color;
      scene.primitives.remove(river);
      expect(arrays.every((a) => a.isDestroyed())).toBeTrue();
      expect(scene.context.getObjectByPickColor(pickColor)).toBeUndefined();
    });
  });
  it("keeps FFT wind independent from current controls and borrows its textures", function () {
    setup(true, true);
    scene.renderForSpecs(time);
    const output = waves._state.bands[0].output.getColorTexture(0);
    const seconds = waves._state.seconds;
    river.currentSpeedScale = 3;
    scene.renderForSpecs(time);
    expect(waves._state.seconds).toBe(seconds);
    expect(waves._state.bands[0].output.getColorTexture(0)).toBe(output);
    river.currentSpeedScale = 0;
    scene.renderForSpecs(JulianDate.addSeconds(time, 0.75, new JulianDate()));
    expect(waves._state.seconds).toEqualEpsilon(0.75, 1e-7);
    scene.primitives.remove(river);
    expect(output.isDestroyed()).toBeFalse();
    waves.destroy();
    waves = undefined;
    expect(output.isDestroyed()).toBeTrue();
  });
  it("rejects a different World identity before allocation and validates runtime controls", function () {
    setup(true);
    const other = new Globe();
    const wrong = new SceneGISRiverSurface({
      world: other,
      positions: Cartesian3.fromDegreesArrayHeights([0, 35, 1, 0.01, 35, 1]),
      widths: 20,
    });
    scene.primitives.add(wrong);
    expect(() => scene.renderForSpecs(time)).toThrowDeveloperError();
    expect(wrong.ready).toBeFalse();
    scene.primitives.remove(wrong);
    other.destroy();
    river.currentSpeedScale = -1;
    expect(() => scene.renderForSpecs(time)).toThrowDeveloperError();
  });
});
