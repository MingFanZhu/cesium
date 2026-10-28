import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Matrix3 from "../../../Core/Matrix3.js";
import Matrix4 from "../../../Core/Matrix4.js";

const directions = [
  [0, 0, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];
const weights = directions.map((_, i) =>
  i === 0 ? 1 / 3 : i < 7 ? 1 / 18 : 1 / 36,
);
const opposite = directions.map(([x, y, z]) =>
  directions.findIndex(([a, b, c]) => a === -x && b === -y && c === -z),
);
// Orthogonal raw-moment basis, d'Humieres et al. (2002), Appendix A.
const columns = directions.map(([x, y, z]) => {
  const r = x * x + y * y + z * z;
  const p = 3 * x * x - r;
  const q = y * y - z * z;
  return [
    1,
    19 * r - 30,
    (21 * r * r - 53 * r + 24) / 2,
    x,
    (5 * r - 9) * x,
    y,
    (5 * r - 9) * y,
    z,
    (5 * r - 9) * z,
    p,
    (3 * r - 5) * p,
    q,
    (3 * r - 5) * q,
    x * y,
    y * z,
    x * z,
    (y * y - z * z) * x,
    (z * z - x * x) * y,
    (x * x - y * y) * z,
  ];
});
const matrix = Array.from({ length: 19 }, (_, row) =>
  columns.map((c) => c[row]),
);
const norms = matrix.map((row) => row.reduce((s, v) => s + v * v, 0));
const shear = [9, 11, 13, 14, 15];
const rates = [
  0, 1.19, 1.4, 0, 1.2, 0, 1.2, 0, 1.2, 0, 1.4, 0, 1.4, 0, 0, 0, 1.98, 1.98,
  1.98,
];

function finiteVector(name, value) {
  if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new DeveloperError(`${name} must be a finite Cartesian3.`);
  }
}

const rotation = new Matrix3();
const transpose = new Matrix3();
const orthogonal = new Matrix3();
function rigid(value) {
  if (
    !value ||
    !Array.from({ length: 16 }, (_, i) => value[i]).every(Number.isFinite)
  ) {
    throw new DeveloperError("modelMatrix must be a finite rigid transform.");
  }
  Matrix4.getMatrix3(value, rotation);
  Matrix3.multiply(
    Matrix3.transpose(rotation, transpose),
    rotation,
    orthogonal,
  );
  if (
    !Matrix3.equalsEpsilon(orthogonal, Matrix3.IDENTITY, 1e-7) ||
    Math.abs(Matrix3.determinant(rotation) - 1) > 1e-7 ||
    value[3] !== 0 ||
    value[7] !== 0 ||
    value[11] !== 0 ||
    value[15] !== 1
  ) {
    throw new DeveloperError(
      "modelMatrix must be a rigid transform without scaling or reflection.",
    );
  }
}

