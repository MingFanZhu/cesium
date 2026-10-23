import {
  ELLIPSOID_AREA_POWER,
  bhattacharyyaDistance,
  covarianceFromScaleRotation,
  decomposeCovariance,
  ellipsoidArea,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianMath.js";
import {
  copyGaussian,
  createGaussianSet,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianColumns.js";

const EPSILON = Number.EPSILON;
const MAX_OPACITY = 0.999;
const COVERAGE_AREA_MARGIN = 1e-6;
const PAIRS = Object.freeze([
  [0, 0],
  [1, 1],
  [2, 2],
  [0, 1],
  [0, 2],
  [1, 2],
]);

function quaternionAxes(quaternion) {
  const [x, y, z, w] = quaternion;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    [1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy)],
    [2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx)],
    [2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)],
  ];
}

function canonicalizeNormal(normal) {
  let selected = 0;
  for (let component = 1; component < 3; component++) {
    if (Math.abs(normal[component]) > Math.abs(normal[selected])) {
      selected = component;
    }
  }
  if (normal[selected] < 0) {
    return normal.map((value) => -value);
  }
  return normal;
}

function covarianceAxis(covariance, largest) {
  const decomposition = decomposeCovariance(covariance);
  const axes = quaternionAxes(decomposition.rotation);
  return canonicalizeNormal(axes[largest ? 0 : 2]);
}

function tensorTrace(tensor, offset) {
  return tensor[offset] + tensor[offset + 1] + tensor[offset + 2];
}

function addOuter(target, offset, weight, vector) {
  for (let component = 0; component < 6; component++) {
    const [row, column] = PAIRS[component];
    target[offset + component] += weight * vector[row] * vector[column];
  }
}

function tangentProjection(covariance, normal) {
  const matrix = [
    covariance[0],
    covariance[3],
    covariance[4],
    covariance[3],
    covariance[1],
    covariance[5],
    covariance[4],
    covariance[5],
    covariance[2],
  ];
  const bn = [0, 0, 0];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      bn[row] += matrix[row * 3 + column] * normal[column];
    }
  }
  const nbn = normal[0] * bn[0] + normal[1] * bn[1] + normal[2] * bn[2];
  const projected = new Array(6);
  for (let component = 0; component < 6; component++) {
    const [row, column] = PAIRS[component];
    projected[component] =
      covariance[component] -
      normal[row] * bn[column] -
      bn[row] * normal[column] +
      normal[row] * normal[column] * nbn;
  }
  return projected;
}

function normalScaleAxis(rotation, normal) {
  const axes = quaternionAxes(rotation);
  let selected = 0;
  let alignment = Math.abs(
    axes[0][0] * normal[0] + axes[0][1] * normal[1] + axes[0][2] * normal[2],
  );
  for (let axis = 1; axis < 3; axis++) {
    const candidate = Math.abs(
      axes[axis][0] * normal[0] +
        axes[axis][1] * normal[1] +
        axes[axis][2] * normal[2],
    );
    if (candidate > alignment) {
      selected = axis;
      alignment = candidate;
    }
  }
  return selected;
}

