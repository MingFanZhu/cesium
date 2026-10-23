/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
const EIGEN_EPSILON = 1e-12;
const MIN_VARIANCE = 1e-24;

export const ELLIPSOID_AREA_POWER = 1.6075;

export function ellipsoidArea(scale, offset = 0) {
  const x = Math.abs(scale[offset]);
  const y = Math.abs(scale[offset + 1]);
  const z = Math.abs(scale[offset + 2]);
  const p = ELLIPSOID_AREA_POWER;
  const numerator = (x * y) ** p + (x * z) ** p + (y * z) ** p;
  return 4 * Math.PI * (numerator / 3) ** (1 / p);
}

export function normalizeQuaternion(x, y, z, w) {
  const length = Math.hypot(x, y, z, w);
  if (!Number.isFinite(length) || length <= 1e-12) {
    return undefined;
  }
  const quaternion = [x / length, y / length, z / length, w / length];
  const signOrder = [3, 0, 1, 2];
  for (const component of signOrder) {
    if (Math.abs(quaternion[component]) > 1e-15) {
      if (quaternion[component] < 0) {
        for (let i = 0; i < 4; i++) {
          quaternion[i] = -quaternion[i];
        }
      }
      break;
    }
  }
  return quaternion;
}

export function covarianceFromScaleRotation(
  scale,
  scaleOffset,
  rotation,
  rotationOffset,
) {
  const x = rotation[rotationOffset];
  const y = rotation[rotationOffset + 1];
  const z = rotation[rotationOffset + 2];
  const w = rotation[rotationOffset + 3];
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  const matrix = [
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy),
  ];
  const sx2 = scale[scaleOffset] ** 2;
  const sy2 = scale[scaleOffset + 1] ** 2;
  const sz2 = scale[scaleOffset + 2] ** 2;
  return [
    matrix[0] ** 2 * sx2 + matrix[1] ** 2 * sy2 + matrix[2] ** 2 * sz2,
    matrix[3] ** 2 * sx2 + matrix[4] ** 2 * sy2 + matrix[5] ** 2 * sz2,
    matrix[6] ** 2 * sx2 + matrix[7] ** 2 * sy2 + matrix[8] ** 2 * sz2,
    matrix[0] * matrix[3] * sx2 +
      matrix[1] * matrix[4] * sy2 +
      matrix[2] * matrix[5] * sz2,
    matrix[0] * matrix[6] * sx2 +
      matrix[1] * matrix[7] * sy2 +
      matrix[2] * matrix[8] * sz2,
    matrix[3] * matrix[6] * sx2 +
      matrix[4] * matrix[7] * sy2 +
      matrix[5] * matrix[8] * sz2,
  ];
}

export function determinantSymmetric(covariance, offset = 0) {
  const xx = covariance[offset];
  const yy = covariance[offset + 1];
  const zz = covariance[offset + 2];
  const xy = covariance[offset + 3];
  const xz = covariance[offset + 4];
  const yz = covariance[offset + 5];
  return (
    xx * (yy * zz - yz * yz) -
    xy * (xy * zz - yz * xz) +
    xz * (xy * yz - yy * xz)
  );
}

export function inverseSymmetric(
  covariance,
  offset = 0,
  result = new Array(6),
) {
  const xx = covariance[offset];
  const yy = covariance[offset + 1];
  const zz = covariance[offset + 2];
  const xy = covariance[offset + 3];
  const xz = covariance[offset + 4];
  const yz = covariance[offset + 5];
  const determinant = determinantSymmetric(covariance, offset);
  const diagonal = Math.max(Math.abs(xx), Math.abs(yy), Math.abs(zz), 1e-30);
  if (
    !Number.isFinite(determinant) ||
    Math.abs(determinant) < 1e-12 * diagonal ** 3
  ) {
    return undefined;
  }
  const inverseDeterminant = 1 / determinant;
  result[0] = (yy * zz - yz * yz) * inverseDeterminant;
  result[1] = (xx * zz - xz * xz) * inverseDeterminant;
  result[2] = (xx * yy - xy * xy) * inverseDeterminant;
  result[3] = (xz * yz - xy * zz) * inverseDeterminant;
  result[4] = (xy * yz - xz * yy) * inverseDeterminant;
  result[5] = (xy * xz - xx * yz) * inverseDeterminant;
  return result;
}

