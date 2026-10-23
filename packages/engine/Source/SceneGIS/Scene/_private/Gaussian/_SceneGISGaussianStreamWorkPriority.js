/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import DeveloperError from "../../../../Core/DeveloperError.js";

export const GaussianStreamWorkClass = Object.freeze({
  VISIBLE_WORK_CORE: 0,
  PREFETCH_COARSE_CORE: 1,
  ACTIVE_OPTIONAL_SH: 2,
  HISTORY_MAINTENANCE: 3,
});

export const GaussianStreamScheduleClass = Object.freeze({
  COARSE_MISSING: 0,
  STABLE_MISSING: 1,
  SAME_KEY_REPLACEMENT_OR_REORDER: 2,
  MAINTENANCE: 3,
});

const legacyHigh = new Set(["visible-core", "coming-core", "coming-sh"]);
const legacyKnown = new Set([
  ...legacyHigh,
  "bootstrap-core",
  "bootstrap-sh",
  "global-snapshot-source",
  "around-coarse-prefetch",
  "progressive-tile-core",
  "progressive-tile-sh",
  "macro-coarse-core",
  "history",
]);

const REQUEST_CLASS_BAND = 2 ** 51;

function finiteNonnegative(value, name, safeInteger = false) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (safeInteger && !Number.isSafeInteger(value))
  ) {
    throw new DeveloperError(`Structured ${name} is invalid`);
  }
  return value;
}

export function validateGaussianStreamWorkPriority(priority) {
  if (priority === null || typeof priority !== "object") {
    throw new DeveloperError("Structured work priority is required");
  }
  const workClass = finiteNonnegative(priority.workClass, "work class", true);
  const scheduleClass = finiteNonnegative(
    priority.scheduleClass,
    "schedule class",
    true,
  );
  if (
    (workClass !== GaussianStreamWorkClass.VISIBLE_WORK_CORE &&
      workClass !== GaussianStreamWorkClass.PREFETCH_COARSE_CORE &&
      workClass !== GaussianStreamWorkClass.ACTIVE_OPTIONAL_SH &&
      workClass !== GaussianStreamWorkClass.HISTORY_MAINTENANCE) ||
    scheduleClass > 3
  ) {
    throw new DeveloperError("Structured work priority class is invalid");
  }
  const tileY = priority.tileY;
  const tileX = priority.tileX;
  if (!Number.isSafeInteger(tileY) || !Number.isSafeInteger(tileX)) {
    throw new DeveloperError("Structured tile coordinate is invalid");
  }
  if (
    typeof priority.canonicalIdentity !== "string" ||
    priority.canonicalIdentity.length === 0
  ) {
    throw new DeveloperError("Structured canonical identity is invalid");
  }
  const sequence = finiteNonnegative(priority.sequence, "sequence", true);
  const requestRank = finiteNonnegative(
    priority.requestRank ?? sequence,
    "request rank",
    true,
  );
  if (requestRank >= REQUEST_CLASS_BAND) {
    throw new DeveloperError(
      "Structured request rank exceeds its bounded band",
    );
  }
  return Object.freeze({
    workClass,
    scheduleClass,
    distanceSquared: finiteNonnegative(
      priority.distanceSquared,
      "distance squared",
    ),
    logicalXyExtentSquared: finiteNonnegative(
      priority.logicalXyExtentSquared,
      "logical XY extent squared",
    ),
    selectedSplats: finiteNonnegative(
      priority.selectedSplats,
      "selected splats",
      true,
    ),
    tileY,
    tileX,
    canonicalIdentity: priority.canonicalIdentity,
    sequence,
    requestRank,
  });
}

export function compareGaussianStreamWorkPriority(left, right) {
  left = validateGaussianStreamWorkPriority(left);
  right = validateGaussianStreamWorkPriority(right);
  return (
    left.workClass - right.workClass ||
    left.scheduleClass - right.scheduleClass ||
    left.requestRank - right.requestRank ||
    left.distanceSquared - right.distanceSquared ||
    right.logicalXyExtentSquared - left.logicalXyExtentSquared ||
    right.selectedSplats - left.selectedSplats ||
    left.tileY - right.tileY ||
    left.tileX - right.tileX ||
    left.canonicalIdentity.localeCompare(right.canonicalIdentity) ||
    left.sequence - right.sequence
  );
}

export function gaussianStreamRequestPriority(priority) {
  priority = validateGaussianStreamWorkPriority(priority);
  // The semantic tuple cannot be packed exactly from continuous IEEE values.
  // Primitive first assigns a dense rank after the canonical comparator, then
  // RequestScheduler consumes this exact discrete order inside disjoint class
  // bands. Lower scalar values remain higher priority.
  return priority.workClass * REQUEST_CLASS_BAND + priority.requestRank;
}

export function rankGaussianStreamWorkPriorities(values) {
  const ordered = values
    .map(validateGaussianStreamWorkPriority)
    .sort(compareGaussianStreamWorkPriority);
  return Object.freeze(
    ordered.map((priority, requestRank) =>
      Object.freeze({ ...priority, requestRank }),
    ),
  );
}

export function gaussianStreamLegacyPriorityDisposition(priorityClass) {
  if (legacyHigh.has(priorityClass)) {
    return 0;
  }
  // Keep an explicit inventory for auditability. Unknown legacy values retain
  // the former maintenance disposition; no prefix inference is performed.
  if (legacyKnown.has(priorityClass) || typeof priorityClass === "string") {
    return 3;
  }
  return 3;
}

export function normalizeGaussianStreamWorkPriority(value, sequence = 0) {
  if (value !== null && typeof value === "object") {
    return validateGaussianStreamWorkPriority(value);
  }
  const workClass = gaussianStreamLegacyPriorityDisposition(value);
  return Object.freeze({
    workClass,
    scheduleClass: GaussianStreamScheduleClass.MAINTENANCE,
    distanceSquared: 0,
    logicalXyExtentSquared: 0,
    selectedSplats: 0,
    tileY: 0,
    tileX: 0,
    canonicalIdentity: `legacy:${String(value)}`,
    sequence,
  });
}

/** @private */
const _SceneGISGaussianStreamWorkPriority = {
  GaussianStreamWorkClass,
  GaussianStreamScheduleClass,
  validateGaussianStreamWorkPriority,
  compareGaussianStreamWorkPriority,
  gaussianStreamRequestPriority,
  rankGaussianStreamWorkPriorities,
  gaussianStreamLegacyPriorityDisposition,
  normalizeGaussianStreamWorkPriority,
};
export default _SceneGISGaussianStreamWorkPriority;
