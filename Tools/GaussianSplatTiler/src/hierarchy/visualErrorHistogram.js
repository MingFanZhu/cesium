export const VISUAL_ERROR_BIN_COUNT = 4096;
export const VISUAL_ERROR_METHOD = "coverage-weighted-node-domain-histogram-v1";
export const DYADIC_VISUAL_ERROR_METHOD =
  "coverage-weighted-dyadic-owner-domain-histogram-v1";

const SQRT_THREE = Math.sqrt(3);

function finiteNonnegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
  return value;
}

export function visualErrorHistogramUpperBound(ownerBounds) {
  if (ownerBounds?.length !== 6) {
    throw new TypeError("ownerBounds must contain exactly 6 values");
  }
  let diagonalSquared = 0;
  for (let component = 0; component < 3; component++) {
    const minimum = ownerBounds[component];
    const maximum = ownerBounds[component + 3];
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
      throw new RangeError("ownerBounds must be finite");
    }
    const extent = maximum - minimum;
    if (extent < 0) {
      throw new RangeError("ownerBounds must be ordered");
    }
    diagonalSquared += extent * extent;
  }
  const upperBound = 4 * Math.sqrt(diagonalSquared);
  if (!Number.isFinite(upperBound) || upperBound <= 0) {
    throw new RangeError("visual-error histogram domain must be positive");
  }
  return upperBound;
}

export function combinedProxyError(errorPosition, errorCovariance) {
  finiteNonnegative(errorPosition, "errorPosition");
  finiteNonnegative(errorCovariance, "errorCovariance");
  return SQRT_THREE * errorPosition + 2 * Math.sqrt(3 * errorCovariance);
}

function quantileUpperBound(histogram, totalWeight, upperBound, quantile) {
  const threshold = totalWeight * quantile;
  let cumulative = 0;
  for (let bin = 0; bin < histogram.length; bin++) {
    cumulative += histogram[bin];
    if (cumulative >= threshold) {
      return ((bin + 1) * upperBound) / histogram.length;
    }
  }
  throw new Error("visual-error histogram quantile is unreachable");
}

function weightAuthority(coverageMass, sourceCount, count) {
  if (coverageMass?.length !== count) {
    throw new RangeError("coverageMass length must match the error arrays");
  }
  let coverageTotal = 0;
  for (let index = 0; index < count; index++) {
    coverageTotal += finiteNonnegative(
      coverageMass[index],
      `coverageMass[${index}]`,
    );
  }
  if (coverageTotal > 0) {
    return {
      values: coverageMass,
      total: coverageTotal,
      kind: "COVERAGE_MASS",
    };
  }
  if (sourceCount?.length === count) {
    let sourceTotal = 0;
    for (let index = 0; index < count; index++) {
      sourceTotal += finiteNonnegative(
        sourceCount[index],
        `sourceCount[${index}]`,
      );
    }
    if (sourceTotal > 0) {
      return { values: sourceCount, total: sourceTotal, kind: "SOURCE_COUNT" };
    }
  }
  return { values: undefined, total: count, kind: "UNIT" };
}

export function createVisualErrorHistogram(options) {
  const { errorPosition, errorCovariance, coverageMass, sourceCount } = options;
  const count = errorPosition?.length;
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new RangeError("visual-error input must be nonempty");
  }
  if (errorCovariance?.length !== count) {
    throw new RangeError("errorCovariance length must match errorPosition");
  }
  // The original producer freezes the domain to the owner cell. Producers
  // carrying fitted/accumulated envelopes may provide one whole-owner bound;
  // every physical part and child range must receive that same bound.
  const expanded = options.ownerErrorUpperBound !== undefined;
  const upperBound = Math.max(
    visualErrorHistogramUpperBound(options.ownerBounds),
    expanded
      ? finiteNonnegative(options.ownerErrorUpperBound, "ownerErrorUpperBound")
      : 0,
  );
  const method = expanded
    ? "coverage-weighted-owner-envelope-histogram-v1"
    : VISUAL_ERROR_METHOD;
  let maximum = 0;
  for (let index = 0; index < count; index++) {
    maximum = Math.max(
      maximum,
      combinedProxyError(errorPosition[index], errorCovariance[index]),
    );
  }
  if (maximum > upperBound) {
    throw new RangeError(
      `visual-error ${maximum} exceeds owner-node domain ${upperBound}`,
    );
  }
  if (maximum === 0) {
    return Object.freeze({
      method,
      binCount: VISUAL_ERROR_BIN_COUNT,
      upperBound,
      maximum: 0,
      p95: 0,
      p99: 0,
      totalWeight: 0,
      weightAuthority: "ZERO_ERROR",
      bins: new Float64Array(VISUAL_ERROR_BIN_COUNT),
    });
  }
  const weights = weightAuthority(coverageMass, sourceCount, count);
  const bins = new Float64Array(VISUAL_ERROR_BIN_COUNT);
  for (let index = 0; index < count; index++) {
    const error = combinedProxyError(
      errorPosition[index],
      errorCovariance[index],
    );
    const bin = Math.min(
      VISUAL_ERROR_BIN_COUNT - 1,
      Math.max(0, Math.ceil((error / upperBound) * VISUAL_ERROR_BIN_COUNT) - 1),
    );
    bins[bin] += weights.values?.[index] ?? 1;
  }
  return Object.freeze({
    method,
    binCount: VISUAL_ERROR_BIN_COUNT,
    upperBound,
    maximum,
    p95: quantileUpperBound(bins, weights.total, upperBound, 0.95),
    p99: quantileUpperBound(bins, weights.total, upperBound, 0.99),
    totalWeight: weights.total,
    weightAuthority: weights.kind,
    bins,
  });
}