function configure(options) {
  const dimensions = Cartesian3.clone(
    options.dimensions ?? new Cartesian3(128, 128, 32),
  );
  finiteVector("dimensions", dimensions);
  const count = dimensions.x * dimensions.y * dimensions.z;
  if (
    ![dimensions.x, dimensions.y, dimensions.z].every(
      (v) => Number.isInteger(v) && v >= 4,
    ) ||
    !Number.isSafeInteger(count) ||
    count > 2097152
  ) {
    throw new DeveloperError(
      "dimensions must be integers >=4 with at most 2097152 cells.",
    );
  }
  const cellSize = options.cellSize ?? 2;
  const timeStep = options.timeStep ?? 0.02;
  const viscosity = options.kinematicViscosity ?? 1.5e-5;
  const smagorinsky = options.smagorinskyConstant ?? 0.12;
  if (
    ![cellSize, timeStep, viscosity].every(
      (v) => Number.isFinite(v) && v > 0,
    ) ||
    !Number.isFinite(smagorinsky) ||
    smagorinsky < 0 ||
    smagorinsky > 0.2
  ) {
    throw new DeveloperError(
      "cellSize, timeStep and viscosity must be positive; Smagorinsky constant must be in [0, 0.2].",
    );
  }
  const tau = 0.5 + (3 * viscosity * timeStep) / (cellSize * cellSize);
  if (!(tau > 0.5000001 && tau <= 2)) {
    throw new DeveloperError(
      "Lattice relaxation time must satisfy 0.5000001 < tau <= 2; adjust the explicitly specified grid/time/viscosity.",
    );
  }
  const windSpeed = options.windSpeed ?? 5;
  const windDirection = options.windDirection ?? 0;
  if (
    !Number.isFinite(windSpeed) ||
    windSpeed < 0 ||
    !Number.isFinite(windDirection)
  ) {
    throw new DeveloperError(
      "windSpeed must be nonnegative and windDirection finite radians.",
    );
  }
  const wind = new Cartesian3(
    windSpeed * Math.cos(windDirection),
    windSpeed * Math.sin(windDirection),
    0,
  );
  const velocity = Cartesian3.clone(options.initialVelocity ?? wind);
  const minimum = Cartesian3.clone(options.minimum ?? Cartesian3.ZERO);
  finiteVector("initialVelocity", velocity);
  finiteVector("minimum", minimum);
  const latticeVelocity = Cartesian3.multiplyByScalar(
    velocity,
    timeStep / cellSize,
    new Cartesian3(),
  );
  const latticeWind = Cartesian3.multiplyByScalar(
    wind,
    timeStep / cellSize,
    new Cartesian3(),
  );
  if (
    Math.sqrt(3) *
      Math.max(
        Cartesian3.magnitude(latticeVelocity),
        Cartesian3.magnitude(latticeWind),
      ) >
    0.1 + 1e-12
  ) {
    throw new DeveloperError(
      "Initial lattice Mach number must not exceed 0.1.",
    );
  }
  const acceleration = Cartesian3.clone(
    options.acceleration ?? Cartesian3.ZERO,
  );
  finiteVector("acceleration", acceleration);
  const latticeAcceleration = Cartesian3.multiplyByScalar(
    acceleration,
    (timeStep * timeStep) / cellSize,
    new Cartesian3(),
  );
  const defaults = {
    xMin: "wind",
    xMax: "wind",
    yMin: "wind",
    yMax: "wind",
    zMin: "wall",
    zMax: "slip",
  };
  const boundaries = { ...defaults, ...options.boundaryConditions };
  if (Object.keys(boundaries).some((k) => !(k in defaults))) {
    throw new DeveloperError(
      "Unknown boundary face; use xMin/xMax/yMin/yMax/zMin/zMax.",
    );
  }
  const boundaryMin = new Cartesian3();
  const boundaryMax = new Cartesian3();
  for (const axis of ["x", "y", "z"]) {
    if (
      (boundaries[`${axis}Min`] === "periodic") !==
      (boundaries[`${axis}Max`] === "periodic")
    ) {
      throw new DeveloperError(
        "Periodic boundaries must be paired on each axis.",
      );
    }
    for (const [suffix, sign, target] of [
      ["Min", -1, boundaryMin],
      ["Max", 1, boundaryMax],
    ]) {
      const type = boundaries[axis + suffix];
      const normalSpeed = latticeWind[axis] * sign;
      const codes = { periodic: 0, wall: 1, slip: 2, inlet: 3, outlet: 4 };
      const effective =
        type === "wind"
          ? Math.abs(normalSpeed) < 1e-12
            ? "slip"
            : normalSpeed < 0
              ? "inlet"
              : "outlet"
          : type;
      if (
        !(effective in codes) ||
        (effective === "inlet" && normalSpeed >= 0) ||
        (effective === "outlet" && normalSpeed <= 0)
      ) {
        throw new DeveloperError(
          "Boundary must be periodic/wall/slip/wind or an inlet/outlet aligned with the prescribed wind.",
        );
      }
      target[axis] = codes[effective];
    }
  }
  const mask = options.solidMask;
  if (
    mask !== undefined &&
    (!(mask instanceof Uint8Array) ||
      mask.length !== count ||
      mask.some((v) => v !== 0 && v !== 1))
  ) {
    throw new DeveloperError(
      "solidMask must be an x-fastest Uint8Array of 0/1 with exactly one entry per cell.",
    );
  }
  return {
    dimensions,
    count,
    cellSize,
    timeStep,
    viscosity,
    smagorinsky,
    tau,
    minimum,
    velocity,
    latticeVelocity,
    latticeWind,
    latticeAcceleration,
    boundaries,
    boundaryMin,
    boundaryMax,
    solidMask: mask ? mask.slice() : new Uint8Array(count),
  };
}

/**
 * D3Q19 numerical constants and unit validation.
 * @private
 */
const SceneGISWindModel = {
  directions,
  weights,
  opposite,
  matrix,
  norms,
  rates,
  shear,
  configure,
  finiteVector,
  rigid,
};
export default SceneGISWindModel;
