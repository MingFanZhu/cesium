import { stableSortMorton } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSpatialRadixSort.js";

export const INVALID_NODE_INDEX = 0xffffffff;

const MAXIMUM_ROOT_DEPTH = 21;
const MAXIMUM_LEAF_COUNT = 0x7fffffff;

function requireColumn(value, constructor, label) {
  if (!(value instanceof constructor)) {
    throw new TypeError(`${label} must be a ${constructor.name}`);
  }
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

function commonPrefixDepth(firstKey, lastKey, totalBits) {
  const difference = firstKey ^ lastKey;
  if (difference === 0n) {
    return Math.floor(totalBits / 3);
  }
  return Math.floor((totalBits - difference.toString(2).length) / 3);
}

function prefixAtDepth(key, totalBits, depth) {
  return depth === 0 ? 0n : key >> BigInt(totalBits - depth * 3);
}

function childCodeAtDepth(key, totalBits, parentDepth) {
  return Number((key >> BigInt(totalBits - (parentDepth + 1) * 3)) & 7n);
}

function popcount8(mask) {
  let count = 0;
  for (let ordinal = 0; ordinal < 8; ordinal++) {
    count += (mask >> ordinal) & 1;
  }
  return count;
}

function rootCell(tileX, tileY, tileZ) {
  const minimum = [tileX[0], tileY[0], tileZ[0]];
  const maximum = [...minimum];
  for (let index = 1; index < tileX.length; index++) {
    minimum[0] = Math.min(minimum[0], tileX[index]);
    minimum[1] = Math.min(minimum[1], tileY[index]);
    minimum[2] = Math.min(minimum[2], tileZ[index]);
    maximum[0] = Math.max(maximum[0], tileX[index]);
    maximum[1] = Math.max(maximum[1], tileY[index]);
    maximum[2] = Math.max(maximum[2], tileZ[index]);
  }
  const requiredSize = Math.max(
    maximum[0] - minimum[0] + 1,
    maximum[1] - minimum[1] + 1,
    maximum[2] - minimum[2] + 1,
  );
  let sizeTiles = 1;
  let depth = 0;
  while (sizeTiles < requiredSize) {
    sizeTiles *= 2;
    depth++;
  }
  if (depth > MAXIMUM_ROOT_DEPTH) {
    throw new RangeError("F1 fixed XYZ hierarchy exceeds 21 octree levels");
  }
  return Object.freeze({
    tileX: minimum[0],
    tileY: minimum[1],
    tileZ: minimum[2],
    sizeTiles,
    depth,
  });
}

/**
 * Plans the F1 segmented-only sparse, unary-compressed octree.
 */
export function planSparseFixedGrid3dHierarchy({
  tileX,
  tileY,
  tileZ,
  physicalPartCount,
}) {
  requireColumn(tileX, Int32Array, "tileX");
  requireColumn(tileY, Int32Array, "tileY");
  requireColumn(tileZ, Int32Array, "tileZ");
  requireColumn(physicalPartCount, Uint32Array, "physicalPartCount");
  const leafCount = tileX.length;
  if (
    leafCount === 0 ||
    leafCount > MAXIMUM_LEAF_COUNT ||
    tileY.length !== leafCount ||
    tileZ.length !== leafCount ||
    physicalPartCount.length !== leafCount
  ) {
    throw new RangeError("F1 fixed XYZ leaf columns are invalid");
  }
  for (let index = 0; index < leafCount; index++) {
    if (physicalPartCount[index] === 0) {
      throw new RangeError(`physicalPartCount[${index}] must be positive`);
    }
  }

  const root = rootCell(tileX, tileY, tileZ);
  const totalBits = root.depth * 3;
  const mortonKeys = new BigUint64Array(leafCount);
  const sourceLeafIndex = new Uint32Array(leafCount);
  for (let index = 0; index < leafCount; index++) {
    const relativeX = tileX[index] - root.tileX;
    const relativeY = tileY[index] - root.tileY;
    const relativeZ = tileZ[index] - root.tileZ;
    if (
      relativeX < 0 ||
      relativeY < 0 ||
      relativeZ < 0 ||
      relativeX >= root.sizeTiles ||
      relativeY >= root.sizeTiles ||
      relativeZ >= root.sizeTiles
    ) {
      throw new Error("F1 internal root coverage failure");
    }
    mortonKeys[index] = morton3d(relativeX, relativeY, relativeZ);
    sourceLeafIndex[index] = index;
  }
  stableSortMorton(mortonKeys, sourceLeafIndex);
  for (let index = 1; index < leafCount; index++) {
    if (mortonKeys[index] === mortonKeys[index - 1]) {
      const duplicate = sourceLeafIndex[index];
      throw new RangeError(
        `duplicate fixed XYZ logical leaf (${tileX[duplicate]}, ${tileY[duplicate]}, ${tileZ[duplicate]})`,
      );
    }
  }

  const leafTileX = new Int32Array(leafCount);
  const leafTileY = new Int32Array(leafCount);
  const leafTileZ = new Int32Array(leafCount);
  const leafPhysicalPartCount = new Uint32Array(leafCount);
  for (let leafOrdinal = 0; leafOrdinal < leafCount; leafOrdinal++) {
    const sourceIndex = sourceLeafIndex[leafOrdinal];
    leafTileX[leafOrdinal] = tileX[sourceIndex];
    leafTileY[leafOrdinal] = tileY[sourceIndex];
    leafTileZ[leafOrdinal] = tileZ[sourceIndex];
    leafPhysicalPartCount[leafOrdinal] = physicalPartCount[sourceIndex];
  }

  const nodeCapacity = leafCount * 2 - 1;
  const nodeParent = new Uint32Array(nodeCapacity);
  const nodeFirstChild = new Uint32Array(nodeCapacity);
  const nodeChildMask = new Uint8Array(nodeCapacity);
  const nodeDepth = new Uint8Array(nodeCapacity);
  const nodePrefixLow = new Uint32Array(nodeCapacity);
  const nodePrefixHigh = new Uint32Array(nodeCapacity);
  const nodeFirstLeaf = new Uint32Array(nodeCapacity);
  const nodeLeafCount = new Uint32Array(nodeCapacity);
  const rangeEnd = new Uint32Array(nodeCapacity);
  const leafNodeIndex = new Uint32Array(leafCount);
  nodeParent.fill(INVALID_NODE_INDEX);
  nodeFirstChild.fill(INVALID_NODE_INDEX);
  nodeLeafCount[0] = leafCount;
  rangeEnd[0] = leafCount;
  let nodeCount = 1;
  let compressedUnaryLevelCount = 0;

  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const firstLeaf = nodeFirstLeaf[nodeIndex];
    const endLeaf = rangeEnd[nodeIndex];
    if (endLeaf - firstLeaf === 1) {
      leafNodeIndex[firstLeaf] = nodeIndex;
      continue;
    }
    const parentDepth = nodeDepth[nodeIndex];
    if (parentDepth >= root.depth) {
      throw new Error("duplicate leaves reached a terminal octree cell");
    }
    const childBase = nodeCount;
    let childMask = 0;
    let groupFirst = firstLeaf;
    while (groupFirst < endLeaf) {
      const childCode = childCodeAtDepth(
        mortonKeys[groupFirst],
        totalBits,
        parentDepth,
      );
      let groupEnd = groupFirst + 1;
      while (
        groupEnd < endLeaf &&
        childCodeAtDepth(mortonKeys[groupEnd], totalBits, parentDepth) ===
          childCode
      ) {
        groupEnd++;
      }
      const groupCount = groupEnd - groupFirst;
      const childDepth =
        groupCount === 1
          ? root.depth
          : commonPrefixDepth(
              mortonKeys[groupFirst],
              mortonKeys[groupEnd - 1],
              totalBits,
            );
      if (
        childDepth <= parentDepth ||
        childDepth > root.depth ||
        nodeCount >= nodeCapacity
      ) {
        throw new Error("F1 invalid Patricia octree child");
      }
      const prefix = prefixAtDepth(
        mortonKeys[groupFirst],
        totalBits,
        childDepth,
      );
      nodeParent[nodeCount] = nodeIndex;
      nodeDepth[nodeCount] = childDepth;
      nodePrefixLow[nodeCount] = Number(prefix & 0xffffffffn);
      nodePrefixHigh[nodeCount] = Number((prefix >> 32n) & 0xffffffffn);
      nodeFirstLeaf[nodeCount] = groupFirst;
      nodeLeafCount[nodeCount] = groupCount;
      rangeEnd[nodeCount] = groupEnd;
      compressedUnaryLevelCount += childDepth - parentDepth - 1;
      childMask |= 1 << childCode;
      nodeCount++;
      groupFirst = groupEnd;
    }
    if (popcount8(childMask) < 2) {
      throw new Error("F1 internal Node must have at least two children");
    }
    nodeFirstChild[nodeIndex] = childBase;
    nodeChildMask[nodeIndex] = childMask;
  }

  return Object.freeze({
    dimension: 3,
    root,
    leafCount,
    nodeCount,
    edgeCount: nodeCount - 1,
    maximumDepth: root.depth,
    compressedUnaryLevelCount,
    sourceLeafIndex,
    leafTileX,
    leafTileY,
    leafTileZ,
    leafPhysicalPartCount,
    leafNodeIndex,
    nodeParent: nodeParent.subarray(0, nodeCount),
    nodeFirstChild: nodeFirstChild.subarray(0, nodeCount),
    nodeChildMask: nodeChildMask.subarray(0, nodeCount),
    nodeDepth: nodeDepth.subarray(0, nodeCount),
    nodePrefixLow: nodePrefixLow.subarray(0, nodeCount),
    nodePrefixHigh: nodePrefixHigh.subarray(0, nodeCount),
    nodeFirstLeaf: nodeFirstLeaf.subarray(0, nodeCount),
    nodeLeafCount: nodeLeafCount.subarray(0, nodeCount),
  });
}

export function estimateSparseHierarchy3dTopologyBytes(leafCount, nodeCount) {
  if (!Number.isSafeInteger(leafCount) || leafCount <= 0) {
    throw new RangeError("leafCount must be a positive safe integer");
  }
  const maximumNodeCount = leafCount * 2 - 1;
  const resolvedNodeCount = nodeCount ?? maximumNodeCount;
  if (
    !Number.isSafeInteger(resolvedNodeCount) ||
    resolvedNodeCount <= 0 ||
    resolvedNodeCount > maximumNodeCount
  ) {
    throw new RangeError("nodeCount exceeds the sparse hierarchy bound");
  }
  const nodeBytes = resolvedNodeCount * 26;
  const leafBytes = leafCount * 20;
  return Object.freeze({
    leafCount,
    nodeCount: resolvedNodeCount,
    nodeBytes,
    leafBytes,
    totalBytes: nodeBytes + leafBytes,
  });
}
