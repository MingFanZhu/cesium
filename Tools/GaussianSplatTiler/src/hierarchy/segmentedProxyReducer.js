import { createGaussianSet } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianColumns.js";
import {
  covarianceFromScaleRotation,
  decomposeCovariance,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianMath.js";

import { buildProxyV2Hierarchy } from "../proxy-v2/hierarchy.js";
import {
  createVisualErrorHistogram,
  dyadicVisualErrorUpperBound,
} from "./visualErrorHistogram.js";

export const SEGMENTED_PROXY_POLICY_ID =
  "fixed10-direct-child-proxy-v2-half-rate-min-one-v1";
export const PROXY_SEED_LAYOUT_ID = "fixed10-relative-f32-core-f64-fit-seed-v1";

const INVALID_INDEX = 0xffffffff;
const INTERNAL_LEVEL = 0xffffffff;
const MAXIMUM_ARTIFACT_ID = 0xfffffffe;
const MAXIMUM_UINT32 = 0xffffffff;
const MAXIMUM_UINT64 = (1n << 64n) - 1n;
const FLOAT32_EPSILON = 2 ** -23;
const QUATERNION_NORM_TOLERANCE = 16 * FLOAT32_EPSILON;
const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const SEED_ARRAY_LAYOUT = Object.freeze([
  ["position", Float32Array, 3],
  ["scale", Float32Array, 3],
  ["rotation", Float32Array, 4],
  ["opacity", Float32Array, 1],
  ["color", Float32Array, 3],
  ["errorPosition", Float64Array, 1],
  ["errorCovariance", Float64Array, 1],
  ["errorColor", Float64Array, 1],
  ["errorSh", Float64Array, 1],
  ["coverageMass", Float64Array, 1],
]);

function isCheckedUint32(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAXIMUM_UINT32;
}

function requireCheckedUint32(value, label, minimum = 0) {
  if (!isCheckedUint32(value) || value < minimum) {
    throw new RangeError(`${label} must be a checked Uint32 >= ${minimum}`);
  }
  return value;
}

function requireArtifactId(value, label) {
  requireCheckedUint32(value, label);
  if (value > MAXIMUM_ARTIFACT_ID) {
    throw new RangeError(`${label} must not use the invalid sentinel`);
  }
  return value;
}

function requireUint64(value, label) {
  if (typeof value !== "bigint" || value < 1n || value > MAXIMUM_UINT64) {
    throw new RangeError(`${label} must be a checked positive Uint64 BigInt`);
  }
  return value;
}

function checkedUint64Add(left, right, label) {
  const result = left + right;
  if (result > MAXIMUM_UINT64) {
    throw new RangeError(`${label} exceeds Uint64`);
  }
  return result;
}

function checkedUint32Add(left, right, label) {
  const result = left + right;
  if (!isCheckedUint32(result)) {
    throw new RangeError(`${label} exceeds Uint32`);
  }
  return result;
}

function checkedArrayLength(count, stride, label) {
  const length = count * stride;
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError(`${label} length exceeds the safe integer range`);
  }
  return length;
}

function copyOrigin(origin, label) {
  if (origin?.length !== 3) {
    throw new TypeError(`${label} must contain exactly 3 values`);
  }
  const result = new Float64Array(3);
  for (let component = 0; component < 3; component++) {
    const value = origin[component];
    if (!Number.isFinite(value)) {
      throw new RangeError(`${label}[${component}] must be finite`);
    }
    result[component] = value;
  }
  return result;
}

function originsEqual(left, right) {
  return (
    left.length === 3 &&
    right.length === 3 &&
    Object.is(left[0], right[0]) &&
    Object.is(left[1], right[1]) &&
    Object.is(left[2], right[2])
  );
}

function requireFiniteArray(array, label, predicate) {
  for (let index = 0; index < array.length; index++) {
    const value = array[index];
    if (!Number.isFinite(value) || (predicate && !predicate(value))) {
      throw new RangeError(`${label}[${index}] is outside its finite domain`);
    }
  }
}

function validateCanonicalQuaternion(rotation, offset, label) {
  let normSquared = 0;
  for (let component = 0; component < 4; component++) {
    const value = rotation[offset + component];
    normSquared += value * value;
  }
  if (Math.abs(normSquared - 1) > QUATERNION_NORM_TOLERANCE) {
    throw new RangeError(`${label} is not a unit Float32 quaternion`);
  }
  for (const component of [3, 0, 1, 2]) {
    const value = rotation[offset + component];
    if (Math.abs(value) > 1e-15) {
      if (value < 0) {
        throw new RangeError(`${label} does not use the canonical sign`);
      }
      return;
    }
  }
  throw new RangeError(`${label} is degenerate`);
}

