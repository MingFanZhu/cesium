import { availableParallelism } from "node:os";

import { PROXY_V2_POLICY_ID } from "./proxy-v2/constants.js";

export const LOD_RATIO_POLICY_ID = "lcc-half-rate-l0-l6-v1";
export const LOD_REUSE_POLICY_ID = "rounding-only-half-rate-reuse-v1";
export const PAYLOAD_PACKING_POLICY_ID = "permanent-coarse-detail-pages-v1";

export const LOD_RATIOS = Object.freeze([
  1, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625,
]);
export const LOGICAL_LEVEL_COUNT = LOD_RATIOS.length;
export const MAX_BUILDER_WORKERS = 32;
export const DEFAULT_MAXIMUM_CHUNK_SPLATS = 400000;
export const DEFAULT_MAX_PACK_BYTES = 512 * 1024 * 1024;

export function defaultBuilderWorkerCount(
  parallelism = availableParallelism(),
) {
  return Math.max(1, Math.min(parallelism - 1, MAX_BUILDER_WORKERS));
}

function positiveSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function positiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
  return value;
}

export function normalizeBuilderOptions(options = {}) {
  if (Object.hasOwn(options, "memoryBudgetBytes")) {
    throw new RangeError(
      "memoryBudgetBytes was removed; the builder no longer performs predictive memory admission",
    );
  }
  if (Object.hasOwn(options, "proxyPolicy")) {
    throw new RangeError(
      `proxyPolicy was removed; the Macro Builder always uses ${PROXY_V2_POLICY_ID}`,
    );
  }
  for (const name of [
    "partitionPolicy",
    "fixedTileSize",
    "target" + "ChunkExtent",
  ]) {
    if (Object.hasOwn(options, name)) {
      throw new RangeError(
        `${name} is unsupported; use segmented cellSizeMeters`,
      );
    }
  }
  const proxyPolicy = PROXY_V2_POLICY_ID;
  const maximumChunkSplats = positiveSafeInteger(
    options.maximumChunkSplats ?? DEFAULT_MAXIMUM_CHUNK_SPLATS,
    "maximumChunkSplats",
  );
  const workers = positiveSafeInteger(
    options.workers ?? defaultBuilderWorkerCount(),
    "workers",
  );
  if (workers > MAX_BUILDER_WORKERS) {
    throw new RangeError(`workers must not exceed ${MAX_BUILDER_WORKERS}`);
  }
  const batchSize = positiveSafeInteger(
    options.batchSize ?? 16384,
    "batchSize",
  );
  const maxPackBytes = positiveSafeInteger(
    options.maxPackBytes ?? DEFAULT_MAX_PACK_BYTES,
    "maxPackBytes",
  );
  if (maxPackBytes < 256) {
    throw new RangeError("maxPackBytes must be at least 256");
  }
  const coordinateSystem = options.coordinateSystem ?? "local";
  if (coordinateSystem !== "local" && coordinateSystem !== "ecef") {
    throw new RangeError("coordinateSystem must be local or ecef");
  }
  const metersPerUnit = positiveFinite(
    options.metersPerUnit ?? 1,
    "metersPerUnit",
  );
  const localOrigin = Object.freeze(
    [...(options.localOrigin ?? [0, 0, 0])].map((value) => {
      if (!Number.isFinite(value)) {
        throw new RangeError("localOrigin must contain finite values");
      }
      return value;
    }),
  );
  if (localOrigin.length !== 3) {
    throw new RangeError("localOrigin must contain exactly 3 values");
  }
  const localToFixed = Object.freeze(
    [
      ...(options.localToFixed ?? [
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      ]),
    ].map((value) => {
      if (!Number.isFinite(value)) {
        throw new RangeError("localToFixed must contain finite values");
      }
      return value;
    }),
  );
  if (localToFixed.length !== 16) {
    throw new RangeError("localToFixed must contain exactly 16 values");
  }
  return Object.freeze({
    proxyPolicy,
    maximumChunkSplats,
    workers,
    batchSize,
    maxPackBytes,
    coordinateSystem,
    localOrigin,
    localToFixed,
    metersPerUnit,
  });
}

export function planLodCounts(finestCount) {
  positiveSafeInteger(finestCount, "finestCount");
  const targetCounts = LOD_RATIOS.map((ratio) =>
    Math.max(1, Math.floor(finestCount * ratio)),
  );
  const levels = [];
  let previousActual = finestCount;
  let previousPayloadLevel = 0;
  for (let level = 0; level < LOD_RATIOS.length; level++) {
    const targetCount = targetCounts[level];
    const reused = level > 0 && targetCount === previousActual;
    const actualCount = reused ? previousActual : targetCount;
    if (!reused) {
      previousPayloadLevel = level;
    }
    levels.push({
      level,
      ratio: LOD_RATIOS[level],
      targetCount,
      actualCount,
      generatedFromLevel: level === 0 ? null : level - 1,
      reusedFromLevel: reused ? previousPayloadLevel : null,
    });
    previousActual = actualCount;
  }
  const distinctPayloadLevels = levels
    .filter((level) => level.reusedFromLevel === null)
    .map((level) => level.level);
  const permanentPayloadLevels = new Set(distinctPayloadLevels.slice(-2));
  return Object.freeze(
    levels.map((level) =>
      Object.freeze({
        ...level,
        permanent: permanentPayloadLevels.has(
          level.reusedFromLevel ?? level.level,
        ),
      }),
    ),
  );
}