export function frobeniusSymmetricDifference(a, aOffset, b, bOffset) {
  let diagonal = 0;
  let offDiagonal = 0;
  for (let i = 0; i < 3; i++) {
    const difference = a[aOffset + i] - b[bOffset + i];
    diagonal += difference * difference;
  }
  for (let i = 3; i < 6; i++) {
    const difference = a[aOffset + i] - b[bOffset + i];
    offDiagonal += difference * difference;
  }
  return Math.sqrt(diagonal + 2 * offDiagonal);
}

function quaternionFromRotationMatrix(matrix) {
  const trace = matrix[0] + matrix[4] + matrix[8];
  let x;
  let y;
  let z;
  let w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (matrix[7] - matrix[5]) / s;
    y = (matrix[2] - matrix[6]) / s;
    z = (matrix[3] - matrix[1]) / s;
  } else if (matrix[0] > matrix[4] && matrix[0] > matrix[8]) {
    const s = Math.sqrt(1 + matrix[0] - matrix[4] - matrix[8]) * 2;
    w = (matrix[7] - matrix[5]) / s;
    x = 0.25 * s;
    y = (matrix[1] + matrix[3]) / s;
    z = (matrix[2] + matrix[6]) / s;
  } else if (matrix[4] > matrix[8]) {
    const s = Math.sqrt(1 + matrix[4] - matrix[0] - matrix[8]) * 2;
    w = (matrix[2] - matrix[6]) / s;
    x = (matrix[1] + matrix[3]) / s;
    y = 0.25 * s;
    z = (matrix[5] + matrix[7]) / s;
  } else {
    const s = Math.sqrt(1 + matrix[8] - matrix[0] - matrix[4]) * 2;
    w = (matrix[3] - matrix[1]) / s;
    x = (matrix[2] + matrix[6]) / s;
    y = (matrix[5] + matrix[7]) / s;
    z = 0.25 * s;
  }
  return normalizeQuaternion(x, y, z, w);
}

export function decomposeCovariance(covariance, offset = 0) {
  const matrix = [
    covariance[offset],
    covariance[offset + 3],
    covariance[offset + 4],
    covariance[offset + 3],
    covariance[offset + 1],
    covariance[offset + 5],
    covariance[offset + 4],
    covariance[offset + 5],
    covariance[offset + 2],
  ];
  const vectors = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  for (let sweep = 0; sweep < 12; sweep++) {
    for (const [p, q] of pairs) {
      const apq = matrix[p * 3 + q];
      const scale = Math.max(
        1,
        Math.abs(matrix[p * 3 + p]),
        Math.abs(matrix[q * 3 + q]),
      );
      if (Math.abs(apq) <= EIGEN_EPSILON * scale) {
        continue;
      }
      const app = matrix[p * 3 + p];
      const aqq = matrix[q * 3 + q];
      const tau = (aqq - app) / (2 * apq);
      const tangent =
        tau >= 0
          ? 1 / (tau + Math.sqrt(1 + tau * tau))
          : -1 / (-tau + Math.sqrt(1 + tau * tau));
      const cosine = 1 / Math.sqrt(1 + tangent * tangent);
      const sine = tangent * cosine;
      for (let k = 0; k < 3; k++) {
        if (k === p || k === q) {
          continue;
        }
        const akp = matrix[k * 3 + p];
        const akq = matrix[k * 3 + q];
        const nextKp = cosine * akp - sine * akq;
        const nextKq = sine * akp + cosine * akq;
        matrix[k * 3 + p] = matrix[p * 3 + k] = nextKp;
        matrix[k * 3 + q] = matrix[q * 3 + k] = nextKq;
      }
      matrix[p * 3 + p] =
        cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
      matrix[q * 3 + q] =
        sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
      matrix[p * 3 + q] = matrix[q * 3 + p] = 0;
      for (let row = 0; row < 3; row++) {
        const vip = vectors[row * 3 + p];
        const viq = vectors[row * 3 + q];
        vectors[row * 3 + p] = cosine * vip - sine * viq;
        vectors[row * 3 + q] = sine * vip + cosine * viq;
      }
    }
  }
  const order = [0, 1, 2].sort((left, right) => {
    const difference = matrix[right * 3 + right] - matrix[left * 3 + left];
    return difference !== 0 ? difference : left - right;
  });
  const values = order.map((index) =>
    Math.max(matrix[index * 3 + index], MIN_VARIANCE),
  );
  const columns = order.map((index) => [
    vectors[index],
    vectors[3 + index],
    vectors[6 + index],
  ]);
  const cross = [
    columns[0][1] * columns[1][2] - columns[0][2] * columns[1][1],
    columns[0][2] * columns[1][0] - columns[0][0] * columns[1][2],
    columns[0][0] * columns[1][1] - columns[0][1] * columns[1][0],
  ];
  const handedness =
    cross[0] * columns[2][0] +
    cross[1] * columns[2][1] +
    cross[2] * columns[2][2];
  if (handedness < 0) {
    columns[2] = columns[2].map((value) => -value);
  }
  const rotationMatrix = [
    columns[0][0],
    columns[1][0],
    columns[2][0],
    columns[0][1],
    columns[1][1],
    columns[2][1],
    columns[0][2],
    columns[1][2],
    columns[2][2],
  ];
  const rotation = quaternionFromRotationMatrix(rotationMatrix);
  if (!rotation) {
    throw new Error("Covariance decomposition produced an invalid rotation");
  }
  return { scale: values.map(Math.sqrt), rotation };
}