function validateSeed(seed, label) {
  if (!seed || typeof seed !== "object") {
    throw new TypeError(`${label} must be a ProxySeedBlock record`);
  }
  const count = requireCheckedUint32(seed.count, `${label}.count`, 1);
  const shCount = requireCheckedUint32(seed.shCount, `${label}.shCount`);
  copyOrigin(seed.origin, `${label}.origin`);
  for (const [field, ArrayType, stride] of SEED_ARRAY_LAYOUT) {
    const value = seed[field];
    if (!(value instanceof ArrayType)) {
      throw new TypeError(`${label}.${field} must be a ${ArrayType.name}`);
    }
    const expectedLength = checkedArrayLength(
      count,
      stride,
      `${label}.${field}`,
    );
    if (value.length !== expectedLength) {
      throw new RangeError(
        `${label}.${field} length must be exactly ${expectedLength}`,
      );
    }
  }
  if (!(seed.sh instanceof Float32Array)) {
    throw new TypeError(`${label}.sh must be a Float32Array`);
  }
  const expectedShLength = checkedArrayLength(count, shCount, `${label}.sh`);
  if (seed.sh.length !== expectedShLength) {
    throw new RangeError(
      `${label}.sh length must be exactly ${expectedShLength}`,
    );
  }

  requireFiniteArray(seed.position, `${label}.position`);
  requireFiniteArray(seed.scale, `${label}.scale`, (value) => value >= 0);
  requireFiniteArray(seed.rotation, `${label}.rotation`);
  requireFiniteArray(seed.opacity, `${label}.opacity`);
  requireFiniteArray(seed.color, `${label}.color`);
  requireFiniteArray(seed.sh, `${label}.sh`);
  for (const field of [
    "errorPosition",
    "errorCovariance",
    "errorColor",
    "errorSh",
  ]) {
    requireFiniteArray(seed[field], `${label}.${field}`, (value) => value >= 0);
  }
  requireFiniteArray(
    seed.coverageMass,
    `${label}.coverageMass`,
    (value) => value > 0,
  );
  for (let index = 0; index < count; index++) {
    validateCanonicalQuaternion(
      seed.rotation,
      index * 4,
      `${label}.rotation[${index}]`,
    );
  }
  requireUint64(seed.representedSourceCount, `${label}.representedSourceCount`);
  return seed;
}

function validateRepresentation(representation, label) {
  if (!representation || typeof representation !== "object") {
    throw new TypeError(`${label} must be a RepresentationPlan record`);
  }
  requireArtifactId(
    representation.representationId,
    `${label}.representationId`,
  );
  requireArtifactId(representation.ownerNodeIndex, `${label}.ownerNodeIndex`);
  const seed = validateSeed(representation.seed, `${label}.seed`);
  requireCheckedUint32(representation.splatCount, `${label}.splatCount`, 1);
  if (representation.splatCount !== seed.count) {
    throw new RangeError(`${label}.splatCount must equal seed.count`);
  }
  const origin = copyOrigin(representation.origin, `${label}.origin`);
  if (!originsEqual(origin, seed.origin)) {
    throw new RangeError(`${label}.origin must exactly equal seed.origin`);
  }
  requireUint64(
    representation.representedSourceCount,
    `${label}.representedSourceCount`,
  );
  if (representation.representedSourceCount !== seed.representedSourceCount) {
    throw new RangeError(
      `${label}.representedSourceCount must equal the seed scalar`,
    );
  }
  if (
    !Number.isFinite(representation.geometricError) ||
    representation.geometricError < 0
  ) {
    throw new RangeError(
      `${label}.geometricError must be finite and non-negative`,
    );
  }
  if (representation.mode === "CONSTANT_LEAF") {
    requireCheckedUint32(representation.logicalLevel, `${label}.logicalLevel`);
    if (representation.logicalLevel > 6) {
      throw new RangeError(`${label}.logicalLevel must be in [0, 6]`);
    }
    if (
      representation.firstSegment !== INVALID_INDEX ||
      representation.segmentCount !== 0
    ) {
      throw new RangeError(`${label} leaf Segment authority is invalid`);
    }
  } else if (representation.mode === "INTERNAL_SEGMENTED") {
    if (representation.logicalLevel !== INTERNAL_LEVEL) {
      throw new RangeError(`${label} internal logicalLevel is invalid`);
    }
    requireArtifactId(representation.firstSegment, `${label}.firstSegment`);
    requireCheckedUint32(
      representation.segmentCount,
      `${label}.segmentCount`,
      1,
    );
  } else {
    throw new RangeError(`${label}.mode is invalid`);
  }
  return representation;
}

