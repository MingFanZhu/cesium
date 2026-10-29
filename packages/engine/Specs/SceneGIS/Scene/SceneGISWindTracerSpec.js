import {
  Cartesian3,
  Framebuffer,
  JulianDate,
  SceneGISWindSimulation,
  SceneGISWindFieldSampling,
} from "../../../index.js";
import createContext from "../../../../../Specs/createContext.js";
import createFrameState from "../../../../../Specs/createFrameState.js";

describe("SceneGIS/Scene/SceneGISWindTracer", function () {
  let context, wind, frame;
  const periodic = {
    xMin: "periodic",
    xMax: "periodic",
    yMin: "periodic",
    yMax: "periodic",
    zMin: "periodic",
    zMax: "periodic",
  };
  const source = {
    position: new Cartesian3(2.5, 3.5, 3.5),
    radius: 0.6,
    rate: 0.1,
  };
  function create(options = {}) {
    context = createContext();
    frame = createFrameState(context);
    frame.time = JulianDate.fromIso8601("2026-10-28T00:00:00Z");
    frame.passes.render = true;
    frame.frameNumber = 1;
    wind = new SceneGISWindSimulation({
      dimensions: new Cartesian3(8, 8, 8),
      cellSize: 1,
      timeStep: 1,
      kinematicViscosity: 0.1,
      windSpeed: 0,
      initialVelocity: new Cartesian3(0.02, 0, 0),
      boundaryConditions: periodic,
      paused: true,
      maximumStepsPerFrame: 64,
      tracerDiffusivity: 0.01,
      tracerSources: [source],
      ...options,
    });
    wind.update(frame);
  }
  function advance(count = 1) {
    wind.step(count);
    frame.frameNumber++;
    wind.update(frame);
  }
  function read() {
    const f = wind.getGpuField(),
      texture = f.concentrationTexture;
    const framebuffer = new Framebuffer({
      context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    const v = context.readPixels({
      framebuffer,
      width: texture.width,
      height: texture.height,
    });
    framebuffer.destroy();
    const result = [];
    for (let z = 0; z < 8; z++) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const p =
            x +
            (z % f.atlasColumns) * 8 +
            texture.width * (y + Math.floor(z / f.atlasColumns) * 8);
          result.push({ x, y, z, c: v[4 * p], cfl: v[4 * p + 1] });
        }
      }
    }
    return result;
  }
  afterEach(function () {
    wind?.destroy();
    wind = undefined;
    context?.destroyForSpecs();
    context = undefined;
  });
  it("conserves a transported pulse and reproduces transverse diffusion variance", function () {
    create();
    advance();
    const field = wind.getGpuField(),
      initial = field.concentrationTexture;
    wind.setTracerSources([]);
    advance();
    expect(field.concentrationTexture).not.toBe(initial);
    advance(19);
    const values = read(),
      mass = values.reduce((s, p) => s + p.c, 0);
    expect(mass).toEqualEpsilon(0.1, 2e-6);
    const k = (2 * Math.PI) / 8;
    const multiplier = [0.96 + 0.04 * Math.cos(k), 0.02 * Math.sin(k)];
    let expected = [Math.cos(2 * k), Math.sin(2 * k)];
    for (let i = 0; i < 20; i++) {
      expected = [
        expected[0] * multiplier[0] - expected[1] * multiplier[1],
        expected[0] * multiplier[1] + expected[1] * multiplier[0],
      ];
    }
    const harmonic = [
      values.reduce((s, p) => s + Math.cos(k * p.x) * p.c, 0) / mass,
      values.reduce((s, p) => s + Math.sin(k * p.x) * p.c, 0) / mass,
    ];
    const variance =
      values.reduce((s, p) => s + (p.y - 3) ** 2 * p.c, 0) / mass;
    expect(harmonic).toEqualEpsilon(expected, 2e-6);
    expect(variance).toEqualEpsilon(0.4, 0.002);
    expect(values.every((p) => p.c >= 0 && p.cfl < 1)).toBeTrue();
    expect(
      SceneGISWindFieldSampling.createUniformMap(field).u_sgWindTracer(),
    ).toBe(field.concentrationTexture);
  });
  it("blocks diffusion through solid barriers and resets all tracer state", function () {
    const mask = new Uint8Array(512);
    for (let z = 0; z < 8; z++) {
      for (let y = 0; y < 8; y++) {
        for (const x of [0, 4]) {
          mask[x + 8 * (y + 8 * z)] = 1;
        }
      }
    }
    create({ solidMask: mask, initialVelocity: Cartesian3.ZERO });
    advance();
    wind.setTracerSources([{ ...source, enabled: false }]);
    advance(20);
    const values = read();
    expect(values.reduce((s, p) => s + p.c, 0)).toEqualEpsilon(0.1, 2e-6);
    expect(
      values.filter((p) => p.x === 0 || p.x >= 4).every((p) => p.c === 0),
    ).toBeTrue();
    wind.reset();
    frame.frameNumber++;
    wind.update(frame);
    expect(read().every((p) => p.c === 0)).toBeTrue();
  });
  it("snapshots a small asynchronous sample and cancels pending queries on destruction", async function () {
    create();
    advance();
    const result = await wind.sampleAsync(source.position);
    expect(result.concentration).toEqualEpsilon(0.1, 1e-6);
    expect(result.velocity.x).toEqualEpsilon(0.02, 1e-6);
    expect(result.simulationTime).toEqual(1);
    const field = wind.getGpuField(),
      version = field.version,
      texture = field.concentrationTexture;
    frame.frameNumber++;
    wind.update(frame);
    expect(field.version).toEqual(version);
    const pending = wind.sampleAsync(source.position);
    wind.destroy();
    wind = undefined;
    await expectAsync(pending).toBeRejected();
    expect(texture.isDestroyed()).toBeTrue();
  });
  it("rejects invalid source and diffusion contracts before GPU allocation", function () {
    expect(
      () => new SceneGISWindSimulation({ tracerDiffusivity: -1 }),
    ).toThrowDeveloperError();
    expect(
      () => new SceneGISWindSimulation({ tracerDiffusivity: 100 }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISWindSimulation({
          tracerSources: [{ ...source, radius: 0 }],
        }),
    ).toThrowDeveloperError();
  });
});
