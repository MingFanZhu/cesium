import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  Ellipsoid,
  Framebuffer,
  GeometryInstance,
  Globe,
  JulianDate,
  Matrix4,
  PerInstanceColorAppearance,
  PixelDatatype,
  PixelFormat,
  PolygonHierarchy,
  Primitive,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISRiverSurface,
  Sampler,
  ShaderSource,
  Texture,
  Transforms,
  _SceneGISWaterDomain as Domain,
} from "../../../index.js";
import Mesh from "../../../Source/SceneGIS/Scene/_private/_SceneGISEllipsoidWaterMesh.js";
import RiverGeometry from "../../../Source/SceneGIS/Scene/_private/_SceneGISRiverGeometry.js";
import Underwater from "../../../Source/SceneGIS/Scene/_private/_SceneGISUnderwater.js";
import profileShader from "../../../Source/Shaders/SceneGIS/Water/SceneGISWaterProfile.js";
import polynomial from "../../../Source/Shaders/SceneGIS/Water/SceneGISWaterPolynomial.js";
import volume from "../../../Source/Shaders/SceneGIS/Water/SceneGISUnderwaterVolume.js";
import createContext from "../../../../../Specs/createContext.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";

describe("SceneGIS/Scene/SceneGISProfileUnderwater", function () {
  let context, target, command, domain, edges, scene, river;
  const time = JulianDate.fromIso8601("2026-06-21T04:00:00Z");
  function ring(x0, y0, x1, y1, z = 0) {
    return new PolygonHierarchy([
      new Cartesian3(x0, y0, z),
      new Cartesian3(x1, y0, z),
      new Cartesian3(x1, y1, z),
      new Cartesian3(x0, y1, z),
    ]);
  }
  function planarMesh(mask) {
    return new Mesh(
      undefined,
      undefined,
      0,
      true,
      1,
      new RiverGeometry(
        {
          positions: [new Cartesian3(0, 0, 20), new Cartesian3(100, 0, 10)],
          widths: 20,
          polygonHierarchy: mask,
        },
        undefined,
      ),
    );
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    scene = river = undefined;
    command?.shaderProgram.destroy();
    edges?.destroy();
    domain?.destroy();
    target?.destroy();
    context?.destroyForSpecs();
    context = target = command = domain = edges = undefined;
  });

  it("preserves authoritative profile interpolation and corridor/mask intersection independently of LOD", function () {
    const mask = ring(-5, -20, 105, 20);
    mask.holes.push(ring(40, -3, 60, 3));
    const mesh = planarMesh(mask);
    domain = new Domain(mesh);
    const p = new Cartesian3();
    for (const x of [0, 20, 30, 70, 100]) {
      expect(domain.sample(x, 5, p)).toBeTrue();
      expect(p.x).toEqualEpsilon(20 - 0.1 * x, 1e-10);
      expect(p.y).toEqualEpsilon(-0.1, 1e-12);
      expect(p.z).toEqualEpsilon(0, 1e-12);
    }
    expect(domain.sample(50, 0, p)).toBeFalse();
    expect(domain.sample(20, 15, p)).toBeFalse();
    const height = p.x;
    mesh.root.polygons[0][0][2] = 9999;
    expect(domain.sample(20, 5, p)).toBeTrue();
    expect(p.x).toEqualEpsilon(18, 1e-10);
    expect(height).toBeDefined();
    expect(domain.nodes.length).toBe(2 * domain.triangles.length - 1);
  });

  function harness(mesh, cameraPosition) {
    domain = new Domain(mesh);
    const medium = new Underwater(undefined, mesh, domain);
    medium.update(
      { show: true, underwaterDepth: 2 },
      { camera: { positionWC: cameraPosition } },
    );
    expect(medium.active).toBeTrue();
    context = createContext();
    domain.create(context);
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
      origin: new Cartesian3(
        mesh.ellipsoid ? 0 : medium.camera.x,
        mesh.ellipsoid ? 0 : medium.camera.y,
        medium.camera.z,
      ),
      direction: new Cartesian3(1, 0, 0),
    };
    command = context.createViewportQuadCommand(
      new ShaderSource({
        defines: [
          "SCENEGIS_PROFILE_WATER",
          ...(mesh.ellipsoid ? ["SCENEGIS_ELLIPSOID_UNDERWATER"] : []),
        ],
        sources: [
          "uniform float u_underwaterDepth,u_cameraDepth;",
          profileShader,
          polynomial,
          volume,
          `
        uniform vec3 u_origin,u_direction;
        void main(){float distance=0.0;bool inside=sceneGISWaterVolumeRay(u_origin,normalize(u_direction),distance);
          out_FragColor=vec4(inside?distance:-1.0,sceneGISWaterVolumeDepth(u_origin),0.0,1.0);}`,
        ],
      }),
      {
        framebuffer: target,
        uniformMap: {
          u_waterProfile: () => domain.texture,
          u_profileNodeCount: () => domain.nodes.length,
          u_profileAnchor: () => medium.height - domain.reference,
          u_profileRange: () => medium.profileRange,
          u_edges: () => edges,
          u_edgeCount: () => medium.edges.length / 4,
          u_underwaterDepth: () => 2,
          u_cameraDepth: () => -medium.camera.z,
          u_volumeRadius: () => medium.radius,
          u_chartRadius: () => mesh.radius,
          u_waterToChart: () => medium.waterToChart,
          u_chartCamera: () => medium.chartCamera,
          u_origin: () => state.origin,
          u_direction: () => state.direction,
        },
      },
    );
    return {
      medium,
      draw(direction, origin = state.origin) {
        Cartesian3.clone(direction, state.direction);
        Cartesian3.clone(origin, state.origin);
        command.execute(context);
        return Array.from(
          context.readPixels({ framebuffer: target, width: 1, height: 1 }),
        );
      },
    };
  }

  it("intersects sloping planar surface and cap analytically instead of using one minimum water level", function () {
    const h = harness(planarMesh(), new Cartesian3(50, 3, 14.75));
    expect(h.draw(Cartesian3.UNIT_X)[0]).toEqualEpsilon(2.5, 1e-4);
    expect(h.draw(new Cartesian3(-1, 0, 0))[0]).toEqualEpsilon(17.5, 1e-4);
    expect(h.draw(Cartesian3.UNIT_Z)[0]).toEqualEpsilon(0.25, 1e-5);
    expect(h.draw(new Cartesian3(0, 0, -1))[0]).toEqualEpsilon(1.75, 1e-5);
    expect(h.draw(Cartesian3.UNIT_Y)[0]).toEqualEpsilon(7, 1e-4);
    expect(h.draw(Cartesian3.UNIT_X, new Cartesian3(50, 11, -0.25))[0]).toBe(
      -1,
    );
  });

  it("matches an independent curved sloping-profile depth root", function () {
    const ellipsoid = new Ellipsoid(6371000, 6371000, 6371000);
    const positions = Cartesian3.fromDegreesArrayHeights(
      [
        -0.001, -0.001, 20, 0.001, -0.001, 10, 0.001, 0.001, 10, -0.001, 0.001,
        20,
      ],
      ellipsoid,
    );
    const mesh = new Mesh(
      new PolygonHierarchy(positions),
      ellipsoid,
      0,
      true,
      1,
    );
    const sample = new Cartesian3();
    const d = new Domain(mesh);
    d.sample(0, 0, sample);
    d.destroy();
    const h = harness(
      mesh,
      mesh.chart.position(0, 0, sample.x - 0.25, new Cartesian3()),
    );
    const r = h.medium.radius,
      k = (sample.y * mesh.radius) / (r - 0.25);
    // Here the profile decreases eastward. The downstream top and upstream cap are both finite.
    const top = h.draw(Cartesian3.UNIT_X)[0];
    const bottom = h.draw(new Cartesian3(-1, 0, 0))[0];
    const solve = (sign, targetDepth) => {
      let lo = 0,
        hi = 100;
      for (let i = 0; i < 60; ++i) {
        const t = (lo + hi) / 2;
        const depth =
          k * sign * t -
          (t * t - 2 * r * 0.25 + 0.25 ** 2) /
            (Math.sqrt((r - 0.25) ** 2 + t * t) + r);
        if (targetDepth === 0 ? depth > 0 : depth < targetDepth) {
          lo = t;
        } else {
          hi = t;
        }
      }
      return (lo + hi) / 2;
    };
    expect(top).toEqualEpsilon(solve(1, 0), 0.002);
    expect(bottom).toEqualEpsilon(solve(-1, 2), 0.002);
  });

  it("isolates quartic crossings, tangent roots and shallow near-zero roots", function () {
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
    let p = [0.2, 0.4, 0.4, 0.8];
    let coefficients;
    const multiply = (roots) =>
      roots.reduce(
        (a, r) => {
          const next = Array(a.length + 1).fill(0);
          a.forEach((v, i) => {
            next[i] -= r * v;
            next[i + 1] += v;
          });
          return next;
        },
        [1],
      );
    command = context.createViewportQuadCommand(
      new ShaderSource({
        defines: ["SCENEGIS_PROFILE_WATER"],
        sources: [
          polynomial,
          `
      uniform vec4 u_p;uniform float u_a;
      void main(){out_FragColor=vec4(sceneGISQuarticFirst(u_p,u_a),0.0,0.0,1.0);}`,
        ],
      }),
      {
        framebuffer: target,
        uniformMap: {
          u_p: () => ({
            x: coefficients[0],
            y: coefficients[1],
            z: coefficients[2],
            w: coefficients[3],
          }),
          u_a: () => coefficients[4],
        },
      },
    );
    for (p of [
      [0.2, 0.4, 0.4, 0.8],
      [0.3, 0.3, -2, -3],
      [0.000001, 0.4, 0.6, 0.8],
    ]) {
      coefficients = multiply(p);
      command.execute(context);
      expect(
        context.readPixels({ framebuffer: target, width: 1, height: 1 })[0],
      ).toEqualEpsilon(p[0], 1e-4);
    }
  });

  [true, false].forEach(function (planar) {
    it(`renders finite variable-height river underwater in ${planar ? "Planar" : "Globe"} and releases its shared domain`, function () {
      scene = createScene({
        canvas: createCanvas(128, 128),
        scene3DOnly: true,
      });
      scene.highDynamicRange = true;
      scene.fog.enabled = false;
      scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
      const matrix = planar
        ? Matrix4.fromTranslation(new Cartesian3(20000000, -30000000, 100))
        : Transforms.eastNorthUpToFixedFrame(
            Cartesian3.fromDegrees(-74, 40, 100),
          );
      if (planar) {
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
      }
      const point = (x, y, z) =>
        Matrix4.multiplyByPoint(
          matrix,
          new Cartesian3(x, y, z),
          new Cartesian3(),
        );
      const vector = (x, y, z) =>
        Matrix4.multiplyByPointAsVector(
          matrix,
          new Cartesian3(x, y, z),
          new Cartesian3(),
        );
      const source = ring(-30, -20, 30, 20);
      source.holes.push(ring(-2, -2, 2, 2));
      const convert = (r) =>
        new PolygonHierarchy(
          r.positions.map((p) => point(p.x, p.y, p.z)),
          r.holes.map(convert),
        );
      river = scene.primitives.add(
        new SceneGISRiverSurface({
          world: scene.world,
          positions: [point(-20, 0, 1), point(20, 0, -1)],
          widths: 24,
          polygonHierarchy: convert(source),
          currentRippleAmplitude: 0,
          foamIntensity: 0,
          absorption: new Cartesian3(0.5, 0, 0),
          scattering: Cartesian3.ZERO,
          reflections: false,
        }),
      );
      scene.primitives.add(
        new Primitive({
          geometryInstances: new GeometryInstance({
            geometry: new CoplanarPolygonGeometry({
              polygonHierarchy: ring(-30, -30, 30, 30, -1),
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
      const camera = (x, y, z) =>
        scene.camera.setView({
          destination: point(x, y, z),
          orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
        });
      camera(0, 6, -0.25);
      scene.camera.frustum.near = 0.1;
      scene.camera.frustum.far = 200;
      const pixel = () =>
        Array.from(
          scene.context.readPixels({ x: 64, y: 64, width: 1, height: 1 }),
        );
      scene.renderForSpecs(time);
      const clear = pixel();
      river.underwaterDepth = 2;
      scene.renderForSpecs(time);
      expect(river._surface._underwater.active).toBeTrue();
      expect(pixel()[0]).toBeLessThan(clear[0] * 0.9);
      const frozen = pixel();
      scene.renderForSpecs(time);
      expect(pixel()).toEqual(frozen);
      const texture = river._surface._domain.texture;
      camera(15, 6, -0.25);
      scene.renderForSpecs(time);
      expect(river._surface._underwater.active).toBeFalse();
      camera(-15, 6, -0.25);
      scene.renderForSpecs(time);
      expect(river._surface._underwater.active).toBeTrue();
      camera(0, 0, -0.25);
      scene.renderForSpecs(time);
      expect(river._surface._underwater.active).toBeFalse();
      river.underwaterDepth = 0;
      scene.renderForSpecs(time);
      expect(river._surface._underwater.active).toBeFalse();
      scene.primitives.remove(river);
      river = undefined;
      expect(texture.isDestroyed()).toBeTrue();
    });
  });
});
