import {
  Cartesian3,
  Framebuffer,
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
