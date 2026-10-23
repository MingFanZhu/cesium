/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
import {
  createGaussianSet,
  trimGaussianSet,
} from "./_SceneGISGaussianColumns.js";
import {
  covarianceFromScaleRotation,
  normalizeQuaternion,
} from "./_SceneGISGaussianMath.js";

const SH_C0 = 0.28209479177387814;
const MIN_SCALE = 1e-12;
const MAX_SCALE = 1e12;
const MAX_ABS_ATTRIBUTE = 1e12;
const LOW_OPACITY_THRESHOLD = 0.005;

function sigmoid(value) {
  if (value >= 0) {
    return 1 / (1 + Math.exp(-value));
  }
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function finiteWithin(value, maximum = MAX_ABS_ATTRIBUTE) {
  return Number.isFinite(value) && Math.abs(value) <= maximum;
}

function incrementReason(reasons, reason) {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

/**
 * Decodes one raw PLY Gaussian block, retaining the established validation,
 * normalization, filtering and stable-identifier semantics.
 */
export function decodePlyGaussianBlock(raw) {
  const output = createGaussianSet(raw.count, raw.shCount);
  const reasons = {};
  let validCount = 0;
  let lowOpacityCount = 0;

  for (let sourceIndex = 0; sourceIndex < raw.count; sourceIndex++) {
    const positionOffset = sourceIndex * 3;
    const rotationOffset = sourceIndex * 4;
    const shOffset = sourceIndex * raw.shCount;
    let reason;
    for (let component = 0; component < 3; component++) {
      if (!finiteWithin(raw.position[positionOffset + component])) {
        reason = "position";
        break;
      }
    }
    const scales = [0, 0, 0];
    if (!reason) {
      for (let component = 0; component < 3; component++) {
        const logScale = raw.logScale[positionOffset + component];
        const scale = Math.exp(logScale);
        if (
          !Number.isFinite(logScale) ||
          !Number.isFinite(scale) ||
          scale < MIN_SCALE ||
          scale > MAX_SCALE
        ) {
          reason = "scale";
          break;
        }
        scales[component] = scale;
      }
    }
    let rotation;
    if (!reason) {
      rotation = normalizeQuaternion(
        raw.rotation[rotationOffset],
        raw.rotation[rotationOffset + 1],
        raw.rotation[rotationOffset + 2],
        raw.rotation[rotationOffset + 3],
      );
      if (!rotation) {
        reason = "rotation";
      }
    }
    const opacity = sigmoid(raw.opacityLogit[sourceIndex]);
    if (
      !reason &&
      (!Number.isFinite(raw.opacityLogit[sourceIndex]) ||
        !Number.isFinite(opacity) ||
        opacity <= 0)
    ) {
      reason = "opacity";
    }
    const colors = [0, 0, 0];
    if (!reason) {
      for (let component = 0; component < 3; component++) {
        const dc = raw.dc[positionOffset + component];
        const color = dc * SH_C0 + 0.5;
        if (!finiteWithin(dc) || !finiteWithin(color)) {
          reason = "color";
          break;
        }
        colors[component] = color;
      }
    }
    if (!reason) {
      for (let coefficient = 0; coefficient < raw.shCount; coefficient++) {
        if (!finiteWithin(raw.sh[shOffset + coefficient])) {
          reason = "sh";
          break;
        }
      }
    }
    if (reason) {
      incrementReason(reasons, reason);
      continue;
    }

    const targetPosition = validCount * 3;
    const targetRotation = validCount * 4;
    const targetCovariance = validCount * 6;
    const targetSh = validCount * raw.shCount;
    for (let component = 0; component < 3; component++) {
      output.position[targetPosition + component] =
        raw.position[positionOffset + component];
      output.scale[targetPosition + component] = scales[component];
      output.color[targetPosition + component] = colors[component];
    }
    for (let component = 0; component < 4; component++) {
      output.rotation[targetRotation + component] = rotation[component];
    }
    const covariance = covarianceFromScaleRotation(scales, 0, rotation, 0);
    for (let component = 0; component < 6; component++) {
      output.covariance[targetCovariance + component] = covariance[component];
    }
    output.opacity[validCount] = opacity;
    output.stableId[validCount] = raw.stableId[sourceIndex];
    output.sourceCount[validCount] = 1;
    if (raw.shCount > 0) {
      output.sh.set(
        raw.sh.subarray(shOffset, shOffset + raw.shCount),
        targetSh,
      );
    }
    if (opacity < LOW_OPACITY_THRESHOLD) {
      lowOpacityCount++;
    }
    validCount++;
  }

  return {
    data: trimGaussianSet(output, validCount),
    filterDiagnostics: {
      inputCount: raw.count,
      validCount,
      filteredCount: raw.count - validCount,
      lowOpacityCount,
      reasons,
    },
  };
}

/** @private */
const _SceneGISGaussianDecodePlyGaussian = { decodePlyGaussianBlock };
export default _SceneGISGaussianDecodePlyGaussian;
