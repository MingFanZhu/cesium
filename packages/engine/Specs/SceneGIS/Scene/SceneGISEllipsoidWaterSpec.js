import {
  Cartesian3,
  Color,
  Ellipsoid,
  Globe,
  HeadingPitchRange,
  JulianDate,
  Matrix4,
  PolygonHierarchy,
  SceneGISWaterSurface,
  SceneGISWindWaves,
  SceneTransforms,
  SceneGISPlanarWorld,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
} from "../../../index.js";
import Mesh from "../../../Source/SceneGIS/Scene/_private/_SceneGISEllipsoidWaterMesh.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISEllipsoidWater", function () {
  let scene, water, waves;
  const ellipsoid = Ellipsoid.WGS84;
  const time = JulianDate.fromIso8601("2026-06-21T04:00:00Z");
  function polygon(
    west = 117,
    south = 30,
    east = 120,
    north = 32,
    height = 30,
  ) {
    return new PolygonHierarchy(
      Cartesian3.fromDegreesArrayHeights([
        west,
        south,
        height,
        east,
        south,
        height,
        east,
        north,
        height,
        west,
        north,
        height,
      ]),
    );
  }
  function frame(height, frameNumber = 1) {
    return {
      frameNumber,
      pixelRatio: 1,
      context: { drawingBufferWidth: 512, drawingBufferHeight: 512 },
      camera: {
        positionWC: Cartesian3.fromDegrees(118.5, 31, height),
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
  }
  afterEach(function () {
    if (scene) {
      scene.primitives.removeAll();
    } else {
      water?.destroy();
    }
    waves?.destroy();
    scene?.destroyForSpecs();
    scene = water = waves = undefined;
  });
  it("keeps local water default and validates the explicit curved coordinate contract", function () {
    expect(
      () =>
        new SceneGISWaterSurface({
          geometryMode: "ellipsoid",
          polygonHierarchy: polygon(),
        }),
    ).toThrowDeveloperError();
    waves = new SceneGISWindWaves({ resolution: 32 });
    expect(
      () =>
        new SceneGISWaterSurface({
          geometryMode: "unknown",
          polygonHierarchy: polygon(),
          windWaves: waves,
        }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISWaterSurface({
          geometryMode: "ellipsoid",
          polygonHierarchy: polygon(),
          windWaves: waves,
          modelMatrix: Matrix4.fromTranslation(Cartesian3.UNIT_X),
        }),
    ).toThrowDeveloperError();
    water = new SceneGISWaterSurface({
      polygonHierarchy: new PolygonHierarchy([
        new Cartesian3(0, 0),
        new Cartesian3(10, 0),
        new Cartesian3(0, 10),
      ]),
    });
    expect(water.geometryMode).toBe("local");
    expect(water.statistics).toBeUndefined();
  });
  it("places a regional mesh on the ellipsoid instead of the origin tangent plane", function () {
    const mesh = new Mesh(polygon(), ellipsoid, 73, false, 1);
    const geometry = mesh.createGeometry(mesh.root);
    const positions = geometry.attributes.position.values;
    let maxHeightError = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const p = Matrix4.multiplyByPoint(
        mesh.root.modelMatrix,
        Cartesian3.fromArray(positions, i),
        new Cartesian3(),
      );
      maxHeightError = Math.max(
        maxHeightError,
        Math.abs(ellipsoid.cartesianToCartographic(p).height - 73),
      );
      expect(Cartesian3.distance(p, mesh.root.bounds.center)).toBeLessThan(
        mesh.root.bounds.radius,
      );
    }
    expect(maxHeightError).toBeLessThan(0.02);
    expect(mesh.nodes.size).toBe(1);
    expect(positions.length / 3).toBeLessThan(1000);
  });
  it("preserves height interpolation and regional charts across the date line", function () {
    const h = new PolygonHierarchy(
      Cartesian3.fromDegreesArrayHeights([
        179, 35, 10, -179, 35, 80, -179, 36, 80, 179, 36, 10,
      ]),
    );
    const mesh = new Mesh(h, ellipsoid, 0, true, 1);
    expect(mesh.root.size).toBeLessThan(500000);
    const g = mesh.createGeometry(mesh.root),
      p = g.attributes.position.values;
    let low = Infinity,
      high = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const w = Matrix4.multiplyByPoint(
        mesh.root.modelMatrix,
        Cartesian3.fromArray(p, i),
        new Cartesian3(),
      );
      const height = ellipsoid.cartesianToCartographic(w).height;
      low = Math.min(low, height);
      high = Math.max(high, height);
    }
    expect(low).toEqualEpsilon(10, 0.02);
    expect(high).toEqualEpsilon(80, 0.02);
  });
  it("retains concavity and islands when grids are clipped", function () {
    const h = new PolygonHierarchy(
      Cartesian3.fromDegreesArray([
        117, 30, 120, 30, 119, 31, 120, 32, 117, 32,
      ]),
      [polygon(117.5, 30.5, 118, 31)],
    );
    const mesh = new Mesh(h, ellipsoid, 30, false, 1);
    const g = mesh.createGeometry(mesh.root),
      uv = g.attributes.wavePosition.values;
    let area = 0;
    for (let i = 0; i < g.indices.length; i += 3) {
      const [a, b, c] = Array.from(g.indices.slice(i, i + 3));
      area +=
        Math.abs(
          (uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1]) -
            (uv[c * 2] - uv[a * 2]) * (uv[b * 2 + 1] - uv[a * 2 + 1]),
        ) / 2;
    }
    function ringArea(ring) {
      let a = 0;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i],
          q = ring[(i + 1) % ring.length];
        a += p.x * q.y - q.x * p.y;
      }
      return Math.abs(a) / 2;
    }
    const expected =
      ringArea(mesh.hierarchy.positions) -
      ringArea(mesh.hierarchy.holes[0].positions);
    expect(Math.abs(area - expected) / expected).toBeLessThan(1e-6);
  });
  it("selects bounded near/far LOD and conforms mixed-resolution boundaries", function () {
    const mesh = new Mesh(polygon(), ellipsoid, 30, false, 1);
    const far = mesh.select(frame(2000000), 2, 2, 96).length;
    const selected = mesh.select(frame(1000, 2), 2, 2, 96);
    expect(selected.length).toBeGreaterThan(far);
    expect(selected.length).toBeLessThanOrEqual(96);
    expect(mesh.statistics.budgetLimited).toBeTrue();
    const edges = new Map();
    const boundaries = [];
    let shared = 0;
    for (const node of selected) {
      const geometry = mesh.createGeometry(node),
        uv = geometry.attributes.wavePosition.values,
        positions = geometry.attributes.position.values;
      const sides = [[], [], [], []];
      boundaries.push({ node, sides });
      for (let i = 0; i < uv.length; i += 2) {
        const x = uv[i],
          y = uv[i + 1];
        if (Math.abs(x) < 1e-4) {
          sides[0].push(node.y + y);
        }
        if (Math.abs(x - node.size) < 1e-4) {
          sides[1].push(node.y + y);
        }
        if (Math.abs(y) < 1e-4) {
          sides[2].push(node.x + x);
        }
        if (Math.abs(y - node.size) < 1e-4) {
          sides[3].push(node.x + x);
        }
        if (
          Math.min(
            Math.abs(x),
            Math.abs(y),
            Math.abs(x - node.size),
            Math.abs(y - node.size),
          ) > 1e-4
        ) {
          continue;
        }
        const key = `${Math.round((node.x + x) * 10000)},${Math.round((node.y + y) * 10000)}`;
        const p = Matrix4.multiplyByPoint(
          node.modelMatrix,
          Cartesian3.fromArray(positions, (i / 2) * 3),
          new Cartesian3(),
        );
        if (edges.has(key)) {
          expect(Cartesian3.distance(p, edges.get(key))).toBeLessThan(0.03);
          ++shared;
        } else {
          edges.set(key, p);
        }
      }
    }
    expect(shared).toBeGreaterThan(100);
    let mixedPairs = 0;
    function compare(a, sa, b, sb, axis) {
      const lo = Math.max(a.node[axis], b.node[axis]),
        hi = Math.min(a.node[axis] + a.node.size, b.node[axis] + b.node.size);
      if (hi <= lo || a.node.size === b.node.size) {
        return;
      }
      const values = (side) =>
        side
          .filter((v) => v > lo + 0.01 && v < hi - 0.01)
          .sort((x, y) => x - y)
          .filter((v, i, all) => i === 0 || v - all[i - 1] > 0.01);
      const av = values(a.sides[sa]),
        bv = values(b.sides[sb]);
      expect(av.length).toBe(bv.length);
      for (let i = 0; i < av.length; ++i) {
        expect(av[i]).toEqualEpsilon(bv[i], 0.01);
      }
      if (av.length) {
        ++mixedPairs;
      }
    }
    for (let i = 0; i < boundaries.length; ++i) {
      for (let j = i + 1; j < boundaries.length; ++j) {
        const a = boundaries[i],
          b = boundaries[j];
        if (Math.abs(a.node.x + a.node.size - b.node.x) < 1e-7) {
          compare(a, 1, b, 0, "y");
        }
        if (Math.abs(b.node.x + b.node.size - a.node.x) < 1e-7) {
          compare(a, 0, b, 1, "y");
        }
        if (Math.abs(a.node.y + a.node.size - b.node.y) < 1e-7) {
          compare(a, 3, b, 2, "x");
        }
        if (Math.abs(b.node.y + b.node.size - a.node.y) < 1e-7) {
          compare(a, 2, b, 3, "x");
        }
      }
    }
    expect(mixedPairs).toBeGreaterThan(10);
  });
  function setup(planar = false) {
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    if (planar) {
      scene._initializeWorld(
        new SceneGISPlanarWorld({
          coordinateSystem: new SceneGISPlanarCoordinateSystem({
            extent: new SceneGISPlanarExtent({
              minimumX: -1000,
              minimumY: -1000,
              maximumX: 1000,
              maximumY: 1000,
            }),
          }),
          maximumLevel: 0,
        }),
      );
    } else {
      scene.globe = new Globe();
      scene.globe.baseColor = Color.GRAY;
    }
    waves = new SceneGISWindWaves({
      resolution: 32,
      patchLength: 32,
      windSpeed: 12,
    });
    const h = polygon(118.49, 30.99, 118.51, 31.01);
    h.holes.push(polygon(118.499, 30.999, 118.501, 31.001));
    water = scene.primitives.add(
      new SceneGISWaterSurface({
        geometryMode: "ellipsoid",
        polygonHierarchy: h,
        height: 30,
        windWaves: waves,
        maximumTileCount: 64,
        id: "curved-water",
      }),
    );
    if (!planar) {
      scene.camera.lookAt(
        Cartesian3.fromDegrees(118.5, 31, 30),
        new HeadingPitchRange(0, -1.5, 4000),
      );
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
    }
  }
  it("renders and picks curved coverage and holes, reuses frozen FFT and releases resources", function () {
    setup();
    expect(scene.context.webgl2 && scene.context.colorBufferFloat).toBeTrue();
    scene.renderForSpecs(time);
    const point = Cartesian3.fromDegrees(118.505, 31, 30);
    const screen = SceneTransforms.worldToWindowCoordinates(scene, point);
    expect(scene.pick(screen).id).toBe("curved-water");
    const hole = SceneTransforms.worldToWindowCoordinates(
      scene,
      Cartesian3.fromDegrees(118.5, 31, 30),
    );
    expect(scene.pick(hole)?.id).not.toBe("curved-water");
    scene.renderForSpecs(time);
    expect(water.statistics.geometryBuilds).toBe(0);
    const cache = water._ellipsoidMesh.nodes;
    const arrays = [...cache].flatMap((n) => n.cache.map((e) => e.vertexArray));
    const texture = waves._state.bands[0].output.getColorTexture(0);
    const seconds = waves._state.seconds;
    scene.renderForSpecs(time);
    expect(waves._state.seconds).toBe(seconds);
    scene.renderForSpecs(JulianDate.addSeconds(time, 0.75, new JulianDate()));
    expect(waves._state.seconds).toEqualEpsilon(0.75, 1e-7);
    const pickedPosition = scene.pickPosition(screen);
    expect(pickedPosition).toBeDefined();
    expect(
      Math.abs(ellipsoid.cartesianToCartographic(pickedPosition).height - 30),
    ).toBeLessThan(waves._maximumDisplacement + 2);
    scene.primitives.remove(water);
    expect(arrays.every((a) => a.isDestroyed())).toBeTrue();
    expect(texture.isDestroyed()).toBeFalse();
    waves.destroy();
    waves = undefined;
    expect(texture.isDestroyed()).toBeTrue();
  });
  it("rejects curved geometry in a Planar World before allocating water GPU resources", function () {
    setup(true);
    expect(() => scene.renderForSpecs(time)).toThrowDeveloperError();
    expect(water._command).toBeUndefined();
    expect(waves.ready).toBeFalse();
  });
});
