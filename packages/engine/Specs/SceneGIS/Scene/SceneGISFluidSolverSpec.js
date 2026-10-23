import {
  Cartesian3,
  Framebuffer,
  Quaternion,
  _SceneGISFluidSolver as Solver,
} from "../../../index.js";
import createContext from "../../../../../Specs/createContext.js";

describe("SceneGIS/Scene/SceneGISFluidSolver", function () {
  let context, solver;
  function options(overrides = {}) {
    return {
      maximumParticles: 64,
      minimum: new Cartesian3(-1, -1, 0),
      maximum: new Cartesian3(1, 1, 3),
      smoothingRadius: 0.16,
      particleSpacing: 0.065,
      particleRadius: 0.025,
      gravity: new Cartesian3(0, 0, -9.81),
      emitterPosition: new Cartesian3(0, 0, 0.15),
      emitterVelocity: new Cartesian3(0, 0, 3),
      emitterRadius: 0.05,
      particleLifetime: 2,
      solverIterations: 2,
      restitution: 0.05,
      damping: 0,
      ...overrides,
    };
  }
  function read(texture) {
    const framebuffer = new Framebuffer({
      context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    try {
      return Array.from(
        context.readPixels({
          framebuffer,
          width: texture.width,
          height: texture.height,
        }),
      );
    } finally {
      framebuffer.destroy();
    }
  }
  function upload(positions, velocities = []) {
    for (const [texture, values] of [
      [solver.position, positions],
      [solver.velocity, velocities],
    ]) {
      const array = new Float32Array(solver.capacity * 4);
      array.set(values);
      texture.copyFrom({
        source: {
          width: solver.width,
          height: solver.height,
          arrayBufferView: array,
        },
      });
    }
  }
  function density() {
    solver.buildNeighborhood(solver.position);
    solver.lambdaCommand.framebuffer = solver.lambda;
    solver.lambdaCommand.renderState = solver.particleRenderState;
    solver.lambdaCommand.execute(context);
    return read(solver.lambda.getColorTexture(0));
  }
  beforeEach(function () {
    context = createContext();
  });
  afterEach(function () {
    if (solver && !solver.isDestroyed()) {
      solver.destroy();
    }
    solver = undefined;
    context.destroyForSpecs();
  });

  it("finds exact GPU neighbors and densities against an independent all-pairs reference", function () {
    const config = options();
    solver = new Solver(context, config);
    const positions = [];
    for (let i = 0; i < 53; i++) {
      positions.push(
        (i % 5) * 0.052 - 0.11,
        (Math.floor(i / 5) % 4) * 0.051 - 0.08,
        0.3 + Math.floor(i / 20) * 0.05,
        2,
      );
    }
    upload(positions);
    function compare(positions, actual) {
      for (let i = 0; i < 53; i++) {
        let sum = 0,
          neighbors = 0;
        for (let j = 0; j < 53; j++) {
          const r = Math.hypot(
            ...[0, 1, 2].map(
              (axis) => positions[i * 4 + axis] - positions[j * 4 + axis],
            ),
          );
          if (r < config.smoothingRadius) {
            const q = 1 - (r / config.smoothingRadius) ** 2;
            sum +=
              ((config.particleSpacing ** 3 * 315) /
                (64 * Math.PI * config.smoothingRadius ** 3)) *
              q ** 3;
            neighbors++;
          }
        }
        expect(actual[i * 4 + 1]).toEqualEpsilon(sum, 0.00002);
        expect(actual[i * 4 + 2]).toBe(neighbors);
      }
      expect(actual.slice(53 * 4)).toEqual(new Array((64 - 53) * 4).fill(0));
    }
    compare(positions, density());
    const sorted = read(solver.keys[solver.sortIndex].getColorTexture(0));
    for (let i = 1; i < solver.capacity; i++) {
      expect(sorted[i * 4]).toBeGreaterThanOrEqual(sorted[(i - 1) * 4]);
    }
    // The last lambda pass reads the first projection while still querying
    // the grid built before any projections. Compare that exact state.
    solver.step(1 / 60, 0, config);
    compare(
      read(solver.projected[0].getColorTexture(0)),
      read(solver.lambda.getColorTexture(0)),
    );
  });

  it("reduces compression by GPU position constraints without a runtime readback", function () {
    const config = options({ gravity: Cartesian3.ZERO, solverIterations: 3 });
    solver = new Solver(context, config);
    const positions = [];
    for (let i = 0; i < 64; i++) {
      positions.push(
        (i % 4) * 0.04,
        (Math.floor(i / 4) % 4) * 0.04,
        0.5 + Math.floor(i / 16) * 0.04,
        2,
      );
    }
    upload(positions);
    const peakBefore = Math.max(...density().filter((_, i) => i % 4 === 1));
    const readback = spyOn(context, "readPixels").and.callThrough();
    solver.step(1 / 60, 0, config);
    expect(readback).not.toHaveBeenCalled();
    const peakAfter = Math.max(...density().filter((_, i) => i % 4 === 1));
    expect(peakBefore).toBeGreaterThan(1.5);
    expect(peakAfter).toBeLessThan(peakBefore * 0.8);
    expect(read(solver.position).every(Number.isFinite)).toBe(true);
  });

  it("integrates gravity, collides, expires, recycles and resets persistent resources", function () {
    const config = options({ maximumParticles: 16 });
    solver = new Solver(context, config);
    upload([0, 0, 1, 2], [1, 0, 0, 0]);
    solver.step(1 / 60, 0, config);
    expect(read(solver.position).slice(0, 4)).toEqualEpsilon(
      [1 / 60, 0, 1 - 9.81 / 3600, 2 - 1 / 60],
      0.000001,
    );
    upload([0, 0, 0.03, 2], [0, 0, -10, 0]);
    solver.step(1 / 60, 0, config);
    expect(read(solver.position)[2]).toEqualEpsilon(
      config.particleRadius,
      0.000001,
    );
    expect(read(solver.velocity)[2]).toBeGreaterThanOrEqual(0);
    upload([0, 0, 1, 0.001]);
    solver.step(1 / 60, 0, config);
    expect(read(solver.position)[3]).toBe(0);
    solver.reset();
    const targets = solver.targets.slice();
    for (let i = 0; i < 6; i++) {
      solver.step(1 / 60, 4, config);
    }
    expect(
      read(solver.position)
        .filter((_, i) => i % 4 === 3)
        .every((life) => life > 0),
    ).toBe(true);
    expect(solver.cursor).toBe(8);
    solver.reset();
    expect(
      read(solver.position)
        .filter((_, i) => i % 4 === 3)
        .every((life) => life === 0),
    ).toBe(true);
    expect(solver.targets).toEqual(targets);
    expect(context._gl.getError()).toBe(0);
    solver.destroy();
    expect(targets.every((t) => t.isDestroyed())).toBe(true);
  });

  it("rotates new disk samples and velocities without rotating gravity or existing particles", function () {
    const dt = 1 / 60;
    const config = options({
      maximumParticles: 16,
      emitterPosition: new Cartesian3(0, 0, 1),
      emitterRadius: 0.2,
      emitterOrientation: Quaternion.fromAxisAngle(
        Cartesian3.UNIT_Y,
        Math.PI / 2,
      ),
    });
    solver = new Solver(context, config);
    const targets = solver.targets.slice();
    const readback = spyOn(context, "readPixels").and.callThrough();
    solver.step(dt, 1, config);
    expect(readback).not.toHaveBeenCalled();
    const halfStep = dt / 2;
    const birthHeight = 1 - 0.2 * Math.sqrt(0.5);
    expect(read(solver.position).slice(0, 3)).toEqualEpsilon(
      [3 * halfStep, 0, birthHeight - 9.81 * halfStep ** 2],
      0.000002,
    );
    expect(read(solver.velocity).slice(0, 3)).toEqualEpsilon(
      [3, 0, -9.81 * halfStep],
      0.000002,
    );
    // Separate the next birth from the first particle's neighborhood.
    config.emitterPosition.y = 0.5;
    Quaternion.fromAxisAngle(
      Cartesian3.UNIT_X,
      Math.PI / 2,
      config.emitterOrientation,
    );
    solver.step(dt, 1, config);
    const positions = read(solver.position);
    const velocities = read(solver.velocity);
    expect(velocities.slice(0, 3)).toEqualEpsilon(
      [3, 0, -9.81 * (dt + halfStep)],
      0.000002,
    );
    expect(velocities.slice(4, 7)).toEqualEpsilon(
      [0, -3, -9.81 * halfStep],
      0.000002,
    );
    const radius = 0.2 * Math.sqrt((0.754877666 + 0.5) % 1);
    expect(positions.slice(4, 7)).toEqualEpsilon(
      [
        Math.cos(2.39996323) * radius,
        0.5 - 3 * halfStep,
        1 + Math.sin(2.39996323) * radius - 9.81 * halfStep ** 2,
      ],
      0.000002,
    );
    expect(solver.targets).toEqual(targets);
    expect(context._gl.getError()).toBe(0);
  });

  it("fits bounded volume-preserving GPU ellipsoids to a tilted stream and leaves isolated drops spherical", function () {
    solver = new Solver(context, options());
    const positions = [];
    for (let i = -6; i <= 6; i++) {
      positions.push(i * 0.012, i * 0.012, 1, 2);
    }
    positions.push(-0.6, 0, 1, 2);
    upload(positions);
    const readback = spyOn(context, "readPixels").and.callThrough();
    const bytes = solver.byteLength;
    solver.updateSurface();
    expect(readback).not.toHaveBeenCalled();
    expect(solver.byteLength - bytes).toBe(solver.capacity * 48);
    const channels = [0, 1, 2].map((i) =>
      read(solver.shape.getColorTexture(i)),
    );
    const axes = channels.map((data) => Cartesian3.fromArray(data, 6 * 4));
    const lengths = axes.map((axis) => Cartesian3.magnitude(axis));
    expect(lengths.reduce((a, b) => a * b, 1)).toEqualEpsilon(1, 0.00001);
    expect(Math.max(...lengths)).toBeLessThan(1.6);
    expect(Math.max(...lengths) / Math.min(...lengths)).toEqualEpsilon(
      2,
      0.0001,
    );
    const longest = Cartesian3.normalize(
      axes[lengths.indexOf(Math.max(...lengths))],
      new Cartesian3(),
    );
    expect(
      Math.abs(
        Cartesian3.dot(
          longest,
          Cartesian3.normalize(new Cartesian3(1, 1, 0), new Cartesian3()),
        ),
      ),
    ).toEqualEpsilon(1, 0.00001);
    expect(channels.map((data) => data.slice(13 * 4, 13 * 4 + 3))).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(channels.flat().every(Number.isFinite)).toBeTrue();
    const shape = solver.shape;
    const execute = spyOn(solver.shapeCommand, "execute").and.callThrough();
    solver.updateSurface();
    expect(execute).not.toHaveBeenCalled();
    solver.step(1 / 60, 0, options());
    solver.updateSurface();
    expect(execute.calls.count()).toBe(1);
    expect(solver.shape).toBe(shape);
    solver.destroy();
    expect(shape.isDestroyed()).toBeTrue();
  });

  it("generates passive GPU spray from fast surface flow and box impacts, then reuses and clears its pool", function () {
    const config = options({
      gravity: Cartesian3.ZERO,
      sprayIntensity: 4,
      maximumParticles: 16,
    });
    solver = new Solver(context, config);
    const bytes = solver.byteLength;
    expect(solver.spray).toBeUndefined();
    upload([0, 0, 1, 2]);
    solver.step(1 / 60, 0, config);
    expect(solver.byteLength - bytes).toBe(16 * 64);
    expect(
      read(solver.spray[solver.sprayIndex].getColorTexture(0)).every(
        (x) => x === 0,
      ),
    ).toBeTrue();
    const frames = solver.spray.slice();
    function emit() {
      solver.reset();
      upload([0, 0, 1, 2], [30, 0, 0, 0]);
      const readback = spyOn(context, "readPixels").and.callThrough();
      solver.step(1 / 60, 0, config);
      expect(readback).not.toHaveBeenCalled();
      return read(solver.spray[solver.sprayIndex].getColorTexture(0));
    }
    const emitted = emit();
    expect(emitted[3]).toBeGreaterThan(0.3);
    expect(emitted.slice(4).every((x) => x === 0)).toBeTrue();
    // Reset the same state and step index to reproduce the GPU birth sequence.
    solver.reset();
    upload([0, 0, 1, 2], [30, 0, 0, 0]);
    solver.step(1 / 60, 0, config);
    expect(read(solver.spray[solver.sprayIndex].getColorTexture(0))).toEqual(
      emitted,
    );
    solver.reset();
    upload([0, 0, 0.03, 2], [0, 0, -100, 0]);
    solver.step(1 / 60, 0, config);
    const impact = read(solver.spray[solver.sprayIndex].getColorTexture(0));
    expect(impact[3]).toBeGreaterThan(0.3);
    expect(impact[2]).toBeGreaterThan(config.particleRadius);
    expect(
      read(solver.spray[solver.sprayIndex].getColorTexture(1))[2],
    ).toBeGreaterThan(0);
    expect(solver.spray).toEqual(frames);
    solver.reset();
    expect(
      read(solver.spray[solver.sprayIndex].getColorTexture(0)).every(
        (x) => x === 0,
      ),
    ).toBeTrue();
    solver.destroy();
    expect(frames.every((frame) => frame.isDestroyed())).toBeTrue();
  });

  it("advances spray ballistically, expires, absorbs at bounds and reabsorbs into dense liquid", function () {
    const config = options();
    solver = new Solver(context, config);
    solver.initializeSpray();
    function setSpray(positions, velocities) {
      for (const [channel, values] of [
        [0, positions],
        [1, velocities],
      ]) {
        const array = new Float32Array(solver.capacity * 4);
        array.set(values);
        solver.spray[solver.sprayIndex].getColorTexture(channel).copyFrom({
          source: {
            width: solver.width,
            height: solver.height,
            arrayBufferView: array,
          },
        });
      }
    }
    setSpray(
      [0, 0, 1, 0.6, 0.99, 0, 1, 0.6, 0, 0, 2, 0.001],
      [1, 0, 0, 0.6, 2, 0, 0, 0.6, 0, 0, 0, 0.6],
    );
    const dt = 1 / 60;
    solver.step(dt, 0, config);
    const actual = read(solver.spray[solver.sprayIndex].getColorTexture(0));
    const damping = Math.exp(-0.7 * dt);
    expect(actual.slice(0, 4)).toEqualEpsilon(
      [dt * damping, 0, 1 - 9.81 * dt * dt * damping, 0.6 - dt],
      1e-6,
    );
    expect(actual[7]).toBe(0);
    expect(actual[11]).toBe(0);
    const positions = [];
    for (let z = -1; z <= 1; z++) {
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          positions.push(x * 0.05, y * 0.05, 1 + z * 0.05, 2);
        }
      }
    }
    upload(positions);
    setSpray([0, 0, 1, 0.6], [0, 0, 0, 0.6]);
    solver.step(dt, 0, config);
    expect(read(solver.spray[solver.sprayIndex].getColorTexture(0))[3]).toBe(0);
    expect(context._gl.getError()).toBe(0);
  });

  it("qualifies full-capacity GPU simulation cost", async function () {
    const gl = context._gl;
    const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const results = [];
    for (const capacity of [1024, 4096]) {
      const side = Math.ceil(Math.cbrt(capacity));
      const config = options({
        maximumParticles: capacity,
        initialParticles: capacity,
        initialMinimum: new Cartesian3(-0.5, -0.5, 0.04),
        initialDimensions: new Cartesian3(side, side, side),
      });
      solver = new Solver(context, config);
      solver.step(1 / 60, 0, config);
      const samples = [];
      for (let i = 0; i < 4; i++) {
        const query = extension ? gl.createQuery() : undefined;
        if (query) {
          gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        }
        const start = performance.now();
        solver.step(1 / 60, 0, config);
        samples.push({ query, cpu: performance.now() - start });
        if (query) {
          gl.endQuery(extension.TIME_ELAPSED_EXT);
        }
      }
      for (const sample of samples) {
        if (sample.query) {
          while (
            !gl.getQueryParameter(sample.query, gl.QUERY_RESULT_AVAILABLE)
          ) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          sample.gpu = gl.getParameter(extension.GPU_DISJOINT_EXT)
            ? null
            : gl.getQueryParameter(sample.query, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(sample.query);
          delete sample.query;
        }
      }
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      results.push({
        capacity,
        iterations: config.solverIterations,
        draws: solver.drawCount,
        bytes: solver.byteLength,
        renderer: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        samples,
      });
      expect(read(solver.position).every(Number.isFinite)).toBe(true);
      expect(gl.getError()).toBe(0);
      solver.destroy();
    }
    console.log(`Fluid solver qualification: ${JSON.stringify(results)}`);
  }, 120000);
});
