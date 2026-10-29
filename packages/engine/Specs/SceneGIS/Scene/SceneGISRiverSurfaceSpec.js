import {
  Cartesian3,
  Color,
  ClearCommand,
  DirectionalLight,
  DrawCommand,
  Ellipsoid,
  Globe,
  JulianDate,
  Matrix4,
  OrthographicFrustum,
  PolygonHierarchy,
  PrimitiveType,
  SceneGISRiverSurface,
  SceneGISWindWaves,
  SceneGISPlanarWorld,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneTransforms,
  ShaderProgram,
  ShaderSource,
  Transforms,
  VertexArray,
} from "../../../index.js";
import RiverGeometry from "../../../Source/SceneGIS/Scene/_private/_SceneGISRiverGeometry.js";
import riverSpectrum from "../../../Source/SceneGIS/Scene/_private/_SceneGISRiverSpectrum.js";
import Mesh from "../../../Source/SceneGIS/Scene/_private/_SceneGISEllipsoidWaterMesh.js";
import riverFlow from "../../../Source/Shaders/SceneGIS/Water/SceneGISRiverFlow.js";
import waterVertex from "../../../Source/Shaders/SceneGIS/Water/SceneGISWaterVS.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createContext from "../../../../../Specs/createContext.js";
import createFrameState from "../../../../../Specs/createFrameState.js";
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

  it("builds deterministic two-dimensional spectra with downstream bias and separate scales", function () {
    const options = { resolution: 128, seed: 12345 };
    const a = riverSpectrum(options),
      b = riverSpectrum(options);
    const other = riverSpectrum({ ...options, seed: 12346 });
    expect(a.bands.map((v) => v.length)).toEqual([96, 24]);
    for (let band = 0; band < 2; ++band) {
      const data = a.bands[band].data;
      expect(data).toEqual(b.bands[band].data);
      expect(data).not.toEqual(other.bands[band].data);
      let total = 0,
        cross = 0,
        downstream = 0;
      for (let y = 0; y < 128; ++y) {
        for (let x = 0; x < 128; ++x) {
          const i = (y * 128 + x) * 4;
          const energy = 2 * (data[i] ** 2 + data[i + 1] ** 2);
          total += energy;
          if (
            Math.abs(y < 64 ? y : y - 128) >
            Math.abs(x < 64 ? x : x - 128) * 0.5
          ) {
            cross += energy;
          }
          if (x > 0 && x < 64) {
            downstream += energy;
          }
        }
      }
      expect(total).toEqualEpsilon(1, 1e-6);
      expect(cross / total).toBeGreaterThan(0.3);
      expect(downstream / total).toBeGreaterThan(0.7);
    }
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
        const flow = g.attributes.riverFlow.values;
        const v = [
          w.z,
          ...data.slice(i, i + 3),
          ...flow.slice((i / 3) * 2, (i / 3) * 2 + 2),
        ];
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
  it("transports FFT vertex heights downstream, rotates sectors continuously and filters unresolved waves", function () {
    const context = createContext();
    const frame = createFrameState(context);
    frame.time = JulianDate.clone(time);
    const currentWaves = new SceneGISWindWaves({
      resolution: 128,
      choppiness: 0,
      _spectrum: riverSpectrum,
    });
    currentWaves._update(frame);
    frame.camera.position = new Cartesian3(0, 0, 100);
    frame.camera.direction = new Cartesian3(0, 0, -1);
    frame.camera.up = Cartesian3.clone(Cartesian3.UNIT_Y);
    frame.camera.right = Cartesian3.clone(Cartesian3.UNIT_X);
    frame.camera.frustum = new OrthographicFrustum({
      width: 0.01,
      aspectRatio: 1,
      near: 0.1,
      far: 1000,
    });
    context.uniformState.update(frame);
    const program = ShaderProgram.fromCache({
      context,
      vertexShaderSource: new ShaderSource({
        defines: [
          "SCENEGIS_CURVED_WATER",
          "SCENEGIS_RIVER_WATER",
          "SCENEGIS_RIVER_VERTEX",
        ],
        sources: [
          riverFlow,
          ShaderSource.replaceMain(waterVertex, "waterMain"),
          "void main() { waterMain(); gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }",
        ],
      }),
      fragmentShaderSource:
        "in vec3 v_positionEC; void main() { out_FragColor = vec4((v_positionEC.z + 100.0) * 0.5 + 0.5, 0.0, 0.0, 1.0); }",
      attributeLocations: Mesh.attributeLocations,
    });
    let seconds = 0,
      amplitude = 1,
      speedScale = 1,
      shore = 1,
      transverse = 7,
      angle = 0;
    function height(station) {
      const va = new VertexArray({
        context,
        attributes: [
          { index: 0, value: [0, 0, 0] },
          { index: 1, value: [shore, 0.25] },
          { index: 2, value: [0, 0, 1] },
          { index: 3, value: [1, 0, 0] },
          {
            index: 4,
            value: [
              station * Math.cos(angle) - transverse * Math.sin(angle),
              station * Math.sin(angle) + transverse * Math.cos(angle),
            ],
          },
          { index: 5, value: [station, 7, 2] },
          { index: 6, value: [Math.cos(angle), Math.sin(angle)] },
        ],
      });
      try {
        ClearCommand.ALL.execute(context);
        new DrawCommand({
          vertexArray: va,
          shaderProgram: program,
          count: 1,
          primitiveType: PrimitiveType.POINTS,
          modelMatrix: Matrix4.IDENTITY,
          uniformMap: {
            u_waterOffset: () => ({ x: 0, y: 0 }),
            u_riverOffset: () => ({ x: 0, y: 0 }),
            u_riverDisplacement0: () =>
              currentWaves._state.bands[0].output.getColorTexture(0),
            u_riverDisplacement1: () =>
              currentWaves._state.bands[1].output.getColorTexture(0),
            u_riverTime: () => seconds,
            u_currentRippleAmplitude: () => amplitude,
            u_currentRippleLength: () => 12,
            u_currentSpeedScale: () => speedScale,
          },
        }).execute(context);
        return context.readPixels()[0];
      } finally {
        va.destroy();
      }
    }
    try {
      const before = Array.from({ length: 81 }, (_, i) => height(i * 0.5));
      expect(Math.max(...before) - Math.min(...before)).toBeGreaterThan(50);
      transverse = 27;
      const across = Array.from({ length: 81 }, (_, i) => height(i * 0.5));
      expect(
        across.reduce((sum, v, i) => sum + Math.abs(v - before[i]), 0) / 81,
      ).toBeGreaterThan(15);
      transverse = 7;
      angle = Math.PI / 2;
      expect(height(3)).toEqualEpsilon(before[6], 1);
      angle = -0.00001;
      const seam = height(3);
      angle = 0.00001;
      expect(height(3)).toEqualEpsilon(seam, 1);
      angle = 0;
      seconds = 1;
      const after = Array.from({ length: 81 }, (_, i) => height(i * 0.5));
      // Measure the direction and distance of the GPU height profile, not a CPU copy of the shader.
      const errors = Array.from({ length: 13 }, (_, i) => {
        const shift = i - 6;
        return {
          shift,
          error: before
            .slice(6, -6)
            .reduce((sum, v, j) => sum + (v - after[j + 6 + shift]) ** 2, 0),
        };
      });
      errors.sort((a, b) => a.error - b.error);
      expect(errors[0].shift).toBe(4); // Two meters downstream in one second.
      speedScale = 0;
      const frozen = height(3);
      seconds = 13;
      expect(height(3)).toBe(frozen);
      frame.time = JulianDate.addSeconds(time, 2, new JulianDate());
      currentWaves._update(frame);
      expect(height(3)).not.toBe(frozen); // Intrinsic waves evolve even without transport.
      const evolved = height(3);
      currentWaves._update(frame, 0.5);
      const slowed = height(3);
      expect(slowed).not.toBe(evolved);
      frame.time = JulianDate.addSeconds(time, 1, new JulianDate());
      currentWaves._update(frame);
      expect(height(3)).toBe(slowed); // Same dispersion phase after a warm wavelength edit.
      amplitude = 0;
      expect(height(3)).toEqualEpsilon(128, 1);
      amplitude = 1;
      shore = 0;
      expect(height(3)).toEqualEpsilon(128, 1);
      shore = 1;
      frame.camera.frustum.width = 100;
      context.uniformState.update(frame);
      expect(height(3)).toEqualEpsilon(128, 1);
    } finally {
      program.destroy();
      currentWaves.destroy();
      context.destroyForSpecs();
    }
  });
  [true, false].forEach(function (planar) {
    it(`renders, animates, picks and releases river resources in ${planar ? "Planar" : "Globe"}`, async function () {
      setup(planar);
      scene.light = new DirectionalLight({
        direction: vector(0.3, 0.2, -1),
        color: Color.WHITE,
      });
      river.roughness = 0.6;
      scene.renderForSpecs(time);
      expect(river.ready).toBeTrue();
      await scene.frameState._sceneGISWater.foamMaterial._promise;
      scene.renderForSpecs(time);
      const bound = river.getBoundingSphere();
      river.currentRippleAmplitude += 0.5;
      expect(river.getBoundingSphere().radius - bound.radius).toEqualEpsilon(
        0.5,
        1e-9,
      );
      scene.renderForSpecs(time);
      for (const node of river._mesh.selected) {
        expect(
          node.command.boundingVolume.radius - node.bounds.radius,
        ).toEqualEpsilon(river.currentRippleAmplitude, 1e-9);
      }
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
        JulianDate.addSeconds(time, 31.9997, new JulianDate()),
      );
      const phaseBefore = scene.context.readPixels();
      scene.renderForSpecs(
        JulianDate.addSeconds(time, 31.9999, new JulianDate()),
      );
      const phaseEnd = scene.context.readPixels();
      scene.renderForSpecs(
        JulianDate.addSeconds(time, 32.0001, new JulianDate()),
      );
      const phaseStart = scene.context.readPixels();
      const difference = (a, b) =>
        Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      // The phase boundary must be as continuous as an adjacent equal-duration
      // step, allowing one output code for rounding of filtered texture coverage.
      expect(difference(phaseStart, phaseEnd)).toBeLessThanOrEqual(
        Math.max(1, difference(phaseEnd, phaseBefore)) + 1,
      );
      river.currentSpeedScale = 0;
      scene.renderForSpecs(time);
      const frozen = scene.context.readPixels();
      scene.renderForSpecs(JulianDate.addSeconds(time, 1.25, new JulianDate()));
      expect(scene.context.readPixels()).not.toEqual(frozen);
      const evolved = scene.context.readPixels();
      scene.renderForSpecs(JulianDate.addSeconds(time, 1.25, new JulianDate()));
      expect(scene.context.readPixels()).toEqual(evolved);
      river.id = "edited";
      scene.renderForSpecs(time);
      expect(scene.pick(screen).id).toBe("edited");
      river.show = false;
      const fftTime = JulianDate.clone(river._waves._state.time);
      scene.renderForSpecs(time);
      expect(river._waves._state.time).toEqual(fftTime);
      expect(scene.pick(screen)?.id).not.toBe("edited");
      const arrays = [...river._mesh.nodes].flatMap((n) =>
        n.cache.map((e) => e.vertexArray),
      );
      const pickColor = river._surface._pickId.color;
      const currentWaves = river._waves;
      const currentTexture =
        currentWaves._state.bands[0].output.getColorTexture(0);
      scene.primitives.remove(river);
      expect(
        currentWaves.isDestroyed() && currentTexture.isDestroyed(),
      ).toBeTrue();
      expect(arrays.every((a) => a.isDestroyed())).toBeTrue();
      expect(scene.context.getObjectByPickColor(pickColor)).toBeUndefined();
    });
  });
  it("forwards medium optics and updates the shared water material without rebuilding geometry", function () {
    setup(true);
    scene.renderForSpecs(time);
    const surface = river._surface;
    const mesh = river._mesh;
    const program = surface._command.shaderProgram;
    river.scattering = new Cartesian3(0.1, 0.2, 0.3);
    river.scatteringAnisotropy = 0.5;
    scene.renderForSpecs(time);
    expect(surface.scattering).toBe(river.scattering);
    expect(surface.scatteringAnisotropy).toBe(0.5);
    expect(surface._command.uniformMap.u_mediumOptics()).toBeTrue();
    expect(surface._command.shaderProgram).toBe(program);
    expect(river._mesh).toBe(mesh);
    river.scattering = undefined;
    scene.renderForSpecs(time);
    expect(surface._command.uniformMap.u_mediumOptics()).toBeFalse();
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
    expect(wrong._waves._state).toBeUndefined();
    scene.primitives.remove(wrong);
    other.destroy();
    river.currentSpeedScale = -1;
    expect(() => scene.renderForSpecs(time)).toThrowDeveloperError();
  });
});
