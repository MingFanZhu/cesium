import {
  computeMortonKeys,
  createMortonCubeBounds,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSpatialMorton.js";
import { stableSortMorton } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSpatialRadixSort.js";
import {
  readPlyHeader,
  streamPlyVertexBatches,
} from "./io/ply/PlyStreamReader.js";
import { inspectGaussianPlySchema } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianPlyGaussianSchema.js";
import { emptyBounds, extendPoint } from "./bounds.js";
import { normalizeBuilderOptions } from "./policy.js";

export const FIXED_XYZ_GRID_PARTITION_POLICY_ID =
  "fixed-xyz-grid-count-bounded-v1";
export const SEGMENTED_FIXED_CELL_SIZE_METERS = Object.freeze([10, 10, 20]);
export const SEGMENTED_MAXIMUM_PHYSICAL_PART_SPLATS = 400000;
const MAXIMUM_ROOT_DEPTH = 21;

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !Array.from(value).every(Number.isFinite)
  ) {
    throw new RangeError(
      `${label} must contain exactly ${length} finite values`,
    );
  }
  return Object.freeze([...value]);
}

export function normalizeSegmentedBuilderOptions(rawOptions = {}) {
  return normalizeSegmentedGridOptions(rawOptions);
}

/** Normalize the segmented hierarchy's XYZ cells and CPU build options. */
export function normalizeSegmentedGridOptions(rawOptions = {}) {
  const fixedGridOrigin = finiteVector(
    rawOptions.fixedGridOrigin,
    3,
    "fixedGridOrigin",
  );
  const cellSizeMeters = finiteVector(
    rawOptions.cellSizeMeters ?? SEGMENTED_FIXED_CELL_SIZE_METERS,
    3,
    "cellSizeMeters",
  );
  if (!cellSizeMeters.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError(
      "cellSizeMeters must contain three positive finite metres",
    );
  }
  const maximumChunkSplats =
    rawOptions.maximumChunkSplats ?? SEGMENTED_MAXIMUM_PHYSICAL_PART_SPLATS;
  if (maximumChunkSplats !== SEGMENTED_MAXIMUM_PHYSICAL_PART_SPLATS) {
    throw new RangeError(
      "F1 segmented maximumChunkSplats must be exactly 400000",
    );
  }
  const common = normalizeBuilderOptions({
    ...rawOptions,
    maximumChunkSplats,
  });
  const maximumInFlightLeafSplats =
    rawOptions.maximumInFlightLeafSplats ?? common.workers * maximumChunkSplats;
  if (
    !Number.isSafeInteger(maximumInFlightLeafSplats) ||
    maximumInFlightLeafSplats < maximumChunkSplats
  ) {
    throw new RangeError(
      "maximumInFlightLeafSplats must admit at least one maximum physical part",
    );
  }
  return Object.freeze({
    ...common,
    chunkPartitionPolicyId: FIXED_XYZ_GRID_PARTITION_POLICY_ID,
    fixedGridOrigin,
    maximumInFlightLeafSplats,
    cellSizeMeters,
    cellSizeSource: Object.freeze(
      cellSizeMeters.map((value) => value / common.metersPerUnit),
    ),
  });
}

function morton3d(x, y, z) {
  let result = 0n;
  for (let bit = 0; bit < MAXIMUM_ROOT_DEPTH; bit++) {
    const input = BigInt(bit);
    const output = BigInt(bit * 3);
    result |= ((BigInt(x) >> input) & 1n) << output;
    result |= ((BigInt(y) >> input) & 1n) << (output + 1n);
    result |= ((BigInt(z) >> input) & 1n) << (output + 2n);
  }
  return result;
}

async function scanPositions(input, header, batchSize) {
  const bounds = emptyBounds();
  let pointCount = 0;
  for await (const batch of streamPlyVertexBatches(input, {
    header,
    properties: ["x", "y", "z"],
    batchSize,
  })) {
    for (let index = 0; index < batch.count; index++) {
      extendPoint(
        bounds,
        batch.columns.x[index],
        batch.columns.y[index],
        batch.columns.z[index],
      );
    }
    pointCount += batch.count;
  }
  return { bounds, pointCount };
}

