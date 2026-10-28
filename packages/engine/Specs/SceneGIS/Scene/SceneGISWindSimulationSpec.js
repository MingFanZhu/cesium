import {
  Cartesian3,
  Framebuffer,
  JulianDate,
  SceneGISWindSimulation,
  _SceneGISWindModel as model,
  _SceneGISWindSolver as Solver,
} from "../../../index.js";
import createContext from "../../../../../Specs/createContext.js";
import createFrameState from "../../../../../Specs/createFrameState.js";

describe("SceneGIS/Scene/SceneGISWindSimulation", function () {
  let context, solver, simulation;
  function config(overrides = {}) {
    return model.configure({
      dimensions: new Cartesian3(4, 8, 4),
      cellSize: 1,
      timeStep: 1,
      kinematicViscosity: 0.1,
      initialVelocity: new Cartesian3(0.02, 0, 0),
      smagorinskyConstant: 0,
      ...overrides,
    });
  }
  function read(texture) {
    const target = new Framebuffer({
      context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    try {
      return context.readPixels({
        framebuffer: target,
        width: texture.width,
        height: texture.height,
      });
    } finally {
      target.destroy();
    }
  }
  function pixel(x, y, z) {
    const n = solver.config.dimensions;
    return (
      x +
      (z % solver.columns) * n.x +
      solver.width * (y + Math.floor(z / solver.columns) * n.y)
    );
  }
  function equilibrium(velocity, rho = 1) {
    const u2 = velocity.reduce((s, u) => s + u * u, 0);
    return model.directions.map((c, i) => {
      const cu = c.reduce((s, v, a) => s + v * velocity[a], 0);
      return (
        model.weights[i] * (rho - 1 + rho * (3 * cu + 4.5 * cu * cu - 1.5 * u2))
      );
    });
  }
  function upload(value) {
    const n = solver.config.dimensions;
    const arrays = Array.from(
      { length: 5 },
      () => new Float32Array(solver.width * solver.height * 4),
    );
    for (let z = 0; z < n.z; z++) {
      for (let y = 0; y < n.y; y++) {
        for (let x = 0; x < n.x; x++) {
          const g = value(x, y, z);
          const index = pixel(x, y, z);
          for (let i = 0; i < 19; i++) {
            arrays[Math.floor(i / 4)][index * 4 + (i % 4)] = g[i];
          }
        }
      }
    }
    for (let i = 0; i < 5; i++) {
      const t =
        i < 4
          ? solver.buffers[solver.index][0].getColorTexture(i)
          : solver.buffers[solver.index][1].getColorTexture(0);
      t.copyFrom({
        source: {
          width: solver.width,
          height: solver.height,
          arrayBufferView: arrays[i],
        },
      });
    }
  }
  beforeEach(function () {
    context = createContext();
  });
  afterEach(function () {
    if (simulation && !simulation.isDestroyed()) {
      simulation.destroy();
    }
    if (solver && !solver.isDestroyed()) {
      solver.destroy();
    }
    simulation = solver = undefined;
    context.destroyForSpecs();
  });

  it("preserves uniform flow and the exact requested molecular viscosity", function () {
    solver = new Solver(context, config());
    for (let i = 0; i < 30; i++) {
      solver.step();
    }
    const v = read(solver.velocity);
    expect(v[0]).toEqualEpsilon(0.02, 1e-6);
    expect(v[1]).toEqualEpsilon(0, 1e-7);
    expect(v[3]).toEqualEpsilon(1, 1e-6);
    expect(solver.config.viscosity).toEqual(0.1);
    expect(solver.drawCount).toEqual(93);
  });

  it("matches independent moment-space collision and conserves mass/momentum with LES", function () {
    solver = new Solver(context, config({ smagorinskyConstant: 0.12 }));
    const input = equilibrium([0.02, 0.01, -0.005]).map(
      (v, i) => v + Math.sin(i * 1.7) * 0.0005,
    );
    const rho = 1 + input.reduce((s, v) => s + v, 0);
    const momentum = [0, 1, 2].map((a) =>
      input.reduce((s, v, i) => s + v * model.directions[i][a], 0),
    );
    const eq = equilibrium(
      momentum.map((v) => v / rho),
      rho,
    );
    const neq = input.map((v, i) => v - eq[i]);
    const stress = [0, 1, 2].map((a) =>
      [0, 1, 2].map((b) =>
        neq.reduce(
          (s, v, i) => s + v * model.directions[i][a] * model.directions[i][b],
          0,
        ),
      ),
    );
    const trace = (stress[0][0] + stress[1][1] + stress[2][2]) / 3;
    for (let a = 0; a < 3; a++) {
      stress[a][a] -= trace;
    }
    const norm = Math.sqrt(2 * stress.flat().reduce((s, v) => s + v * v, 0));
    const tau =
      (solver.config.tau +
        Math.sqrt(solver.config.tau ** 2 + (18 * 0.12 ** 2 * norm) / rho)) /
      2;
    const moments = model.matrix.map(
      (row, k) =>
        row.reduce((s, v, i) => s + v * neq[i], 0) *
        (model.shear.includes(k) ? 1 / tau : model.rates[k]),
    );
    const expected = input.map(
      (v, i) =>
        v -
        model.matrix.reduce(
          (s, row, k) => s + (row[i] * moments[k]) / model.norms[k],
          0,
        ),
    );
    upload(() => input);
    solver.step();
    const output = [];
    for (let i = 0; i < 5; i++) {
      const t =
        i < 4
          ? solver.buffers[solver.index][0].getColorTexture(i)
          : solver.buffers[solver.index][1].getColorTexture(0);
      output.push(...read(t).slice(0, 4));
    }
    for (let i = 0; i < 19; i++) {
      expect(output[i]).toEqualEpsilon(expected[i], 2e-7);
    }
    expect(output.slice(0, 19).reduce((s, v) => s + v, 0) + 1).toEqualEpsilon(
      rho,
      2e-7,
    );
    for (let a = 0; a < 3; a++) {
      expect(
        output
          .slice(0, 19)
          .reduce((s, v, i) => s + v * model.directions[i][a], 0),
      ).toEqualEpsilon(momentum[a], 2e-7);
    }
  });

  it("converges toward analytic viscous shear decay under grid refinement", function () {
    const errors = [];
    for (const ny of [12, 24]) {
      solver = new Solver(
        context,
        config({
          dimensions: new Cartesian3(4, ny, 4),
          initialVelocity: Cartesian3.ZERO,
        }),
      );
      const k = (2 * Math.PI) / ny;
      upload((x, y) => equilibrium([0.01 * Math.sin(k * (y + 0.5)), 0, 0]));
      const steps = ny === 12 ? 30 : 120;
      for (let i = 0; i < steps; i++) {
        solver.step();
      }
      const actual = read(solver.velocity);
      const expected = 0.01 * Math.exp(-0.1 * k * k * steps);
      let amplitude = 0;
      for (let y = 0; y < ny; y++) {
        amplitude +=
          (actual[pixel(0, y, 0) * 4] * Math.sin(k * (y + 0.5)) * 2) / ny;
      }
      errors.push(Math.abs(amplitude / expected - 1));
      solver.destroy();
      solver = undefined;
    }
    expect(errors[0]).toBeLessThan(0.06);
    expect(errors[1]).toBeLessThan(errors[0]);
    expect(errors[1]).toBeLessThan(0.02);
  });

  it("owns fixed stepping once per normal frame and releases shared field textures", function () {
    simulation = new SceneGISWindSimulation({
      dimensions: new Cartesian3(4, 4, 4),
      cellSize: 1,
      timeStep: 1,
      kinematicViscosity: 0.1,
      initialVelocity: new Cartesian3(0.02, 0, 0),
      maximumStepsPerFrame: 2,
    });
    const frame = createFrameState(context);
    const start = JulianDate.fromIso8601("2026-10-28T00:00:00Z");
    function tick(seconds, id, render = true) {
      frame.time = JulianDate.addSeconds(start, seconds, frame.time);
      frame.frameNumber = id;
      frame.passes.render = render;
      frame.passes.pick = !render;
      simulation.update(frame);
    }
    expect(simulation.getGpuField()).toBeUndefined();
    tick(0, 1);
    const field = simulation.getGpuField();
    const texture = field.velocityTexture;
    tick(5, 2);
    expect(simulation.simulationTime).toEqual(2);
    expect(simulation.pendingTime).toEqual(3);
    tick(5, 2);
    tick(6, 3, false);
    expect(simulation.simulationTime).toEqual(2);
    simulation.paused = true;
    tick(6, 4);
    expect(simulation.simulationTime).toEqual(2);
    simulation.step();
    tick(7, 5);
    expect(simulation.simulationTime).toEqual(3);
    const version = field.version;
    simulation.reset();
    tick(8, 6);
    expect(simulation.simulationTime).toEqual(0);
    expect(simulation.pendingTime).toEqual(0);
    expect(field.version).toBeGreaterThan(version);
    expect(field.generation).toEqual(1);
    expect(field.velocityTexture).toBe(texture);
    const owned = simulation._solver.targets.flatMap((t) =>
      Array.from({ length: t.numberOfColorAttachments }, (_, i) =>
        t.getColorTexture(i),
      ),
    );
    simulation.destroy();
    expect(texture.isDestroyed()).toBe(true);
    for (const t of owned) {
      expect(t.isDestroyed()).toBe(true);
    }
  });
});