function inflateTangentScaleForCoverage(scale, rotation, normal, minimumArea) {
  const originalArea = Math.max(EPSILON, ellipsoidArea(scale));
  if (originalArea >= minimumArea) {
    return { area: originalArea, inflationFactor: 1, scale };
  }

  const normalAxis = normalScaleAxis(rotation, normal);
  const firstTangentAxis = normalAxis === 0 ? 1 : 0;
  const secondTangentAxis = normalAxis === 2 ? 1 : 2;
  const tangentProduct = Math.abs(
    scale[firstTangentAxis] * scale[secondTangentAxis],
  );
  const firstNormalProduct = Math.abs(
    scale[firstTangentAxis] * scale[normalAxis],
  );
  const secondNormalProduct = Math.abs(
    scale[secondTangentAxis] * scale[normalAxis],
  );
  const tangentTerm = tangentProduct ** ELLIPSOID_AREA_POWER;
  const normalTerm =
    firstNormalProduct ** ELLIPSOID_AREA_POWER +
    secondNormalProduct ** ELLIPSOID_AREA_POWER;
  const termSum = tangentTerm + normalTerm;
  const areaRatioPower = (minimumArea / originalArea) ** ELLIPSOID_AREA_POWER;
  let inflationFactor;
  if (
    Number.isFinite(termSum) &&
    termSum > 0 &&
    Number.isFinite(areaRatioPower)
  ) {
    const tangentWeight = tangentTerm / termSum;
    const normalWeight = 1 - tangentWeight;
    // With u = inflationFactor ** p, the ellipsoid-area equation becomes
    // tangentWeight * u ** 2 + normalWeight * u = areaRatio ** p.
    const scaledFactorPower =
      (2 * areaRatioPower) /
      (normalWeight +
        Math.sqrt(
          normalWeight * normalWeight + 4 * tangentWeight * areaRatioPower,
        ));
    inflationFactor = scaledFactorPower ** (1 / ELLIPSOID_AREA_POWER);
  }
  if (!Number.isFinite(inflationFactor) || inflationFactor < 1) {
    inflationFactor = minimumArea / originalArea;
  }

  const inflatedScale = [...scale];
  inflatedScale[firstTangentAxis] *= inflationFactor;
  inflatedScale[secondTangentAxis] *= inflationFactor;
  let area = ellipsoidArea(inflatedScale);
  if (area < minimumArea) {
    const correction = minimumArea / Math.max(area, EPSILON);
    inflatedScale[firstTangentAxis] *= correction;
    inflatedScale[secondTangentAxis] *= correction;
    inflationFactor *= correction;
    area = ellipsoidArea(inflatedScale);
  }
  return { area, inflationFactor, scale: inflatedScale };
}

function finiteSummary(store, slot) {
  const ranges = [
    store.relativePositionSum.subarray(slot * 3, slot * 3 + 3),
    store.relativePositionOuterSum.subarray(slot * 6, slot * 6 + 6),
    store.intrinsicCovarianceSum.subarray(slot * 6, slot * 6 + 6),
    store.normalTensor.subarray(slot * 6, slot * 6 + 6),
    store.colorSum.subarray(slot * 3, slot * 3 + 3),
    store.shSum.subarray(slot * store.shCount, (slot + 1) * store.shCount),
  ];
  return (
    Number.isFinite(store.mass[slot]) &&
    store.mass[slot] > 0 &&
    ranges.every((values) => values.every(Number.isFinite))
  );
}

export function createL0SummaryStore(
  source,
  coverageMass,
  positionAnchor = [0, 0, 0],
) {
  if (positionAnchor.length !== 3 || !positionAnchor.every(Number.isFinite)) {
    throw new Error(
      "Proxy v2 Chunk position anchor must contain 3 finite values",
    );
  }
  const count = source.count;
  const store = {
    count,
    shCount: source.shCount,
    mass: new Float64Array(count),
    sourceCount: new Uint32Array(count),
    minimumStableId: new Uint32Array(count),
    clusterId: new Float64Array(count),
    positionAnchor: Object.freeze([...positionAnchor]),
    relativePositionSum: new Float64Array(count * 3),
    relativePositionOuterSum: new Float64Array(count * 6),
    intrinsicCovarianceSum: new Float64Array(count * 6),
    normalTensor: new Float64Array(count * 6),
    colorSum: new Float64Array(count * 3),
    shSum: new Float64Array(count * source.shCount),
    proxy: createGaussianSet(count, source.shCount),
    opacityClampCount: 0,
    coverageMassClampDelta: 0,
    coverageInflationCount: 0,
    maximumCoverageInflationFactor: 1,
  };
  let totalMass = 0;
  for (let index = 0; index < count; index++) {
    const mass = coverageMass[index];
    if (!Number.isFinite(mass) || mass <= 0) {
      throw new Error(`Invalid L0 coverage mass at ${index}`);
    }
    totalMass += mass;
    store.mass[index] = mass;
    store.sourceCount[index] = source.sourceCount[index];
    store.minimumStableId[index] = source.stableId[index];
    const offset3 = index * 3;
    const offset6 = index * 6;
    const position = [...source.position.subarray(offset3, offset3 + 3)];
    const relativePosition = position.map(
      (value, component) => value - store.positionAnchor[component],
    );
    for (let component = 0; component < 3; component++) {
      store.relativePositionSum[offset3 + component] =
        mass * relativePosition[component];
      store.colorSum[offset3 + component] =
        mass * source.color[offset3 + component];
    }
    addOuter(store.relativePositionOuterSum, offset6, mass, relativePosition);
    for (let component = 0; component < 6; component++) {
      store.intrinsicCovarianceSum[offset6 + component] =
        mass * source.covariance[offset6 + component];
    }
    const sourceDecomposition = decomposeCovariance(source.covariance, offset6);
    const normal = quaternionAxes(sourceDecomposition.rotation)[2];
    const lambdaMinimum = sourceDecomposition.scale[2] ** 2;
    const lambdaMiddle = sourceDecomposition.scale[1] ** 2;
    const confidence = Math.max(
      0,
      Math.min(
        1,
        (lambdaMiddle - lambdaMinimum) / Math.max(lambdaMiddle, EPSILON),
      ),
    );
    addOuter(store.normalTensor, offset6, mass * confidence, normal);
    for (let coefficient = 0; coefficient < source.shCount; coefficient++) {
      store.shSum[index * source.shCount + coefficient] =
        mass * source.sh[index * source.shCount + coefficient];
    }
    copyGaussian(source, index, store.proxy, index);
  }
  const canonicalSlots = Array.from({ length: count }, (_, slot) => slot).sort(
    (left, right) =>
      store.minimumStableId[left] - store.minimumStableId[right] ||
      left - right,
  );
  for (let rank = 0; rank < canonicalSlots.length; rank++) {
    store.clusterId[canonicalSlots[rank]] = rank + 1;
  }
  store.meanLeafCoverageMass = totalMass / count;
  return store;
}