function gridContext(bounds, options) {
  const minimumTile = [0, 1, 2].map((component) =>
    Math.floor(
      (bounds[component] - options.fixedGridOrigin[component]) /
        options.cellSizeSource[component],
    ),
  );
  const maximumTile = [0, 1, 2].map((component) =>
    Math.floor(
      (bounds[component + 3] - options.fixedGridOrigin[component]) /
        options.cellSizeSource[component],
    ),
  );
  const counts = minimumTile.map(
    (minimum, component) => maximumTile[component] - minimum + 1,
  );
  if (
    [...minimumTile, ...maximumTile].some(
      (value) => !Number.isSafeInteger(value),
    ) ||
    counts.some((value) => !Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new RangeError("F1 fixed XYZ occupied cell range is invalid");
  }
  let rootSizeTiles = 1;
  let rootDepth = 0;
  while (rootSizeTiles < Math.max(...counts)) {
    rootSizeTiles *= 2;
    rootDepth++;
  }
  if (rootDepth > MAXIMUM_ROOT_DEPTH) {
    throw new RangeError("F1 fixed XYZ hierarchy exceeds 21 octree levels");
  }
  const tileCount = counts[0] * counts[1] * counts[2];
  if (!Number.isSafeInteger(tileCount) || tileCount <= 0) {
    throw new RangeError("F1 fixed XYZ occupied grid cardinality is invalid");
  }
  const mortonByOrdinal = new BigUint64Array(tileCount);
  for (let z = 0; z < counts[2]; z++) {
    for (let y = 0; y < counts[1]; y++) {
      for (let x = 0; x < counts[0]; x++) {
        mortonByOrdinal[(z * counts[1] + y) * counts[0] + x] = morton3d(
          x,
          y,
          z,
        );
      }
    }
  }
  return Object.freeze({
    policyId: FIXED_XYZ_GRID_PARTITION_POLICY_ID,
    origin: options.fixedGridOrigin,
    cellSizeMeters: options.cellSizeMeters,
    cellSizeSource: options.cellSizeSource,
    minimumTile: Object.freeze(minimumTile),
    maximumTileExclusive: Object.freeze(maximumTile.map((value) => value + 1)),
    tileCountX: counts[0],
    tileCountY: counts[1],
    tileCountZ: counts[2],
    tileCount,
    rootSizeTiles,
    rootDepth,
    mortonByOrdinal,
  });
}

function tileOrdinal(x, y, z, grid) {
  const compact = [x, y, z].map(
    (value, component) =>
      Math.floor(
        (value - grid.origin[component]) / grid.cellSizeSource[component],
      ) - grid.minimumTile[component],
  );
  if (
    compact[0] < 0 ||
    compact[0] >= grid.tileCountX ||
    compact[1] < 0 ||
    compact[1] >= grid.tileCountY ||
    compact[2] < 0 ||
    compact[2] >= grid.tileCountZ
  ) {
    throw new RangeError("Point is outside the F1 fixed XYZ occupied range");
  }
  return (
    (compact[2] * grid.tileCountY + compact[1]) * grid.tileCountX + compact[0]
  );
}

function planChunks(sortedCellKeys, grid, options) {
  const ordinalByMorton = new Map(
    Array.from(grid.mortonByOrdinal, (morton, ordinal) => [morton, ordinal]),
  );
  const chunks = [];
  let start = 0;
  while (start < sortedCellKeys.length) {
    const cellMorton = sortedCellKeys[start];
    let end = start + 1;
    while (end < sortedCellKeys.length && sortedCellKeys[end] === cellMorton) {
      end++;
    }
    const ordinal = ordinalByMorton.get(cellMorton);
    if (ordinal === undefined) {
      throw new Error("F1 fixed XYZ Morton identity lookup failed");
    }
    const compactX = ordinal % grid.tileCountX;
    const yz = Math.floor(ordinal / grid.tileCountX);
    const compactY = yz % grid.tileCountY;
    const compactZ = Math.floor(yz / grid.tileCountY);
    const tileX = grid.minimumTile[0] + compactX;
    const tileY = grid.minimumTile[1] + compactY;
    const tileZ = grid.minimumTile[2] + compactZ;
    const minimum = [tileX, tileY, tileZ].map(
      (value, component) =>
        grid.origin[component] + value * grid.cellSizeSource[component],
    );
    const cellBounds = Object.freeze([
      ...minimum,
      ...minimum.map(
        (value, component) => value + grid.cellSizeSource[component],
      ),
    ]);
    const pointCount = end - start;
    const partCount = Math.ceil(pointCount / options.maximumChunkSplats);
    for (let partIndex = 0; partIndex < partCount; partIndex++) {
      const partStart = start + partIndex * options.maximumChunkSplats;
      const count = Math.min(options.maximumChunkSplats, end - partStart);
      chunks.push(
        Object.freeze({
          ordinal: chunks.length,
          chunkId: `t${tileZ}-${tileY}-${tileX}-p${partIndex}`,
          depth: 0,
          prefix: cellMorton.toString(16),
          commonDepth: 0,
          commonPrefix: "0",
          start: partStart,
          count,
          cellBounds,
          logicalTile: Object.freeze({
            tileX,
            tileY,
            tileZ,
            partIndex,
            partCount,
            bounds: cellBounds,
          }),
        }),
      );
    }
    start = end;
  }
  return Object.freeze({
    policyId: FIXED_XYZ_GRID_PARTITION_POLICY_ID,
    fixedGrid: grid,
    chunks: Object.freeze(chunks),
  });
}

export async function partitionPlyIntoSegmentedXyzCells(
  input,
  rawOptions = {},
) {
  const options = normalizeSegmentedBuilderOptions(rawOptions);
  const header = await readPlyHeader(input);
  const schema = inspectGaussianPlySchema(header);
  await rawOptions.onHeaderValidated?.({ header, schema, options });
  const scan = await scanPositions(input, header, options.batchSize);
  if (scan.pointCount !== schema.vertexCount || scan.pointCount === 0) {
    throw new Error(
      "PLY vertex scan did not produce the declared nonzero count",
    );
  }
  const mortonBounds = createMortonCubeBounds(scan.bounds);
  const grid = gridContext(scan.bounds, options);
  const localKeys = new BigUint64Array(scan.pointCount);
  const cellOrdinals = new Uint32Array(scan.pointCount);
  const sortedIndices = new Uint32Array(scan.pointCount);
  let visited = 0;
  for await (const batch of streamPlyVertexBatches(input, {
    header,
    properties: ["x", "y", "z"],
    batchSize: options.batchSize,
  })) {
    const batchMorton = computeMortonKeys(
      batch.columns.x,
      batch.columns.y,
      batch.columns.z,
      mortonBounds,
    );
    for (let index = 0; index < batch.count; index++) {
      const sourceIndex = batch.start + index;
      localKeys[sourceIndex] = batchMorton[index];
      cellOrdinals[sourceIndex] = tileOrdinal(
        batch.columns.x[index],
        batch.columns.y[index],
        batch.columns.z[index],
        grid,
      );
      sortedIndices[sourceIndex] = sourceIndex;
    }
    visited += batch.count;
  }
  if (visited !== scan.pointCount) {
    throw new Error("F1 Morton pass did not visit every PLY vertex");
  }

  // Stable local-Morton order first, then stable cell-Morton order. The second
  // stable pass preserves the canonical three-dimensional order inside a cell.
  stableSortMorton(localKeys, sortedIndices);
  for (let index = 0; index < localKeys.length; index++) {
    localKeys[index] = grid.mortonByOrdinal[cellOrdinals[sortedIndices[index]]];
  }
  stableSortMorton(localKeys, sortedIndices);
  const partition = planChunks(localKeys, grid, options);
  return {
    ...partition,
    pointCount: scan.pointCount,
    bounds: scan.bounds,
    mortonBounds,
    mortonKeys: localKeys,
    sortedIndices,
    blocks: partition.chunks,
    header,
    schema,
    options,
  };
}
