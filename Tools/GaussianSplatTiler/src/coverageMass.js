import { ellipsoidArea } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianMath.js";

const COVERAGE_EPSILON = Number.EPSILON;

export function createCoverageMass(data) {
  const result = new Float64Array(data.count);
  for (let index = 0; index < data.count; index++) {
    result[index] = Math.max(
      COVERAGE_EPSILON,
      data.opacity[index] * ellipsoidArea(data.scale, index * 3),
    );
  }
  return result;
}
