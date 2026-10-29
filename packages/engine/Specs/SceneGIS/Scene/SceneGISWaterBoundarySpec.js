import {
  Cartesian2,
  Cartesian3,
  Framebuffer,
  Globe,
  JulianDate,
  Matrix4,
  PixelDatatype,
  PixelFormat,
  PolygonHierarchy,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISWaterSurface,
  ShaderSource,
  Texture,
  Transforms,
  _SceneGISWaterBoundary as Boundary,
} from "../../../index.js";
import volume from "../../../Source/Shaders/SceneGIS/Water/SceneGISUnderwaterVolume.js";
import createContext from "../../../../../Specs/createContext.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";

describe("SceneGIS/Scene/SceneGISWaterBoundary", function () {
  let context, target, texture, command, scene;
  function circle(n, r, x = 0, y = 0, wave = 0) {
    return Array.from({ length: n }, (_, i) => {
      const a = (i * 2 * Math.PI) / n,
        radius = r * (1 + wave * Math.sin(a * 7));
      return new Cartesian3(
        x + Math.cos(a) * radius,
        y + Math.sin(a) * radius,
        0,
      );
    });
  }
  function flatten(rings) {
    const e = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        e.push(a.x, a.y, b.x, b.y);
      }
    }
    return e;
  }
  function parity(e, x, y) {
    let inside = false;
    for (let i = 0; i < e.length; i += 4) {
      const ax = e[i],
        ay = e[i + 1],
        bx = e[i + 2],
        by = e[i + 3];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
        inside = !inside;
      }
    }
    return inside;
  }
  function reference(e, start, direction, z, dz, limit) {
    const w = [direction.x / z, direction.y / z],
      c = dz / z;
    const cross = (x, y, a, b) => x * b - y * a;
    for (let i = 0; i < e.length; i += 4) {
      const ax = e[i] - start.x,
        ay = e[i + 1] - start.y,
        sx = e[i + 2] - e[i],
        sy = e[i + 3] - e[i + 1];
      const den = cross(w[0], w[1], sx, sy);
      if (Math.abs(den) < 1e-12) {
        continue;
      }
      const s = cross(ax, ay, sx, sy) / den,
        u = cross(ax, ay, w[0], w[1]) / den,
        t = s / (1 - c * s);
      if (t > 0 && u >= 0 && u <= 1 && z + t * dz > 0) {
        limit = Math.min(limit, t);
      }
    }
    return limit;
  }
  function harness(e, curved) {
    context = createContext();
    const bvh = new Boundary(e);
    texture = bvh.createTexture(context);
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
    const state = {
      start: new Cartesian2(),
      velocity: new Cartesian2(),
      z: 1,
      dz: 0,
      limit: 2000,
    };
    command = context.createViewportQuadCommand(
      new ShaderSource({
        defines: curved ? ["SCENEGIS_ELLIPSOID_UNDERWATER"] : [],
        sources: [
          "uniform float u_underwaterDepth,u_cameraDepth;",
          volume,
          `uniform vec2 u_start,u_velocity;uniform float u_z,u_dz,u_limit;
         void main(){float distance=u_limit;bool inside=sceneGISWaterBoundaryRay(u_start,u_velocity,u_z,u_dz,distance);
           out_FragColor=vec4(inside?1.0:0.0,distance,0.0,1.0);}`,
        ],
      }),
      {
        framebuffer: target,
        uniformMap: {
          u_boundary: () => texture,
          u_boundaryNodeCount: () => bvh.nodes.length,
          u_start: () => state.start,
          u_velocity: () => state.velocity,
          u_z: () => state.z,
          u_dz: () => state.dz,
          u_limit: () => state.limit,
        },
      },
    );
    return (x, y, vx, vy, z = 1, dz = 0, limit = 2000) => {
      state.start.x = x;
      state.start.y = y;
      state.velocity.x = vx;
      state.velocity.y = vy;
      state.z = z;
      state.dz = dz;
      state.limit = limit;
      command.execute(context);
      return Array.from(
        context.readPixels({ framebuffer: target, width: 1, height: 1 }),
      );
    };
  }
  afterEach(function () {
    command?.shaderProgram.destroy();
    texture?.destroy();
    target?.destroy();
    context?.destroyForSpecs();
    scene?.destroyForSpecs();
    context = target = texture = command = scene = undefined;
  });
  it("indexes original concave shores and nested islands without a 256-edge ceiling", function () {
    const rings = [
      circle(8192, 800, 0, 0, 0.12),
      circle(1024, 150),
      circle(512, 50),
    ];
    for (let i = 0; i < 16; i++) {
      rings.push(circle(64, 10, -400 + 50 * i, 300));
    }
    const e = flatten(rings),
      bvh = new Boundary(e);
    for (let i = 0; i < 180; i++) {
      const x = 1000 * Math.sin(i * 1.57),
        y = 900 * Math.cos(i * 0.79);
      expect(bvh.contains(x, y)).toBe(parity(e, x, y));
    }
    expect(bvh.contains(0, 0)).toBeTrue();
    expect(bvh.contains(100, 0)).toBeFalse();
    e.fill(0);
    expect(bvh.contains(0, 0)).toBeTrue();
    expect(bvh.byteLength).toBeLessThan(8388608);
  });
  it("enforces padded bytes and validates the immutable public budget", function () {
    const e = flatten([circle(4, 10)]),
      bvh = new Boundary(e);
    expect(() => new Boundary(e, bvh.byteLength - 1)).toThrowDeveloperError();
    const hierarchy = new PolygonHierarchy(circle(4096, 100));
    const water = new SceneGISWaterSurface({
      polygonHierarchy: hierarchy,
      underwaterDepth: 2,
    });
    expect(water.maximumUnderwaterBoundaryBytes).toBe(8388608);
    expect(water.underwaterBoundaryByteLength).toBe(0);
    water.destroy();
    [0, 1.5, Infinity, 67108865].forEach((value) =>
      expect(
        () =>
          new SceneGISWaterSurface({
            polygonHierarchy: hierarchy,
            maximumUnderwaterBoundaryBytes: value,
          }),
      ).toThrowDeveloperError(),
    );
  });
  [false, true].forEach(function (curved) {
    it(`matches independent parity and first-hit rays for large ${curved ? "rational" : "local"} shores`, function () {
      const rings = [
        circle(4096, 800, 0, 0, 0.1),
        circle(128, 120),
        circle(64, 30),
      ];
      for (let i = 0; i < 12; i++) {
        rings.push(circle(32, 12, -330 + i * 60, 260));
      }
      const e = flatten(rings),
        query = harness(e, curved),
        z = curved ? 6371000 : 1;
      for (let i = 0; i < 100; i++) {
        const x = Math.sin(i * 1.3) * 900,
          y = Math.cos(i * 0.89) * 850,
          a = i * 0.68;
        const v = new Cartesian2(Math.cos(a) * z, Math.sin(a) * z),
          dz = curved ? 2000 * Math.sin(i) : 0;
        const expected = reference(e, new Cartesian2(x, y), v, z, dz, 2000),
          r = query(x, y, v.x, v.y, z, dz);
        expect(r[0]).toBe(parity(e, x, y) ? 1 : 0);
        expect(r[1]).toEqualEpsilon(expected, Math.max(0.02, expected * 3e-5));
      }
    });
    it(`preserves axis, tangent, near-edge and finite-cap queries in ${curved ? "curved" : "local"} charts`, function () {
      const e = flatten([
        [
          new Cartesian3(-10, -10),
          new Cartesian3(10, -10),
          new Cartesian3(10, 10),
          new Cartesian3(-10, 10),
        ],
      ]);
      const query = harness(e, curved),
        z = curved ? 6371000 : 1;
      expect(query(0, 0, z, 0, z)[1]).toEqualEpsilon(10, 1e-5);
      expect(query(0, 0, 0, z, z)[1]).toEqualEpsilon(10, 1e-5);
      expect(query(0, 0, z, 0, z, 0, 3)[1]).toBe(3);
      expect(query(0, 0, 0, 0, z)[0]).toBe(1);
      expect(query(-10.001, 0, z, 0, z)[1]).toEqualEpsilon(0.001, 2e-6);
      expect(query(-11, 10.001, z, 0, z)[1]).toBe(2000);
      expect(query(-11, 10, z, 0, z)[1]).toEqualEpsilon(1, 1e-5);
    });
    it(`allocates and releases a large original boundary once in ${curved ? "Globe" : "Planar"}`, function () {
      scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
      scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
      scene.fog.enabled = false;
      let matrix;
      if (curved) {
        scene.globe = new Globe();
        scene.globe.show = false;
        matrix = Transforms.eastNorthUpToFixedFrame(
          Cartesian3.fromDegrees(-74, 40, 100),
        );
      } else {
        scene._initializeWorld(
          new SceneGISPlanarWorld({
            coordinateSystem: new SceneGISPlanarCoordinateSystem({
              extent: new SceneGISPlanarExtent({
                minimumX: -1000,
                maximumX: 1000,
                minimumY: -1000,
                maximumY: 1000,
              }),
            }),
            maximumLevel: 0,
          }),
        );
        matrix = Matrix4.fromTranslation(new Cartesian3(100, 100, 100));
      }
      const hierarchy = new PolygonHierarchy(circle(2048, 100), [
        new PolygonHierarchy(circle(256, 10)),
      ]);
      const water = scene.primitives.add(
        new SceneGISWaterSurface({
          polygonHierarchy: hierarchy,
          modelMatrix: matrix,
          underwaterDepth: 2,
          foamIntensity: 0,
          reflections: false,
          waveAmplitude: 0,
        }),
      );
      scene.camera.setView({
        destination: Matrix4.multiplyByPoint(
          matrix,
          new Cartesian3(30, 0, -0.5),
          new Cartesian3(),
        ),
        orientation: {
          direction: Matrix4.multiplyByPointAsVector(
            matrix,
            Cartesian3.UNIT_X,
            new Cartesian3(),
          ),
          up: Matrix4.multiplyByPointAsVector(
            matrix,
            Cartesian3.UNIT_Z,
            new Cartesian3(),
          ),
        },
      });
      scene.camera.frustum.near = 0.01;
      scene.camera.frustum.far = 300;
      const time = JulianDate.fromIso8601("2026-06-21T04:00:00Z");
      scene.renderForSpecs(time);
      expect(water._underwater.active).toBeTrue();
      const texture = water._underwater.texture;
      expect(water.underwaterBoundaryByteLength).toBe(texture.sizeInBytes);
      expect(water.underwaterBoundaryByteLength).toBeGreaterThan(0);
      scene.renderForSpecs(time);
      water.underwaterDepth = 3;
      scene.renderForSpecs(time);
      expect(water._underwater.texture).toBe(texture);
      scene.primitives.remove(water);
      expect(texture.isDestroyed()).toBeTrue();
    });
  });
});