function allocateSeed(count, shCount, origin, representedSourceCount) {
  return Object.freeze({
    count,
    shCount,
    origin: copyOrigin(origin, "seed.origin"),
    position: new Float32Array(checkedArrayLength(count, 3, "position")),
    scale: new Float32Array(checkedArrayLength(count, 3, "scale")),
    rotation: new Float32Array(checkedArrayLength(count, 4, "rotation")),
    opacity: new Float32Array(count),
    color: new Float32Array(checkedArrayLength(count, 3, "color")),
    sh: new Float32Array(checkedArrayLength(count, shCount, "sh")),
    errorPosition: new Float64Array(count),
    errorCovariance: new Float64Array(count),
    errorColor: new Float64Array(count),
    errorSh: new Float64Array(count),
    coverageMass: new Float64Array(count),
    representedSourceCount,
  });
}

function expandSeed(seed, targetOrigin, label) {
  validateSeed(seed, label);
  const origin = copyOrigin(targetOrigin, `${label}.targetOrigin`);
  const anchor = new Float64Array(3);
  for (let component = 0; component < 3; component++) {
    anchor[component] = seed.origin[component] - origin[component];
    if (!Number.isFinite(anchor[component])) {
      throw new RangeError(`${label} origin subtraction is non-finite`);
    }
  }
  const result = createGaussianSet(seed.count, seed.shCount);
  for (let index = 0; index < seed.count; index++) {
    const offset3 = index * 3;
    const offset4 = index * 4;
    const offset6 = index * 6;
    for (let component = 0; component < 3; component++) {
      const position = anchor[component] + seed.position[offset3 + component];
      if (!Number.isFinite(position)) {
        throw new RangeError(`${label} rebased position is non-finite`);
      }
      result.position[offset3 + component] = position;
      result.scale[offset3 + component] = seed.scale[offset3 + component];
      result.color[offset3 + component] = seed.color[offset3 + component];
    }
    result.rotation.set(seed.rotation.subarray(offset4, offset4 + 4), offset4);
    result.opacity[index] = seed.opacity[index];
    const covariance = covarianceFromScaleRotation(
      seed.scale,
      offset3,
      seed.rotation,
      offset4,
    );
    if (!covariance.every(Number.isFinite)) {
      throw new RangeError(`${label} reconstructed covariance is non-finite`);
    }
    result.covariance.set(covariance, offset6);
    result.errorPosition[index] = seed.errorPosition[index];
    result.errorCovariance[index] = seed.errorCovariance[index];
    result.errorColor[index] = seed.errorColor[index];
    result.errorSh[index] = seed.errorSh[index];
    result.sh.set(
      seed.sh.subarray(index * seed.shCount, (index + 1) * seed.shCount),
      index * seed.shCount,
    );
    result.stableId[index] = index;
    result.sourceCount[index] = 1;
  }
  return { data: result, coverageMass: seed.coverageMass, anchor };
}

function storeFloat32(array, index, value, label) {
  array[index] = value;
  if (!Number.isFinite(array[index])) {
    throw new RangeError(`${label} cannot be represented as finite Float32`);
  }
  return array[index];
}

function checkedError(base, difference, label) {
  const value = base + difference;
  if (!Number.isFinite(value) || value < base) {
    throw new RangeError(`${label} overflowed its conservative envelope`);
  }
  return value;
}

