import DeveloperError from "../../../Core/DeveloperError.js";

function number(name, value, minimum, inclusive = true) {
  if (
    !Number.isFinite(value) ||
    (inclusive ? value < minimum : value <= minimum)
  ) {
    throw new DeveloperError(
      `${name} must be finite and ${inclusive ? ">=" : ">"} ${minimum}.`,
    );
  }
}

function vector(name, value) {
  if (
    !value ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new DeveloperError(`${name} must have finite Cartesian3 components.`);
  }
}

/** @private */
const SceneGISLightValidation = {
  common(light) {
    vector("position", light.position);
    const color = light.color;
    if (
      !color ||
      !Number.isFinite(color.red) ||
      !Number.isFinite(color.green) ||
      !Number.isFinite(color.blue) ||
      color.red < 0 ||
      color.green < 0 ||
      color.blue < 0
    ) {
      throw new DeveloperError(
        "color must have finite, nonnegative RGB components.",
      );
    }
    if (typeof light.show !== "boolean") {
      throw new DeveloperError("show must be a boolean.");
    }
    number("intensity", light.intensity, 0);
    number("range", light.range, 0, false);
  },
  point(light) {
    SceneGISLightValidation.common(light);
    number("radius", light.radius, 0, false);
  },
  rectangle(light) {
    SceneGISLightValidation.common(light);
    vector("direction", light.direction);
    vector("up", light.up);
    const d = light.direction;
    const u = light.up;
    if (
      Math.hypot(
        d.y * u.z - d.z * u.y,
        d.z * u.x - d.x * u.z,
        d.x * u.y - d.y * u.x,
      ) === 0
    ) {
      throw new DeveloperError(
        "direction and up must be nonzero and independent.",
      );
    }
    number("width", light.width, 0, false);
    number("height", light.height, 0, false);
    if (typeof light.twoSided !== "boolean") {
      throw new DeveloperError("twoSided must be a boolean.");
    }
  },
  spot(light) {
    vector("direction", light.direction);
    if (
      Math.hypot(light.direction.x, light.direction.y, light.direction.z) === 0
    ) {
      throw new DeveloperError("direction must be nonzero.");
    }
    number("innerConeAngle", light.innerConeAngle, 0);
    number("outerConeAngle", light.outerConeAngle, light.innerConeAngle, false);
    if (light.outerConeAngle > Math.PI / 2) {
      throw new DeveloperError("outerConeAngle must be <= PI / 2.");
    }
  },
};

export default SceneGISLightValidation;