export function combineSummarySlots(store, owner, retired) {
  for (const [field, stride] of [
    ["relativePositionSum", 3],
    ["relativePositionOuterSum", 6],
    ["intrinsicCovarianceSum", 6],
    ["normalTensor", 6],
    ["colorSum", 3],
    ["shSum", store.shCount],
  ]) {
    const values = store[field];
    for (let component = 0; component < stride; component++) {
      values[owner * stride + component] +=
        values[retired * stride + component];
    }
  }
  store.mass[owner] += store.mass[retired];
  const sourceCount = store.sourceCount[owner] + store.sourceCount[retired];
  if (!Number.isSafeInteger(sourceCount) || sourceCount > 0xffffffff) {
    throw new Error("Proxy v2 sourceCount exceeds uint32");
  }
  store.sourceCount[owner] = sourceCount;
  store.minimumStableId[owner] = Math.min(
    store.minimumStableId[owner],
    store.minimumStableId[retired],
  );
  if (!finiteSummary(store, owner)) {
    throw new Error("Proxy v2 combined summary is non-finite");
  }
}

export function fitSummarySlot(store, slot) {
  const mass = store.mass[slot];
  const offset3 = slot * 3;
  const offset4 = slot * 4;
  const offset6 = slot * 6;
  const relativeMean = [
    store.relativePositionSum[offset3] / mass,
    store.relativePositionSum[offset3 + 1] / mass,
    store.relativePositionSum[offset3 + 2] / mass,
  ];
  const mean = relativeMean.map(
    (value, component) => value + store.positionAnchor[component],
  );
  const intrinsic = new Array(6);
  const between = new Array(6);
  for (let component = 0; component < 6; component++) {
    const [row, column] = PAIRS[component];
    intrinsic[component] =
      store.intrinsicCovarianceSum[offset6 + component] / mass;
    between[component] =
      store.relativePositionOuterSum[offset6 + component] / mass -
      relativeMean[row] * relativeMean[column];
  }
  const normal =
    tensorTrace(store.normalTensor, offset6) > EPSILON
      ? covarianceAxis(
          [...store.normalTensor.subarray(offset6, offset6 + 6)],
          true,
        )
      : covarianceAxis(intrinsic, false);
  const tangent = tangentProjection(between, normal);
  const fittedCovariance = intrinsic.map(
    (value, index) => value + tangent[index],
  );
  const decomposition = decomposeCovariance(fittedCovariance);
  const coverageFit = inflateTangentScaleForCoverage(
    decomposition.scale,
    decomposition.rotation,
    normal,
    (mass / MAX_OPACITY) * (1 + COVERAGE_AREA_MARGIN),
  );
  const covariance =
    coverageFit.inflationFactor > 1
      ? covarianceFromScaleRotation(
          coverageFit.scale,
          0,
          decomposition.rotation,
          0,
        )
      : fittedCovariance;
  store.proxy.position.set(mean, offset3);
  store.proxy.covariance.set(covariance, offset6);
  store.proxy.scale.set(coverageFit.scale, offset3);
  store.proxy.rotation.set(decomposition.rotation, offset4);
  for (let component = 0; component < 3; component++) {
    store.proxy.color[offset3 + component] =
      store.colorSum[offset3 + component] / mass;
  }
  for (let coefficient = 0; coefficient < store.shCount; coefficient++) {
    store.proxy.sh[slot * store.shCount + coefficient] =
      store.shSum[slot * store.shCount + coefficient] / mass;
  }
  const area = Math.max(EPSILON, coverageFit.area);
  const rawOpacity = mass / area;
  const opacity = Math.max(EPSILON, Math.min(MAX_OPACITY, rawOpacity));
  store.proxy.opacity[slot] = opacity;
  store.proxy.sourceCount[slot] = store.sourceCount[slot];
  store.proxy.stableId[slot] = store.minimumStableId[slot];
  if (coverageFit.inflationFactor > 1) {
    store.coverageInflationCount++;
    store.maximumCoverageInflationFactor = Math.max(
      store.maximumCoverageInflationFactor,
      coverageFit.inflationFactor,
    );
  }
  if (opacity !== rawOpacity) {
    store.opacityClampCount++;
    store.coverageMassClampDelta += opacity * area - mass;
  }
  return {
    normal,
    covariance,
    coverageInflationFactor: coverageFit.inflationFactor,
  };
}