function compactIntoSeed(source, coverageMass, target, targetStart, label) {
  if (coverageMass.length !== source.count) {
    throw new RangeError(`${label}.coverageMass length mismatch`);
  }
  if (source.shCount !== target.shCount) {
    throw new RangeError(`${label}.shCount mismatch`);
  }
  if (targetStart + source.count > target.count) {
    throw new RangeError(`${label} exceeds the parent seed range`);
  }
  for (let index = 0; index < source.count; index++) {
    const targetIndex = targetStart + index;
    const sourceOffset3 = index * 3;
    const sourceOffset6 = index * 6;
    const targetOffset3 = targetIndex * 3;
    const targetOffset4 = targetIndex * 4;
    let positionDifference = 0;
    let colorDifference = 0;
    let shDifference = 0;
    for (let component = 0; component < 3; component++) {
      const position = source.position[sourceOffset3 + component];
      const storedPosition = storeFloat32(
        target.position,
        targetOffset3 + component,
        position,
        `${label}.position`,
      );
      positionDifference = Math.max(
        positionDifference,
        Math.abs(storedPosition - position),
      );
      const color = source.color[sourceOffset3 + component];
      const storedColor = storeFloat32(
        target.color,
        targetOffset3 + component,
        color,
        `${label}.color`,
      );
      colorDifference = Math.max(
        colorDifference,
        Math.abs(storedColor - color),
      );
    }
    const covariance = source.covariance.subarray(
      sourceOffset6,
      sourceOffset6 + 6,
    );
    requireFiniteArray(covariance, `${label}.covariance`);
    const decomposition = decomposeCovariance(covariance);
    for (let component = 0; component < 3; component++) {
      storeFloat32(
        target.scale,
        targetOffset3 + component,
        decomposition.scale[component],
        `${label}.scale`,
      );
    }
    for (let component = 0; component < 4; component++) {
      storeFloat32(
        target.rotation,
        targetOffset4 + component,
        decomposition.rotation[component],
        `${label}.rotation`,
      );
    }
    validateCanonicalQuaternion(
      target.rotation,
      targetOffset4,
      `${label}.rotation[${targetIndex}]`,
    );
    const reconstructedCovariance = covarianceFromScaleRotation(
      target.scale,
      targetOffset3,
      target.rotation,
      targetOffset4,
    );
    let covarianceDifference = 0;
    for (let component = 0; component < 6; component++) {
      if (!Number.isFinite(reconstructedCovariance[component])) {
        throw new RangeError(`${label}.covariance round-trip is non-finite`);
      }
      covarianceDifference = Math.max(
        covarianceDifference,
        Math.abs(reconstructedCovariance[component] - covariance[component]),
      );
    }
    storeFloat32(
      target.opacity,
      targetIndex,
      source.opacity[index],
      `${label}.opacity`,
    );
    for (let coefficient = 0; coefficient < source.shCount; coefficient++) {
      const sourceShIndex = index * source.shCount + coefficient;
      const targetShIndex = targetIndex * target.shCount + coefficient;
      const value = source.sh[sourceShIndex];
      const storedValue = storeFloat32(
        target.sh,
        targetShIndex,
        value,
        `${label}.sh`,
      );
      shDifference = Math.max(shDifference, Math.abs(storedValue - value));
    }
    const mass = coverageMass[index];
    if (!Number.isFinite(mass) || mass <= 0) {
      throw new RangeError(`${label}.coverageMass[${index}] is invalid`);
    }
    target.coverageMass[targetIndex] = mass;
    target.errorPosition[targetIndex] = checkedError(
      source.errorPosition[index],
      positionDifference,
      `${label}.errorPosition`,
    );
    target.errorCovariance[targetIndex] = checkedError(
      source.errorCovariance[index],
      covarianceDifference,
      `${label}.errorCovariance`,
    );
    target.errorColor[targetIndex] = checkedError(
      source.errorColor[index],
      colorDifference,
      `${label}.errorColor`,
    );
    target.errorSh[targetIndex] = checkedError(
      source.errorSh[index],
      shDifference,
      `${label}.errorSh`,
    );
  }
}

function deterministicSum(values, label) {
  let total = 0;
  for (let index = 0; index < values.length; index++) {
    total += values[index];
    if (!Number.isFinite(total)) {
      throw new RangeError(`${label} sum is non-finite`);
    }
  }
  return total;
}

function massTolerance(inputCount, inputMassSum) {
  return (
    64 *
    Number.EPSILON *
    Math.max(1, inputCount) *
    Math.max(1, Math.abs(inputMassSum))
  );
}

function geometricErrorFromRange(seed, start = 0, count = seed.count) {
  let maximumPosition = 0;
  let maximumCovariance = 0;
  for (let index = start; index < start + count; index++) {
    maximumPosition = Math.max(maximumPosition, seed.errorPosition[index]);
    maximumCovariance = Math.max(
      maximumCovariance,
      seed.errorCovariance[index],
    );
  }
  const error =
    Math.sqrt(3) * maximumPosition + 2 * Math.sqrt(3 * maximumCovariance);
  if (!Number.isFinite(error) || error < 0) {
    throw new RangeError("derived geometric error is non-finite");
  }
  return error;
}

