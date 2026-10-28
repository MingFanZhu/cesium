import { Cartesian3, Matrix4, SceneGISWindSimulation } from "../../../index.js";
import model from "../../../Source/SceneGIS/Core/_private/_SceneGISWindModel.js";

describe("SceneGIS/Core/SceneGISWindModel", function () {
  it("has an orthogonal invertible D3Q19 moment basis and isotropic quadrature", function () {
    for (let a = 0; a < 19; a++) {
      for (let b = 0; b < 19; b++) {
        const product = model.matrix[a].reduce(
          (s, v, i) => s + v * model.matrix[b][i],
          0,
        );
        expect(product).toEqual(a === b ? model.norms[a] : 0);
      }
      expect(model.opposite[model.opposite[a]]).toEqual(a);
    }
    expect(model.weights.reduce((a, b) => a + b, 0)).toEqualEpsilon(1, 1e-14);
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        expect(
          model.directions.reduce(
            (s, c, i) => s + model.weights[i] * c[a] * c[b],
            0,
          ),
        ).toEqualEpsilon(a === b ? 1 / 3 : 0, 1e-14);
      }
    }
  });
  it("converts physical units without changing viscosity or time step", function () {
    const options = {
      cellSize: 0.5,
      timeStep: 0.01,
      kinematicViscosity: 0.1,
      initialVelocity: new Cartesian3(1, 0.5, 0),
    };
    const c = model.configure(options);
    expect(c.tau).toEqualEpsilon(0.512, 1e-14);
    expect(c.latticeVelocity.x).toEqual(0.02);
    expect(c.latticeVelocity.y).toEqual(0.01);
    expect(c.viscosity).toEqual(0.1);
    options.initialVelocity.x = 3;
    expect(c.velocity.x).toEqual(1);
  });
  it("rejects unsupported units, masks, controls and nonrigid placement", function () {
    for (const options of [
      { cellSize: 0 },
      { timeStep: NaN },
      { kinematicViscosity: 0 },
      { kinematicViscosity: 1e-12 },
      { smagorinskyConstant: 0.3 },
      { initialVelocity: new Cartesian3(100, 0, 0) },
      { dimensions: new Cartesian3(3, 4, 4) },
      { solidMask: new Uint8Array(3) },
      { modelMatrix: Matrix4.fromUniformScale(2) },
      { maximumStepsPerFrame: 0 },
      { paused: 1 },
    ]) {
      expect(() => new SceneGISWindSimulation(options)).toThrowDeveloperError();
    }
  });
});