export function bhattacharyyaDistance(set, first, second, scratch) {
  const firstOffset = first * 6;
  const secondOffset = second * 6;
  const average = scratch?.average ?? new Array(6);
  for (let i = 0; i < 6; i++) {
    average[i] =
      0.5 *
      (set.covariance[firstOffset + i] + set.covariance[secondOffset + i]);
  }
  average[0] += MIN_VARIANCE;
  average[1] += MIN_VARIANCE;
  average[2] += MIN_VARIANCE;
  const inverse = inverseSymmetric(average, 0, scratch?.inverse);
  if (!inverse) {
    return Number.POSITIVE_INFINITY;
  }
  const firstPosition = first * 3;
  const secondPosition = second * 3;
  const dx = set.position[secondPosition] - set.position[firstPosition];
  const dy = set.position[secondPosition + 1] - set.position[firstPosition + 1];
  const dz = set.position[secondPosition + 2] - set.position[firstPosition + 2];
  const quadratic =
    inverse[0] * dx * dx +
    inverse[1] * dy * dy +
    inverse[2] * dz * dz +
    2 * inverse[3] * dx * dy +
    2 * inverse[4] * dx * dz +
    2 * inverse[5] * dy * dz;
  const detAverage = Math.max(determinantSymmetric(average), MIN_VARIANCE ** 3);
  const detFirst = Math.max(
    determinantSymmetric(set.covariance, firstOffset),
    MIN_VARIANCE ** 3,
  );
  const detSecond = Math.max(
    determinantSymmetric(set.covariance, secondOffset),
    MIN_VARIANCE ** 3,
  );
  const distance =
    0.125 * quadratic +
    0.5 * Math.log(detAverage / Math.sqrt(detFirst * detSecond));
  return Number.isFinite(distance)
    ? Math.max(0, distance)
    : Number.POSITIVE_INFINITY;
}

export function stableHash32(value) {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export { MIN_VARIANCE };

/** @private */
const _SceneGISGaussianMath = {
  ELLIPSOID_AREA_POWER,
  ellipsoidArea,
  normalizeQuaternion,
  covarianceFromScaleRotation,
  determinantSymmetric,
  inverseSymmetric,
  frobeniusSymmetricDifference,
  decomposeCovariance,
  bhattacharyyaDistance,
  stableHash32,
};
export default _SceneGISGaussianMath;