function visualErrorFromRange(
  seed,
  ownerBounds,
  conservativeMaximum,
  start = 0,
  count = seed.count,
  ownerErrorUpperBound,
) {
  const histogram = createVisualErrorHistogram({
    errorPosition: seed.errorPosition.subarray(start, start + count),
    errorCovariance: seed.errorCovariance.subarray(start, start + count),
    coverageMass: seed.coverageMass.subarray(start, start + count),
    ownerBounds,
    ownerErrorUpperBound,
  });
  return Object.freeze({
    coverageWeightedP95Error: Math.min(histogram.p95, conservativeMaximum),
    coverageWeightedP99Error: Math.min(histogram.p99, conservativeMaximum),
  });
}

function freezeRepresentation(record) {
  return Object.freeze(record);
}

export function planHalfRateSegmentCount(childCount) {
  requireCheckedUint32(childCount, "childCount", 1);
  return Math.max(1, Math.floor(childCount / 2));
}

export function composeConstantLeafRepresentation({
  representationId,
  ownerNodeIndex,
  logicalLevel,
  origin,
  parts,
}) {
  requireArtifactId(representationId, "representationId");
  requireArtifactId(ownerNodeIndex, "ownerNodeIndex");
  requireCheckedUint32(logicalLevel, "logicalLevel");
  if (logicalLevel > 6) {
    throw new RangeError("logicalLevel must be in [0, 6]");
  }
  const outputOrigin = copyOrigin(origin, "origin");
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new RangeError("parts must contain at least one canonical part");
  }

  let count = 0;
  let representedSourceCount = 0n;
  let shCount;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!part || part.partIndex !== index) {
      throw new RangeError(
        "parts must use contiguous canonical partIndex order",
      );
    }
    const seed = validateSeed(part.seed, `parts[${index}].seed`);
    shCount ??= seed.shCount;
    if (seed.shCount !== shCount) {
      throw new RangeError("all part seeds must have the same shCount");
    }
    count = checkedUint32Add(count, seed.count, "leaf seed count");
    representedSourceCount = checkedUint64Add(
      representedSourceCount,
      seed.representedSourceCount,
      "leaf represented source count",
    );
  }

  const seed = allocateSeed(
    count,
    shCount,
    outputOrigin,
    representedSourceCount,
  );
  let cursor = 0;
  for (let index = 0; index < parts.length; index++) {
    const expanded = expandSeed(
      parts[index].seed,
      outputOrigin,
      `parts[${index}].seed`,
    );
    compactIntoSeed(
      expanded.data,
      expanded.coverageMass,
      seed,
      cursor,
      `parts[${index}]`,
    );
    cursor += expanded.data.count;
  }
  if (cursor !== seed.count) {
    throw new Error("leaf composition did not fill its exact seed range");
  }

  return freezeRepresentation({
    representationId,
    ownerNodeIndex,
    mode: "CONSTANT_LEAF",
    logicalLevel,
    origin: seed.origin,
    firstSegment: INVALID_INDEX,
    segmentCount: 0,
    splatCount: seed.count,
    representedSourceCount,
    geometricError: geometricErrorFromRange(seed),
    seed,
  });
}

function emptyMergeLog() {
  return Object.freeze({
    recordCount: 0,
    byteLength: 0,
    sha256: EMPTY_SHA256,
  });
}