export function dyadicVisualErrorUpperBound(ownerBounds, maximum) {
  finiteNonnegative(maximum, "maximum visual error");
  let upperBound = visualErrorHistogramUpperBound(ownerBounds);
  while (maximum > upperBound) {
    upperBound *= 2;
    if (!Number.isFinite(upperBound)) {
      throw new RangeError("visual-error dyadic domain exceeds finite range");
    }
  }
  return upperBound;
}

// Temporary part histograms have nested bin edges. They can be rebased exactly
// when all parts of the logical owner finish, without retaining per-splat errors.
export function createDyadicVisualErrorHistogram(options) {
  const count = options.errorPosition?.length;
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new RangeError("visual-error input must be nonempty");
  }
  if (options.errorCovariance?.length !== count) {
    throw new RangeError("errorCovariance length must match errorPosition");
  }
  let maximum = 0;
  for (let index = 0; index < count; index++) {
    maximum = Math.max(
      maximum,
      combinedProxyError(
        options.errorPosition[index],
        options.errorCovariance[index],
      ),
    );
  }
  const histogram = createVisualErrorHistogram({
    ...options,
    ownerErrorUpperBound: dyadicVisualErrorUpperBound(
      options.ownerBounds,
      maximum,
    ),
  });
  return Object.freeze({
    ...histogram,
    method: DYADIC_VISUAL_ERROR_METHOD,
  });
}

export function rebaseDyadicVisualErrorHistogram(histogram, upperBound) {
  const ratio = upperBound / histogram.upperBound;
  const exponent = Math.log2(ratio);
  if (
    histogram.method !== DYADIC_VISUAL_ERROR_METHOD ||
    histogram.binCount !== VISUAL_ERROR_BIN_COUNT ||
    histogram.bins?.length !== VISUAL_ERROR_BIN_COUNT ||
    !Number.isFinite(upperBound) ||
    ratio < 1 ||
    !Number.isInteger(exponent) ||
    ratio !== 2 ** exponent
  ) {
    throw new RangeError("visual-error rebase requires nested dyadic domains");
  }
  if (ratio === 1) {
    return histogram;
  }
  const bins = new Float64Array(VISUAL_ERROR_BIN_COUNT);
  for (let bin = 0; bin < VISUAL_ERROR_BIN_COUNT; bin++) {
    bins[Math.floor(bin / ratio)] += histogram.bins[bin];
  }
  const p95 =
    histogram.maximum === 0
      ? 0
      : quantileUpperBound(bins, histogram.totalWeight, upperBound, 0.95);
  const p99 =
    histogram.maximum === 0
      ? 0
      : quantileUpperBound(bins, histogram.totalWeight, upperBound, 0.99);
  return Object.freeze({ ...histogram, upperBound, bins, p95, p99 });
}

export function mergeVisualErrorHistograms(histograms) {
  if (!Array.isArray(histograms) || histograms.length === 0) {
    throw new RangeError("histograms must be a nonempty canonical sequence");
  }
  const { upperBound, method } = histograms[0];
  const bins = new Float64Array(VISUAL_ERROR_BIN_COUNT);
  let maximum = 0;
  let totalWeight = 0;
  for (const histogram of histograms) {
    if (
      histogram.binCount !== VISUAL_ERROR_BIN_COUNT ||
      histogram.method !== method ||
      !Object.is(histogram.upperBound, upperBound) ||
      histogram.bins?.length !== VISUAL_ERROR_BIN_COUNT
    ) {
      throw new Error("visual-error histograms do not share one owner domain");
    }
    maximum = Math.max(maximum, histogram.maximum);
    totalWeight += histogram.totalWeight;
    for (let bin = 0; bin < VISUAL_ERROR_BIN_COUNT; bin++) {
      bins[bin] += histogram.bins[bin];
    }
  }
  if (maximum === 0) {
    return Object.freeze({
      method,
      binCount: VISUAL_ERROR_BIN_COUNT,
      upperBound,
      maximum: 0,
      p95: 0,
      p99: 0,
      totalWeight: 0,
      weightAuthority: "CANONICAL_MERGE",
      bins,
    });
  }
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    throw new Error("merged visual-error histogram has no positive weight");
  }
  return Object.freeze({
    method,
    binCount: VISUAL_ERROR_BIN_COUNT,
    upperBound,
    maximum,
    p95: quantileUpperBound(bins, totalWeight, upperBound, 0.95),
    p99: quantileUpperBound(bins, totalWeight, upperBound, 0.99),
    totalWeight,
    weightAuthority: "CANONICAL_MERGE",
    bins,
  });
}

export function applyVisualErrorMonotonicEnvelope(levels) {
  let maximum = 0;
  let p95 = 0;
  let p99 = 0;
  return levels.map((level, index) => {
    if (
      ![level.maximum, level.p95, level.p99].every(Number.isFinite) ||
      !(0 <= level.p95 && level.p95 <= level.p99 && level.p99 <= level.maximum)
    ) {
      throw new Error(`Invalid visual-error channels at L${index}`);
    }
    // Independently fitted snapshots need not have increasing measured maxima.
    // Envelope the conservative bound together with its quantiles; lowering a
    // carried quantile would break the runtime's monotonic LOD error contract.
    maximum = Math.max(maximum, level.maximum);
    if (index === 0) {
      p95 = 0;
      p99 = 0;
    } else {
      p95 = Math.max(p95, level.p95);
      p99 = Math.max(p99, level.p99);
    }
    if (!(0 <= p95 && p95 <= p99 && p99 <= maximum)) {
      throw new Error(
        `visual-error channels violate the conservative envelope at L${index}: ${JSON.stringify({ p95, p99, maximum })}`,
      );
    }
    return Object.freeze({ ...level, maximum, p95, p99 });
  });
}