export function marginalMergeDistortion(store, first, second, scratch) {
  const m1 = store.mass[first];
  const m2 = store.mass[second];
  const normalizedSupport =
    (m1 * m2) /
    Math.max(m1 + m2, EPSILON) /
    Math.max(store.meanLeafCoverageMass, EPSILON);
  let m0 = bhattacharyyaDistance(store.proxy, first, second, scratch);
  for (let component = 0; component < 3; component++) {
    const difference =
      store.proxy.color[first * 3 + component] -
      store.proxy.color[second * 3 + component];
    m0 += difference * difference;
  }
  if (store.shCount > 0) {
    let sh = 0;
    for (let coefficient = 0; coefficient < store.shCount; coefficient++) {
      const difference =
        store.proxy.sh[first * store.shCount + coefficient] -
        store.proxy.sh[second * store.shCount + coefficient];
      sh += difference * difference;
    }
    m0 += sh / store.shCount;
  }
  const opacity = store.proxy.opacity[first] - store.proxy.opacity[second];
  m0 += opacity * opacity;
  const result = normalizedSupport * m0;
  return Number.isFinite(result) ? result : Number.POSITIVE_INFINITY;
}

export function materializeSummarySlots(store, slots) {
  const sorted = [...slots].sort(
    (left, right) =>
      store.minimumStableId[left] - store.minimumStableId[right] ||
      store.clusterId[left] - store.clusterId[right],
  );
  const result = createGaussianSet(sorted.length, store.shCount);
  const mass = new Float64Array(sorted.length);
  const clusterIds = new Float64Array(sorted.length);
  let opacityClampCount = 0;
  let coverageMassClampDelta = 0;
  for (let index = 0; index < sorted.length; index++) {
    const slot = sorted[index];
    copyGaussian(store.proxy, slot, result, index);
    mass[index] = store.mass[slot];
    clusterIds[index] = store.clusterId[slot];
    const area = ellipsoidArea(result.scale, index * 3);
    const rawOpacity = mass[index] / Math.max(area, EPSILON);
    if (rawOpacity > MAX_OPACITY) {
      opacityClampCount++;
      coverageMassClampDelta += result.opacity[index] * area - mass[index];
    }
  }
  return {
    data: result,
    coverageMass: mass,
    clusterIds,
    slots: sorted,
    diagnostics: { opacityClampCount, coverageMassClampDelta },
  };
}