export async function reduceDirectChildRepresentation({
  representationId,
  ownerNodeIndex,
  firstSegmentId,
  parentOrigin,
  expectedChildNodeIndices,
  childRepresentations,
  ownerBounds,
  visualErrorDomain = "owner-cell",
}) {
  if (
    !["owner-cell", "owner-envelope", "dyadic-owner-envelope"].includes(
      visualErrorDomain,
    )
  ) {
    throw new RangeError("Unknown visual error domain");
  }
  requireArtifactId(representationId, "representationId");
  requireArtifactId(ownerNodeIndex, "ownerNodeIndex");
  requireArtifactId(firstSegmentId, "firstSegmentId");
  const outputOrigin = copyOrigin(parentOrigin, "parentOrigin");
  if (
    !Array.isArray(expectedChildNodeIndices) ||
    expectedChildNodeIndices.length < 2 ||
    expectedChildNodeIndices.length > 8
  ) {
    throw new RangeError(
      "expectedChildNodeIndices cardinality must be in [2, 8]",
    );
  }
  if (
    !Array.isArray(childRepresentations) ||
    childRepresentations.length !== expectedChildNodeIndices.length
  ) {
    throw new RangeError(
      "childRepresentations must match direct-child cardinality",
    );
  }
  const childCount = expectedChildNodeIndices.length;
  const lastSegmentId = firstSegmentId + childCount - 1;
  if (
    !Number.isSafeInteger(lastSegmentId) ||
    lastSegmentId > MAXIMUM_ARTIFACT_ID
  ) {
    throw new RangeError("Segment ID range exceeds artifact-local capacity");
  }

  let parentCount = 0;
  let representedSourceCount = 0n;
  let shCount;
  const targets = new Uint32Array(childCount);
  for (let ordinal = 0; ordinal < childCount; ordinal++) {
    const childNodeIndex = expectedChildNodeIndices[ordinal];
    requireArtifactId(childNodeIndex, `expectedChildNodeIndices[${ordinal}]`);
    if (
      ordinal > 0 &&
      childNodeIndex !== expectedChildNodeIndices[ordinal - 1] + 1
    ) {
      throw new RangeError(
        "direct-child Node indices must be canonical contiguous IDs",
      );
    }
    const child = validateRepresentation(
      childRepresentations[ordinal],
      `childRepresentations[${ordinal}]`,
    );
    if (child.ownerNodeIndex !== childNodeIndex) {
      throw new RangeError(
        "child Representation order/owner does not match topology",
      );
    }
    shCount ??= child.seed.shCount;
    if (child.seed.shCount !== shCount) {
      throw new RangeError("all direct-child seeds must have the same shCount");
    }
    const target = planHalfRateSegmentCount(child.seed.count);
    targets[ordinal] = target;
    parentCount = checkedUint32Add(parentCount, target, "parent seed count");
    representedSourceCount = checkedUint64Add(
      representedSourceCount,
      child.representedSourceCount,
      "parent represented source count",
    );
  }

  const seed = allocateSeed(
    parentCount,
    shCount,
    outputOrigin,
    representedSourceCount,
  );
  const segments = new Array(childCount);
  const childReductions = new Array(childCount);
  let cursor = 0;
  let representationGeometricError = 0;

  for (let ordinal = 0; ordinal < childCount; ordinal++) {
    const child = childRepresentations[ordinal];
    const targetCount = targets[ordinal];
    const expanded = expandSeed(
      child.seed,
      outputOrigin,
      `childRepresentations[${ordinal}].seed`,
    );
    const inputMassSum = deterministicSum(
      expanded.coverageMass,
      `child ${ordinal} input coverage mass`,
    );
    let snapshot;
    let authority;
    let mergeCount = 0;
    let mergeLog = emptyMergeLog();
    let reducerInvoked = false;

    if (child.seed.count === 1) {
      snapshot = expanded;
      authority = {
        targetCount: 1,
        sourceCountSum: 1,
        coverageMassSum: inputMassSum,
      };
    } else {
      reducerInvoked = true;
      let callbackCount = 0;
      const reduction = await buildProxyV2Hierarchy({
        source: expanded.data,
        coverageMass: expanded.coverageMass,
        targetCounts: [targetCount],
        positionAnchor: expanded.anchor,
        onSnapshot(candidate, candidateAuthority) {
          callbackCount++;
          if (callbackCount !== 1) {
            throw new Error("direct-child reducer produced multiple snapshots");
          }
          snapshot = candidate;
          authority = candidateAuthority;
        },
      });
      if (
        callbackCount !== 1 ||
        reduction.snapshots.length !== 1 ||
        !snapshot ||
        !authority
      ) {
        throw new Error(
          "direct-child reducer did not produce one exact snapshot",
        );
      }
      mergeCount = reduction.diagnostics.mergeCount;
      mergeLog = Object.freeze({ ...reduction.diagnostics.mergeLog });
    }

    if (
      snapshot.data.count !== targetCount ||
      authority.targetCount !== targetCount ||
      authority.sourceCountSum !== child.seed.count
    ) {
      throw new Error("direct-child snapshot authority mismatch");
    }
    const outputMassSum = deterministicSum(
      snapshot.coverageMass,
      `child ${ordinal} output coverage mass`,
    );
    const tolerance = massTolerance(child.seed.count, inputMassSum);
    if (
      Math.abs(outputMassSum - inputMassSum) > tolerance ||
      Math.abs(authority.coverageMassSum - inputMassSum) > tolerance
    ) {
      throw new Error("direct-child coverage mass conservation failed");
    }

    compactIntoSeed(
      snapshot.data,
      snapshot.coverageMass,
      seed,
      cursor,
      `childReductions[${ordinal}]`,
    );
    const derivedError = geometricErrorFromRange(seed, cursor, targetCount);
    const segmentGeometricError = Math.max(child.geometricError, derivedError);
    if (segmentGeometricError < child.geometricError) {
      throw new Error("Segment geometric error is not monotonic");
    }
    const segment = Object.freeze({
      segmentId: firstSegmentId + ordinal,
      representationId,
      childNodeIndex: expectedChildNodeIndices[ordinal],
      ordinal,
      rangeStart: cursor,
      rangeCount: targetCount,
      representedSourceCount: child.representedSourceCount,
      geometricError: segmentGeometricError,
    });
    segments[ordinal] = segment;
    childReductions[ordinal] = Object.freeze({
      ordinal,
      childNodeIndex: segment.childNodeIndex,
      inputCount: child.seed.count,
      targetCount,
      reducerInvoked,
      mergeCount,
      mergeLog,
      atomCount: Object.freeze({
        input: child.seed.count,
        output: authority.sourceCountSum,
      }),
      coverageMass: Object.freeze({
        input: inputMassSum,
        output: outputMassSum,
        tolerance,
      }),
    });
    cursor = checkedUint32Add(cursor, targetCount, "Segment range cursor");
    representationGeometricError = Math.max(
      representationGeometricError,
      segmentGeometricError,
    );
  }

  if (cursor !== seed.count) {
    throw new Error("Segments do not exactly partition the parent seed");
  }
  // Complete the owner first, so every Segment uses the same bin edges.
  const ownerErrorUpperBound =
    visualErrorDomain === "dyadic-owner-envelope"
      ? dyadicVisualErrorUpperBound(ownerBounds, representationGeometricError)
      : visualErrorDomain === "owner-envelope"
        ? representationGeometricError
        : undefined;
  for (let ordinal = 0; ordinal < segments.length; ordinal++) {
    const segment = segments[ordinal];
    segments[ordinal] = Object.freeze({
      ...segment,
      ...visualErrorFromRange(
        seed,
        ownerBounds,
        segment.geometricError,
        segment.rangeStart,
        segment.rangeCount,
        ownerErrorUpperBound,
      ),
    });
  }
  for (const segment of segments) {
    if (representationGeometricError < segment.geometricError) {
      throw new Error("Representation geometric error is not monotonic");
    }
  }
  const representation = freezeRepresentation({
    representationId,
    ownerNodeIndex,
    mode: "INTERNAL_SEGMENTED",
    logicalLevel: INTERNAL_LEVEL,
    origin: seed.origin,
    firstSegment: firstSegmentId,
    segmentCount: childCount,
    splatCount: seed.count,
    representedSourceCount,
    geometricError: representationGeometricError,
    ...visualErrorFromRange(
      seed,
      ownerBounds,
      representationGeometricError,
      0,
      seed.count,
      ownerErrorUpperBound,
    ),
    seed,
  });
  return Object.freeze({
    representation,
    segments: Object.freeze(segments),
    diagnostics: Object.freeze({
      policyId: SEGMENTED_PROXY_POLICY_ID,
      childReductions: Object.freeze(childReductions),
    }),
  });
}

function popcount8(mask) {
  let count = 0;
  for (let ordinal = 0; ordinal < 8; ordinal++) {
    count += (mask >> ordinal) & 1;
  }
  return count;
}

function requireTopologyColumn(value, ArrayType, length, label) {
  if (!(value instanceof ArrayType) || value.length !== length) {
    throw new TypeError(
      `${label} must be a ${ArrayType.name} of length ${length}`,
    );
  }
}

export function planSegmentedHierarchyCounts({ hierarchy, leafSeedCounts }) {
  if (!hierarchy || typeof hierarchy !== "object") {
    throw new TypeError("hierarchy must be an A1 sparse hierarchy descriptor");
  }
  const nodeCount = requireCheckedUint32(hierarchy.nodeCount, "nodeCount", 1);
  const leafCount = requireCheckedUint32(hierarchy.leafCount, "leafCount", 1);
  const edgeCount = requireCheckedUint32(hierarchy.edgeCount, "edgeCount");
  if (edgeCount !== nodeCount - 1) {
    throw new RangeError("hierarchy edgeCount must equal nodeCount - 1");
  }
  requireTopologyColumn(
    hierarchy.nodeFirstChild,
    Uint32Array,
    nodeCount,
    "nodeFirstChild",
  );
  requireTopologyColumn(
    hierarchy.nodeChildMask,
    Uint8Array,
    nodeCount,
    "nodeChildMask",
  );
  requireTopologyColumn(
    hierarchy.nodeParent,
    Uint32Array,
    nodeCount,
    "nodeParent",
  );
  requireTopologyColumn(
    hierarchy.leafNodeIndex,
    Uint32Array,
    leafCount,
    "leafNodeIndex",
  );
  requireTopologyColumn(
    leafSeedCounts,
    Uint32Array,
    leafCount,
    "leafSeedCounts",
  );
  if (hierarchy.nodeParent[0] !== INVALID_INDEX) {
    throw new RangeError("hierarchy root parent must be invalid");
  }

  const representationCounts = new Uint32Array(nodeCount);
  const leafOwner = new Uint8Array(nodeCount);
  let leafSeedSplats = 0n;
  let maximumRepresentationSplats = 0;
  for (let leaf = 0; leaf < leafCount; leaf++) {
    const count = requireCheckedUint32(
      leafSeedCounts[leaf],
      `leafSeedCounts[${leaf}]`,
      1,
    );
    const nodeIndex = hierarchy.leafNodeIndex[leaf];
    if (
      nodeIndex >= nodeCount ||
      hierarchy.nodeChildMask[nodeIndex] !== 0 ||
      hierarchy.nodeFirstChild[nodeIndex] !== INVALID_INDEX ||
      leafOwner[nodeIndex]
    ) {
      throw new RangeError("leafNodeIndex does not identify unique leaf Nodes");
    }
    leafOwner[nodeIndex] = 1;
    representationCounts[nodeIndex] = count;
    leafSeedSplats = checkedUint64Add(
      leafSeedSplats,
      BigInt(count),
      "leaf seed aggregate",
    );
    maximumRepresentationSplats = Math.max(maximumRepresentationSplats, count);
  }

  const edgeSeen = new Uint8Array(nodeCount);
  for (let parent = 0; parent < nodeCount; parent++) {
    const mask = hierarchy.nodeChildMask[parent];
    if (mask === 0) {
      if (!leafOwner[parent]) {
        throw new RangeError("hierarchy leaf Node has no leafSeedCount owner");
      }
      continue;
    }
    const directChildCount = popcount8(mask);
    if (directChildCount < 2 || directChildCount > 8) {
      throw new RangeError(
        "internal Node direct-child cardinality must be in [2, 8]",
      );
    }
    const firstChild = hierarchy.nodeFirstChild[parent];
    if (firstChild <= parent || firstChild + directChildCount > nodeCount) {
      throw new RangeError("hierarchy direct-child range is invalid");
    }
    for (let ordinal = 0; ordinal < directChildCount; ordinal++) {
      const child = firstChild + ordinal;
      if (hierarchy.nodeParent[child] !== parent || edgeSeen[child]) {
        throw new RangeError("hierarchy direct-child ownership is invalid");
      }
      edgeSeen[child] = 1;
    }
  }
  for (let node = 1; node < nodeCount; node++) {
    if (!edgeSeen[node]) {
      throw new RangeError("hierarchy contains an unreachable Node");
    }
  }

  let internalProxySplats = 0n;
  for (let node = nodeCount - 1; node >= 0; node--) {
    const mask = hierarchy.nodeChildMask[node];
    if (mask === 0) {
      continue;
    }
    const directChildCount = popcount8(mask);
    const firstChild = hierarchy.nodeFirstChild[node];
    let countBigInt = 0n;
    for (let ordinal = 0; ordinal < directChildCount; ordinal++) {
      const child = firstChild + ordinal;
      const childCount = representationCounts[child];
      if (childCount === 0) {
        throw new Error("hierarchy postorder encountered an unresolved child");
      }
      const segmentCount = planHalfRateSegmentCount(childCount);
      if (
        childCount > 2 * segmentCount + 1 ||
        childCount - segmentCount > segmentCount + 1
      ) {
        throw new Error("half-rate local upgrade bound failed");
      }
      countBigInt += BigInt(segmentCount);
    }
    if (countBigInt > BigInt(MAXIMUM_UINT32)) {
      throw new RangeError("Node Representation count exceeds Uint32");
    }
    const count = Number(countBigInt);
    representationCounts[node] = count;
    internalProxySplats = checkedUint64Add(
      internalProxySplats,
      countBigInt,
      "internal proxy aggregate",
    );
    maximumRepresentationSplats = Math.max(maximumRepresentationSplats, count);
  }

  const bound = checkedUint64Add(
    leafSeedSplats,
    BigInt(edgeCount),
    "global hierarchy count bound",
  );
  if (internalProxySplats > bound) {
    throw new Error(
      "internal proxy count exceeds leafSeedSplats + hierarchyEdges",
    );
  }
  return Object.freeze({
    leafSeedSplats,
    internalProxySplats,
    hierarchyEdges: edgeCount,
    maximumRepresentationSplats,
    boundSlack: bound - internalProxySplats,
  });
}
