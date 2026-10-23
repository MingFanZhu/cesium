/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
import {
  decodeSparseHierarchyIndexSkeleton,
  SEGMENTED_HIERARCHY_COMPONENT_TYPE as TYPE,
  SEGMENTED_HIERARCHY_SECTION_KIND as KIND,
} from "./_SceneGISGaussianSegmentedHierarchyIndex.js";
import { asUint8Array } from "./_SceneGISGaussianFormatsBinary.js";
import {
  GSP_HEADER_BYTES,
  LAYOUT_KIND,
  PACK_KIND,
  PAGE_ALIGNMENT,
  PAGE_SEMANTIC,
} from "./_SceneGISGaussianFormatsConstants.js";
import { crc32WithZeroedRanges } from "./_SceneGISGaussianFormatsCrc32.js";

const INVALID_INDEX = 0xffffffff;
const NODE_PROXY_WORDS = 12;
const REPRESENTATION_WORDS = 24;
const SEGMENT_WORDS = 14;
export const SEGMENTED_VISUAL_ERROR_METRIC = Object.freeze({
  COVERAGE_P95: "COVERAGE_P95",
  COVERAGE_P99: "COVERAGE_P99",
});
const REQUIRED_SHAPES = Object.freeze([
  Object.freeze([KIND.NODE_TOPOLOGY, TYPE.UINT32, 8]),
  Object.freeze([KIND.NODE_CONTENT_BOUNDS, TYPE.FLOAT32, 6]),
  Object.freeze([KIND.NODE_PROXY, TYPE.UINT32, NODE_PROXY_WORDS]),
  Object.freeze([KIND.LEAF_TOPOLOGY, TYPE.UINT32, 5]),
  Object.freeze([KIND.LEAF_CONTENT_BOUNDS, TYPE.FLOAT32, 12]),
  Object.freeze([KIND.LEAF_LEVEL_REPRESENTATIONS, TYPE.UINT32, 7]),
  Object.freeze([KIND.REPRESENTATIONS, TYPE.UINT32, REPRESENTATION_WORDS]),
  Object.freeze([KIND.SEGMENTS, TYPE.UINT32, SEGMENT_WORDS]),
  Object.freeze([KIND.ASSETS, TYPE.UINT32, 16]),
  Object.freeze([KIND.ASSET_PAGE_INDICES, TYPE.UINT32, 1]),
  Object.freeze([KIND.PAGES, TYPE.UINT32, 15]),
  Object.freeze([KIND.PACKS, TYPE.UINT32, 10]),
]);

const runtimeIndexInternals = new WeakMap();

function frozenFiniteArray(values, length, label) {
  if (
    !Array.isArray(values) ||
    values.length !== length ||
    !values.every(Number.isFinite)
  ) {
    throw new TypeError(`${label} must contain ${length} finite values`);
  }
  return Object.freeze([...values]);
}

function sameArray(left, right) {
  return (
    Array.isArray(left) &&
    Object.isFrozen(left) &&
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  );
}

function requireScratch(scratch, constructor, length, label) {
  if (!(scratch instanceof constructor) || scratch.length < length) {
    throw new TypeError(
      `${label} scratch must be ${constructor.name}[${length}]`,
    );
  }
}

function requireIndex(value, count, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= count) {
    throw new RangeError(`${label} is out of range`);
  }
}

function popcount8(mask) {
  let count = 0;
  for (let ordinal = 0; ordinal < 8; ordinal++) {
    count += (mask >> ordinal) & 1;
  }
  return count;
}

function readUint64(words, offset, label) {
  const value = (BigInt(words[offset + 1]) << 32n) | BigInt(words[offset]);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return Number(value);
}

function readDouble(view, wordOffset, label) {
  const value = view.getFloat64(wordOffset * 4, true);
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
  return value;
}

function exactAdd(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return value;
}

function coverageTolerance(count, mass) {
  return 64 * Number.EPSILON * Math.max(1, count) * Math.max(1, Math.abs(mass));
}

function coverageNearlyEqual(left, right, count) {
  return Math.abs(left - right) <= coverageTolerance(count, right);
}

function bytesToWords(source, policy, checksum) {
  const words = new Uint32Array(17);
  const sourceView = new DataView(
    source.buffer,
    source.byteOffset,
    source.byteLength,
  );
  const policyView = new DataView(
    policy.buffer,
    policy.byteOffset,
    policy.byteLength,
  );
  for (let index = 0; index < 8; index++) {
    words[index] = sourceView.getUint32(index * 4, true);
    words[index + 8] = policyView.getUint32(index * 4, true);
  }
  words[16] = checksum;
  return words;
}

function bytesToHex(bytes) {
  let result = "";
  for (const value of bytes) {
    result += value.toString(16).padStart(2, "0");
  }
  return result;
}

function sectionView(decoded, kind) {
  return decoded.sectionByKind[kind].data;
}

function sectionDataView(words) {
  return new DataView(words.buffer, words.byteOffset, words.byteLength);
}

function representationScalar(internal, representationId, field) {
  return internal.representations[
    representationId * REPRESENTATION_WORDS + field
  ];
}

function representationCount(internal, representationId) {
  return representationScalar(internal, representationId, 6);
}

function representationSourceCount(internal, representationId) {
  return readUint64(
    internal.representations,
    representationId * REPRESENTATION_WORDS + 8,
    `Representation ${representationId} represented source count`,
  );
}

function representationError(internal, representationId) {
  return readDouble(
    internal.representationView,
    representationId * REPRESENTATION_WORDS + 10,
    `Representation ${representationId} geometric error`,
  );
}

function representationCoverage(internal, representationId) {
  return readDouble(
    internal.representationView,
    representationId * REPRESENTATION_WORDS + 18,
    `Representation ${representationId} coverage`,
  );
}

function visualErrorWordOffset(metric, p95Offset, p99Offset) {
  if (metric === SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P95) {
    return p95Offset;
  }
  if (metric === SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P99) {
    return p99Offset;
  }
  throw new RangeError(
    "Visual error metric must be COVERAGE_P95 or COVERAGE_P99",
  );
}

function representationVisualError(internal, representationId, metric) {
  return readDouble(
    internal.representationView,
    representationId * REPRESENTATION_WORDS +
      visualErrorWordOffset(metric, 20, 22),
    `Representation ${representationId} visual error`,
  );
}

function segmentVisualError(internal, segmentId, metric) {
  return readDouble(
    internal.segmentView,
    segmentId * SEGMENT_WORDS + visualErrorWordOffset(metric, 10, 12),
    `Segment ${segmentId} visual error`,
  );
}

function nodeProxySourceCount(internal, nodeIndex) {
  return readUint64(
    internal.nodeProxies,
    nodeIndex * NODE_PROXY_WORDS + 1,
    `Node ${nodeIndex} represented source count`,
  );
}

function nodeProxyError(internal, nodeIndex) {
  return readDouble(
    internal.nodeProxyView,
    nodeIndex * NODE_PROXY_WORDS + 3,
    `Node ${nodeIndex} proxy error`,
  );
}

function nodeProxyCoverage(internal, nodeIndex) {
  return readDouble(
    internal.nodeProxyView,
    nodeIndex * NODE_PROXY_WORDS + 5,
    `Node ${nodeIndex} proxy coverage`,
  );
}

function validateRequiredShapes(decoded) {
  if (decoded.sections.length !== REQUIRED_SHAPES.length) {
    throw new Error("SCALE-1B Runtime Index requires exactly twelve sections");
  }
  for (const [kind, componentType, componentCount] of REQUIRED_SHAPES) {
    const section = decoded.sectionByKind[kind];
    if (
      section === undefined ||
      !section.required ||
      section.componentType !== componentType ||
      section.componentCount !== componentCount
    ) {
      throw new Error(`SCALE-1B section ${kind} shape is invalid`);
    }
  }
  for (const kind of [
    KIND.NODE_TOPOLOGY,
    KIND.NODE_CONTENT_BOUNDS,
    KIND.NODE_PROXY,
  ]) {
    if (decoded.sectionByKind[kind].elementCount !== decoded.header.nodeCount) {
      throw new Error(`SCALE-1B Node section ${kind} count is invalid`);
    }
  }
  for (const kind of [
    KIND.LEAF_TOPOLOGY,
    KIND.LEAF_CONTENT_BOUNDS,
    KIND.LEAF_LEVEL_REPRESENTATIONS,
  ]) {
    if (decoded.sectionByKind[kind].elementCount !== decoded.header.leafCount) {
      throw new Error(`SCALE-1B leaf section ${kind} count is invalid`);
    }
  }
}

function validateRepresentationScalar(internal, representationId) {
  const count = representationCount(internal, representationId);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new RangeError(`Representation ${representationId} count is invalid`);
  }
  representationSourceCount(internal, representationId);
  const error = representationError(internal, representationId);
  const p95 = representationVisualError(
    internal,
    representationId,
    SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P95,
  );
  const p99 = representationVisualError(
    internal,
    representationId,
    SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P99,
  );
  const coverage = representationCoverage(internal, representationId);
  if (error < 0 || p95 < 0 || p95 > p99 || p99 > error || coverage <= 0) {
    throw new RangeError(
      `Representation ${representationId} scalar is invalid`,
    );
  }
}

function validateRuntimeSemantics(internal) {
  const {
    nodeCount,
    leafCount,
    representationCount: representationTotal,
    segmentCount,
    nodes,
    nodeProxies,
    leaves,
    leafLevels,
    representations,
    segments,
  } = internal;
  if (representationTotal === 0 || segmentCount !== nodeCount - 1) {
    throw new Error("SCALE-1B Representation/Segment cardinality is invalid");
  }

  for (
    let representationId = 0;
    representationId < representationTotal;
    representationId++
  ) {
    validateRepresentationScalar(internal, representationId);
  }

  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const proxyOffset = nodeIndex * NODE_PROXY_WORDS;
    const representationId = nodeProxies[proxyOffset];
    if (
      representationId >= representationTotal ||
      representations[representationId * REPRESENTATION_WORDS] !== nodeIndex ||
      nodeProxies[proxyOffset + 11] !== 0 ||
      nodeProxySourceCount(internal, nodeIndex) !==
        representationSourceCount(internal, representationId) ||
      !Object.is(
        nodeProxyError(internal, nodeIndex),
        representationError(internal, representationId),
      ) ||
      !Object.is(
        nodeProxyCoverage(internal, nodeIndex),
        representationCoverage(internal, representationId),
      ) ||
      !Object.is(
        readDouble(internal.nodeProxyView, proxyOffset + 7, "Node proxy P95"),
        representationVisualError(
          internal,
          representationId,
          SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P95,
        ),
      ) ||
      !Object.is(
        readDouble(internal.nodeProxyView, proxyOffset + 9, "Node proxy P99"),
        representationVisualError(
          internal,
          representationId,
          SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P99,
        ),
      )
    ) {
      throw new Error(`SCALE-1B Node ${nodeIndex} proxy authority is invalid`);
    }
  }

  for (let leafOrdinal = 0; leafOrdinal < leafCount; leafOrdinal++) {
    const leafNodeIndex = leaves[leafOrdinal * 5 + 3];
    let previousId = INVALID_INDEX;
    let coarserCount = -1;
    let coarserError = Infinity;
    let coarserP95 = Infinity;
    let coarserP99 = Infinity;
    const finestId = leafLevels[leafOrdinal * 7];
    const finestCount = representationCount(internal, finestId);
    const finestSourceCount = representationSourceCount(internal, finestId);
    const finestCoverage = representationCoverage(internal, finestId);
    if (finestSourceCount !== finestCount) {
      throw new Error(`SCALE-1B leaf ${leafOrdinal} finest count is invalid`);
    }
    for (let logicalLevel = 0; logicalLevel < 7; logicalLevel++) {
      const representationId = leafLevels[leafOrdinal * 7 + logicalLevel];
      if (representationId >= representationTotal) {
        throw new Error(
          `SCALE-1B leaf ${leafOrdinal} Representation is out of range`,
        );
      }
      const offset = representationId * REPRESENTATION_WORDS;
      if (
        representations[offset] !== leafNodeIndex ||
        representations[offset + 1] > logicalLevel ||
        representations[offset + 2] !== INVALID_INDEX ||
        representations[offset + 3] !== 0 ||
        representations[offset + 7] !== 1 ||
        representationSourceCount(internal, representationId) !==
          finestSourceCount ||
        !coverageNearlyEqual(
          representationCoverage(internal, representationId),
          finestCoverage,
          finestCount,
        )
      ) {
        throw new Error(
          `SCALE-1B leaf ${leafOrdinal} alias authority is invalid`,
        );
      }
      if (
        representationId !== previousId &&
        representations[offset + 1] !== logicalLevel
      ) {
        throw new Error(`SCALE-1B leaf ${leafOrdinal} alias order is invalid`);
      }
      previousId = representationId;
    }
    if (
      nodeProxies[leafNodeIndex * NODE_PROXY_WORDS] !==
      leafLevels[leafOrdinal * 7 + 6]
    ) {
      throw new Error(`SCALE-1B leaf ${leafOrdinal} coarsest proxy is invalid`);
    }
    previousId = INVALID_INDEX;
    for (let logicalLevel = 6; logicalLevel >= 0; logicalLevel--) {
      const representationId = leafLevels[leafOrdinal * 7 + logicalLevel];
      if (representationId === previousId) {
        continue;
      }
      const count = representationCount(internal, representationId);
      const error = representationError(internal, representationId);
      const p95 = representationVisualError(
        internal,
        representationId,
        SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P95,
      );
      const p99 = representationVisualError(
        internal,
        representationId,
        SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P99,
      );
      if (
        count < coarserCount ||
        error > coarserError ||
        p95 > coarserP95 ||
        p99 > coarserP99
      ) {
        throw new Error(
          `SCALE-1B leaf ${leafOrdinal} LOD monotonicity is invalid`,
        );
      }
      coarserCount = count;
      coarserError = error;
      coarserP95 = p95;
      coarserP99 = p99;
      previousId = representationId;
    }
  }

  const claimedSegments = new Uint8Array(segmentCount);
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const nodeOffset = nodeIndex * 8;
    const childMask = nodes[nodeOffset + 2] & 0xff;
    if (childMask === 0) {
      continue;
    }
    const representationId = nodeProxies[nodeIndex * NODE_PROXY_WORDS];
    const representationOffset = representationId * REPRESENTATION_WORDS;
    const firstChild = nodes[nodeOffset + 1];
    const childCount = popcount8(childMask);
    const firstSegment = representations[representationOffset + 2];
    if (
      representations[representationOffset + 1] !== INVALID_INDEX ||
      representations[representationOffset + 3] !== childCount ||
      representations[representationOffset + 7] !== 2 ||
      firstSegment + childCount > segmentCount
    ) {
      throw new Error(
        `SCALE-1B internal Node ${nodeIndex} Representation is invalid`,
      );
    }
    let rangeCursor = 0;
    let sourceCount = 0;
    let maximumSegmentError = 0;
    let segmentCoverageSum = 0;
    for (let ordinal = 0; ordinal < childCount; ordinal++) {
      const segmentId = firstSegment + ordinal;
      const segmentOffset = segmentId * SEGMENT_WORDS;
      const childNodeIndex = firstChild + ordinal;
      const childRepresentationId =
        nodeProxies[childNodeIndex * NODE_PROXY_WORDS];
      const childProxyCount = representationCount(
        internal,
        childRepresentationId,
      );
      const rangeCount = segments[segmentOffset + 3];
      const segmentSourceCount = readUint64(
        segments,
        segmentOffset + 4,
        `Segment ${segmentId} represented source count`,
      );
      const segmentError = readDouble(
        internal.segmentView,
        segmentOffset + 6,
        `Segment ${segmentId} error`,
      );
      const segmentCoverage = readDouble(
        internal.segmentView,
        segmentOffset + 8,
        `Segment ${segmentId} coverage`,
      );
      const segmentP95 = segmentVisualError(
        internal,
        segmentId,
        SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P95,
      );
      const segmentP99 = segmentVisualError(
        internal,
        segmentId,
        SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P99,
      );
      if (
        claimedSegments[segmentId] !== 0 ||
        segments[segmentOffset] !== representationId ||
        segments[segmentOffset + 1] !== childNodeIndex ||
        segments[segmentOffset + 2] !== rangeCursor ||
        rangeCount === 0 ||
        segmentSourceCount !== nodeProxySourceCount(internal, childNodeIndex) ||
        segmentError < nodeProxyError(internal, childNodeIndex) ||
        segmentP95 < 0 ||
        segmentP95 > segmentP99 ||
        segmentP99 > segmentError ||
        segmentCoverage <= 0 ||
        !coverageNearlyEqual(
          segmentCoverage,
          nodeProxyCoverage(internal, childNodeIndex),
          rangeCount,
        ) ||
        childProxyCount > 2 * rangeCount + 1
      ) {
        throw new Error(`SCALE-1B Segment ${segmentId} authority is invalid`);
      }
      claimedSegments[segmentId] = 1;
      rangeCursor = exactAdd(
        rangeCursor,
        rangeCount,
        "Segment range partition",
      );
      sourceCount = exactAdd(
        sourceCount,
        segmentSourceCount,
        "Node source conservation",
      );
      maximumSegmentError = Math.max(maximumSegmentError, segmentError);
      segmentCoverageSum += segmentCoverage;
      if (!Number.isFinite(segmentCoverageSum) || segmentCoverageSum <= 0) {
        throw new Error(`SCALE-1B Segment ${segmentId} coverage is invalid`);
      }
    }
    if (
      rangeCursor !== representationCount(internal, representationId) ||
      sourceCount !== nodeProxySourceCount(internal, nodeIndex) ||
      !coverageNearlyEqual(
        segmentCoverageSum,
        representationCoverage(internal, representationId),
        representationCount(internal, representationId),
      ) ||
      !Object.is(
        maximumSegmentError,
        representationError(internal, representationId),
      )
    ) {
      throw new Error(
        `SCALE-1B internal Node ${nodeIndex} conservation is invalid`,
      );
    }
  }
  if (claimedSegments.some((value) => value !== 1)) {
    throw new Error("SCALE-1B Segment inventory is not exactly owned");
  }

  let retainedSplatCount = 0;
  let finestLeafCoverageSum = 0;
  for (let leafOrdinal = 0; leafOrdinal < leafCount; leafOrdinal++) {
    const finestId = leafLevels[leafOrdinal * 7];
    retainedSplatCount = exactAdd(
      retainedSplatCount,
      representationCount(internal, finestId),
      "retained Splat count",
    );
    finestLeafCoverageSum += representationCoverage(internal, finestId);
    if (!Number.isFinite(finestLeafCoverageSum) || finestLeafCoverageSum <= 0) {
      throw new Error("SCALE-1B finest leaf coverage sum is invalid");
    }
  }
  const rootSourceCount = nodeProxySourceCount(internal, 0);
  const rootCoverage = nodeProxyCoverage(internal, 0);
  if (
    retainedSplatCount !== internal.retainedSplatCount ||
    rootSourceCount !== internal.retainedSplatCount ||
    !coverageNearlyEqual(
      finestLeafCoverageSum,
      internal.sourceCoverageMass,
      retainedSplatCount,
    ) ||
    !coverageNearlyEqual(
      rootCoverage,
      internal.sourceCoverageMass,
      retainedSplatCount,
    )
  ) {
    throw new Error("SCALE-1B header/root source conservation is invalid");
  }
}

function alignPageOffset(value) {
  const remainder = value % PAGE_ALIGNMENT;
  return exactAdd(
    value,
    remainder === 0 ? 0 : PAGE_ALIGNMENT - remainder,
    "Page alignment",
  );
}

function validatePhysicalSemantics(internal) {
  const {
    representationCount,
    assetCount,
    assetPageIndexCount,
    pageCount,
    packCount,
    representations,
    nodes,
    leaves,
    assets,
    assetPageIndices,
    pages,
    packs,
  } = internal;
  const claimedPages = new Uint8Array(pageCount);
  const packClaimedPages = new Uint8Array(pageCount);
  let assetCursor = 0;
  let pageListCursor = 0;
  for (
    let representationId = 0;
    representationId < representationCount;
    representationId++
  ) {
    const representationOffset = representationId * REPRESENTATION_WORDS;
    const firstAsset = representations[representationOffset + 4];
    const ownedAssetCount = representations[representationOffset + 5];
    const representationSplats = representations[representationOffset + 6];
    const mode = representations[representationOffset + 7];
    if (
      ownedAssetCount === 0 ||
      firstAsset !== assetCursor ||
      firstAsset + ownedAssetCount > assetCount
    ) {
      throw new Error(
        `SCALE-1C Representation ${representationId} Asset range is invalid`,
      );
    }
    let representationCursor = 0;
    for (let localAsset = 0; localAsset < ownedAssetCount; localAsset++) {
      const assetId = firstAsset + localAsset;
      const assetOffset = assetId * 16;
      const assetSplats = assets[assetOffset + 2];
      if (
        assets[assetOffset] !== representationId ||
        assets[assetOffset + 1] !== representationCursor ||
        assetSplats === 0 ||
        assetSplats > internal.maximumAssetSplats
      ) {
        throw new Error(`SCALE-1C Asset ${assetId} authority is invalid`);
      }
      const ownerNode = representations[representationOffset];
      if (mode === 1) {
        const nodeOffset = ownerNode * 8;
        const leafOrdinal = nodes[nodeOffset + 5];
        if (
          (nodes[nodeOffset + 2] & 0xff) !== 0 ||
          leaves[leafOrdinal * 5 + 3] !== ownerNode ||
          ownedAssetCount !== leaves[leafOrdinal * 5 + 4] ||
          assets[assetOffset + 3] !== localAsset
        ) {
          throw new Error(`SCALE-1C Asset ${assetId} leaf part is invalid`);
        }
      } else if (mode !== 2 || assets[assetOffset + 3] !== INVALID_INDEX) {
        throw new Error(`SCALE-1C Asset ${assetId} mode is invalid`);
      }

      for (let role = 0; role < 2; role++) {
        const firstOffset = role === 0 ? 10 : 12;
        const first = assets[assetOffset + firstOffset];
        const count = assets[assetOffset + firstOffset + 1];
        const expectedKind = role === 0 ? PACK_KIND.CORE : PACK_KIND.SH;
        if (
          first !== pageListCursor ||
          first + count > assetPageIndexCount ||
          (role === 0 && count === 0) ||
          (role === 1 && internal.maxShDegree === 0 && count !== 0) ||
          (role === 1 && internal.maxShDegree > 0 && count === 0)
        ) {
          throw new Error(`SCALE-1C Asset ${assetId} Page list is invalid`);
        }
        let pageCursor = 0;
        for (let localPage = 0; localPage < count; localPage++) {
          const pageId = assetPageIndices[first + localPage];
          if (pageId >= pageCount || claimedPages[pageId] !== 0) {
            throw new Error(`SCALE-1C Page ${pageId} Asset owner is invalid`);
          }
          claimedPages[pageId] = 1;
          const pageOffset = pageId * 15;
          const pageSplats = pages[pageOffset + 2];
          const layoutId = pages[pageOffset + 5];
          const expectedLayout =
            role === 0 ? LAYOUT_KIND.EXT_CORE_32 : internal.maxShDegree + 1;
          const expectedSemantic =
            role === 0 ? PAGE_SEMANTIC.CORE : internal.maxShDegree + 1;
          const storedBytes = readUint64(
            pages,
            pageOffset + 9,
            `Page ${pageId} stored bytes`,
          );
          const rawBytes = readUint64(
            pages,
            pageOffset + 11,
            `Page ${pageId} raw bytes`,
          );
          const bytesPerSplat = [0, 32, 16, 32, 64][layoutId];
          if (
            pages[pageOffset] !== assetId ||
            pages[pageOffset + 1] !== pageCursor ||
            pageSplats === 0 ||
            pages[pageOffset + 3] !== expectedKind ||
            pages[pageOffset + 4] !== expectedSemantic ||
            layoutId !== expectedLayout ||
            pages[pageOffset + 6] >= packCount ||
            pages[pageOffset + 14] !== 0 ||
            rawBytes !== pageSplats * bytesPerSplat ||
            storedBytes !== rawBytes
          ) {
            throw new Error(`SCALE-1C Page ${pageId} authority is invalid`);
          }
          pageCursor = exactAdd(pageCursor, pageSplats, "Asset Page interval");
        }
        if (
          (role === 0 || internal.maxShDegree > 0) &&
          pageCursor !== assetSplats
        ) {
          throw new Error(`SCALE-1C Asset ${assetId} Page coverage is invalid`);
        }
        pageListCursor += count;
      }
      const coreFirst = assets[assetOffset + 10];
      const coreCount = assets[assetOffset + 11];
      const shFirst = assets[assetOffset + 12];
      const shCount = assets[assetOffset + 13];
      if (internal.maxShDegree > 0 && coreCount !== shCount) {
        throw new Error(`SCALE-1C Asset ${assetId} Page pairing is invalid`);
      }
      for (let localPage = 0; localPage < shCount; localPage++) {
        const corePage = assetPageIndices[coreFirst + localPage] * 15;
        const shPage = assetPageIndices[shFirst + localPage] * 15;
        if (
          pages[corePage + 1] !== pages[shPage + 1] ||
          pages[corePage + 2] !== pages[shPage + 2]
        ) {
          throw new Error(`SCALE-1C Asset ${assetId} Page pairing is invalid`);
        }
      }
      representationCursor = exactAdd(
        representationCursor,
        assetSplats,
        "Representation Asset interval",
      );
      assetCursor++;
    }
    if (representationCursor !== representationSplats) {
      throw new Error(
        `SCALE-1C Representation ${representationId} Asset coverage is invalid`,
      );
    }
  }
  if (
    assetCursor !== assetCount ||
    pageListCursor !== assetPageIndexCount ||
    claimedPages.some((value) => value !== 1)
  ) {
    throw new Error("SCALE-1C physical inventory ownership is incomplete");
  }

  let packPageCursor = 0;
  for (let packId = 0; packId < packCount; packId++) {
    const packOffset = packId * 10;
    const kind = packs[packOffset];
    const layout = packs[packOffset + 1];
    const firstPage = packs[packOffset + 2];
    const ownedPageCount = packs[packOffset + 3];
    const packSplats = readUint64(packs, packOffset + 4, "Pack splat count");
    const fileBytes = readUint64(packs, packOffset + 6, "Pack file bytes");
    if (
      ![PACK_KIND.CORE, PACK_KIND.SH].includes(kind) ||
      packs[packOffset + 9] !== packId ||
      ownedPageCount === 0 ||
      firstPage !== packPageCursor ||
      firstPage + ownedPageCount > pageCount ||
      fileBytes > internal.maximumPackBytes
    ) {
      throw new Error(`SCALE-1C Pack ${packId} authority is invalid`);
    }
    let expectedOffset = GSP_HEADER_BYTES;
    let splatSum = 0;
    for (
      let pageId = firstPage;
      pageId < firstPage + ownedPageCount;
      pageId++
    ) {
      const pageOffset = pageId * 15;
      const offset = readUint64(pages, pageOffset + 7, "Page offset");
      const storedBytes = readUint64(
        pages,
        pageOffset + 9,
        "Page stored bytes",
      );
      if (
        packClaimedPages[pageId] !== 0 ||
        pages[pageOffset + 6] !== packId ||
        pages[pageOffset + 3] !== kind ||
        pages[pageOffset + 5] !== layout ||
        offset !== alignPageOffset(expectedOffset) ||
        offset + storedBytes > fileBytes
      ) {
        throw new Error(`SCALE-1C Pack ${packId} Page range is invalid`);
      }
      packClaimedPages[pageId] = 1;
      expectedOffset = exactAdd(offset, storedBytes, "Pack Page end");
      splatSum = exactAdd(splatSum, pages[pageOffset + 2], "Pack splat sum");
    }
    if (splatSum !== packSplats || expectedOffset !== fileBytes) {
      throw new Error(`SCALE-1C Pack ${packId} totals are invalid`);
    }
    packPageCursor += ownedPageCount;
  }
  if (
    packPageCursor !== pageCount ||
    packClaimedPages.some((value) => value !== 1)
  ) {
    throw new Error("SCALE-1C Pack inventory ownership is incomplete");
  }
}

function compactMortonComponent(prefix, component) {
  let result = 0n;
  let outputBit = 0n;
  for (let inputBit = BigInt(component); inputBit < 64n; inputBit += 3n) {
    result |= ((prefix >> inputBit) & 1n) << outputBit;
    outputBit++;
  }
  return Number(result);
}

function getInternal(index) {
  const internal = runtimeIndexInternals.get(index);
  if (internal === undefined) {
    throw new TypeError("Expected a segmented hierarchy Runtime Index");
  }
  return internal;
}

class SegmentedHierarchyRuntimeIndex {
  constructor(decoded, internal) {
    const header = decoded.header;
    this.artifactIdentityHex = `${bytesToHex(header.sourceSha256)}:${bytesToHex(
      header.policySha256,
    )}:${decoded.checksum.toString(16).padStart(8, "0")}`;
    this.mciChecksum = decoded.checksum;
    this.byteLength = decoded.byteLength;
    this.mciVersion = 4;
    this.rowSchema = 3;
    this.routeIdentity = "segmented-active-cut-v3";
    this.selectionErrorMetric = SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P99;
    this.rootNodeIndex = 0;
    this.nodeCount = header.nodeCount;
    this.leafCount = header.leafCount;
    this.representationCount =
      decoded.sectionByKind[KIND.REPRESENTATIONS].elementCount;
    this.segmentCount = decoded.sectionByKind[KIND.SEGMENTS].elementCount;
    this.assetCount = decoded.sectionByKind[KIND.ASSETS].elementCount;
    this.assetPageIndexCount =
      decoded.sectionByKind[KIND.ASSET_PAGE_INDICES].elementCount;
    this.pageCount = decoded.sectionByKind[KIND.PAGES].elementCount;
    this.packCount = decoded.sectionByKind[KIND.PACKS].elementCount;
    this.maxShDegree = header.maxShDegree;
    this.maximumAssetSplats = header.maximumAssetSplats;
    this.maximumPackBytes = header.maximumPackBytes;
    this.rootTileX = header.rootTileOrigin[0];
    this.rootTileY = header.rootTileOrigin[1];
    this.rootTileZ = header.rootTileOrigin[2];
    this.rootSizeTiles = header.rootSizeTiles;
    this.rootDepth = header.rootDepth;
    this.fixedGridOriginX = header.fixedGridOrigin[0];
    this.fixedGridOriginY = header.fixedGridOrigin[1];
    this.fixedGridOriginZ = header.fixedGridOrigin[2];
    this.cellSizeMeters = internal.cellSizeMeters;
    this.hierarchyDimension = header.dimension;
    this.coordinateSystem = header.coordinateSystem;
    this.metersPerUnit = header.metersPerUnit;
    this.localOrigin = internal.localOrigin;
    this.localToFixed = internal.localToFixed;
    this.sourceBounds = internal.sourceBounds;
    runtimeIndexInternals.set(this, internal);
    Object.freeze(this);
  }

  writeArtifactIdentity(scratch) {
    requireScratch(scratch, Uint32Array, 17, "artifact identity");
    scratch.set(getInternal(this).artifactIdentityWords, 0);
    return scratch;
  }

  readNodeTopology(nodeIndex, scratch) {
    const internal = getInternal(this);
    requireIndex(nodeIndex, this.nodeCount, "Node index");
    requireScratch(scratch, Uint32Array, 8, "Node topology");
    const offset = nodeIndex * 8;
    const packed = internal.nodes[offset + 2];
    scratch[0] = internal.nodes[offset];
    scratch[1] = internal.nodes[offset + 1];
    scratch[2] = packed & 0xff;
    scratch[3] = (packed >>> 8) & 0xff;
    scratch[4] = internal.nodes[offset + 3];
    scratch[5] = internal.nodes[offset + 4];
    scratch[6] = internal.nodes[offset + 5];
    scratch[7] = internal.nodes[offset + 6];
    return scratch;
  }

  readNodeContentBounds(nodeIndex, scratch) {
    const internal = getInternal(this);
    requireIndex(nodeIndex, this.nodeCount, "Node index");
    requireScratch(scratch, Float64Array, 6, "Node content bounds");
    const offset = nodeIndex * 6;
    for (let component = 0; component < 3; component++) {
      scratch[component] =
        internal.nodeBounds[offset + component] +
        internal.rootOrigin[component];
      scratch[component + 3] =
        internal.nodeBounds[offset + component + 3] +
        internal.rootOrigin[component];
    }
    return scratch;
  }

  readLeafTopology(leafOrdinal, scratch) {
    const internal = getInternal(this);
    requireIndex(leafOrdinal, this.leafCount, "Leaf ordinal");
    requireScratch(scratch, Float64Array, 5, "Leaf topology");
    const offset = leafOrdinal * 5;
    scratch[0] = internal.leaves[offset] | 0;
    scratch[1] = internal.leaves[offset + 1] | 0;
    scratch[2] = internal.leaves[offset + 2] | 0;
    scratch[3] = internal.leaves[offset + 3];
    scratch[4] = internal.leaves[offset + 4];
    return scratch;
  }

  readNodeCellBounds(nodeIndex, scratch) {
    const internal = getInternal(this);
    requireIndex(nodeIndex, this.nodeCount, "Node index");
    requireScratch(scratch, Float64Array, 6, "Node cell bounds");
    const offset = nodeIndex * 8;
    const prefix =
      (BigInt(internal.nodes[offset + 4]) << 32n) |
      BigInt(internal.nodes[offset + 3]);
    const depth = (internal.nodes[offset + 2] >>> 8) & 0xff;
    const sizeTiles = this.rootSizeTiles / 2 ** depth;
    if (!Number.isSafeInteger(sizeTiles) || sizeTiles <= 0) {
      throw new RangeError("Node cell size is invalid");
    }
    const tileX =
      this.rootTileX + compactMortonComponent(prefix, 0) * sizeTiles;
    const tileY =
      this.rootTileY + compactMortonComponent(prefix, 1) * sizeTiles;
    const tileZ =
      this.rootTileZ + compactMortonComponent(prefix, 2) * sizeTiles;
    scratch[0] = this.fixedGridOriginX + tileX * this.cellSizeMeters[0];
    scratch[1] = this.fixedGridOriginY + tileY * this.cellSizeMeters[1];
    scratch[2] = this.fixedGridOriginZ + tileZ * this.cellSizeMeters[2];
    scratch[3] = scratch[0] + sizeTiles * this.cellSizeMeters[0];
    scratch[4] = scratch[1] + sizeTiles * this.cellSizeMeters[1];
    scratch[5] = scratch[2] + sizeTiles * this.cellSizeMeters[2];
    return scratch;
  }

  readNodeProxy(nodeIndex, scratch) {
    const internal = getInternal(this);
    requireIndex(nodeIndex, this.nodeCount, "Node index");
    requireScratch(scratch, Float64Array, 4, "Node proxy");
    const offset = nodeIndex * NODE_PROXY_WORDS;
    scratch[0] = internal.nodeProxies[offset];
    scratch[1] = nodeProxySourceCount(internal, nodeIndex);
    scratch[2] = nodeProxyError(internal, nodeIndex);
    scratch[3] = nodeProxyCoverage(internal, nodeIndex);
    return scratch;
  }

  readRepresentation(representationId, scratch) {
    const internal = getInternal(this);
    requireIndex(
      representationId,
      this.representationCount,
      "Representation id",
    );
    requireScratch(scratch, Float64Array, 12, "Representation");
    const offset = representationId * REPRESENTATION_WORDS;
    for (let component = 0; component < 8; component++) {
      scratch[component] = internal.representations[offset + component];
    }
    scratch[6] = representationCount(internal, representationId);
    scratch[8] = representationSourceCount(internal, representationId);
    scratch[9] = representationError(internal, representationId);
    scratch[10] = representationCoverage(internal, representationId);
    scratch[11] = 0;
    return scratch;
  }

  readRepresentationConservativeError(representationId) {
    const internal = getInternal(this);
    requireIndex(
      representationId,
      this.representationCount,
      "Representation id",
    );
    return representationError(internal, representationId);
  }

  readRepresentationVisualError(representationId, metric) {
    const internal = getInternal(this);
    requireIndex(
      representationId,
      this.representationCount,
      "Representation id",
    );
    return representationVisualError(internal, representationId, metric);
  }

  readRepresentationOrigin(representationId, scratch) {
    const internal = getInternal(this);
    requireIndex(
      representationId,
      this.representationCount,
      "Representation id",
    );
    requireScratch(scratch, Float64Array, 3, "Representation origin");
    const offset = representationId * REPRESENTATION_WORDS;
    scratch[0] = readDouble(
      internal.representationView,
      offset + 12,
      "origin x",
    );
    scratch[1] = readDouble(
      internal.representationView,
      offset + 14,
      "origin y",
    );
    scratch[2] = readDouble(
      internal.representationView,
      offset + 16,
      "origin z",
    );
    return scratch;
  }

  readSegment(segmentId, scratch) {
    const internal = getInternal(this);
    requireIndex(segmentId, this.segmentCount, "Segment id");
    requireScratch(scratch, Float64Array, 7, "Segment");
    const offset = segmentId * SEGMENT_WORDS;
    scratch[0] = internal.segments[offset];
    scratch[1] = internal.segments[offset + 1];
    scratch[2] = internal.segments[offset + 2];
    scratch[3] = internal.segments[offset + 3];
    scratch[4] = readUint64(
      internal.segments,
      offset + 4,
      "Segment source count",
    );
    scratch[5] = readDouble(internal.segmentView, offset + 6, "Segment error");
    scratch[6] = readDouble(
      internal.segmentView,
      offset + 8,
      "Segment coverage",
    );
    return scratch;
  }

  readSegmentConservativeError(segmentId) {
    const internal = getInternal(this);
    requireIndex(segmentId, this.segmentCount, "Segment id");
    return readDouble(
      internal.segmentView,
      segmentId * SEGMENT_WORDS + 6,
      `Segment ${segmentId} conservative error`,
    );
  }

  readSegmentVisualError(segmentId, metric) {
    const internal = getInternal(this);
    requireIndex(segmentId, this.segmentCount, "Segment id");
    return segmentVisualError(internal, segmentId, metric);
  }

  readAsset(assetId, scratch) {
    const internal = getInternal(this);
    requireIndex(assetId, this.assetCount, "Asset id");
    requireScratch(scratch, Float64Array, 8, "Asset");
    const offset = assetId * 16;
    scratch[0] = internal.assets[offset];
    scratch[1] = internal.assets[offset + 1];
    scratch[2] = internal.assets[offset + 2];
    scratch[3] = internal.assets[offset + 3];
    scratch[4] = internal.assets[offset + 10];
    scratch[5] = internal.assets[offset + 11];
    scratch[6] = internal.assets[offset + 12];
    scratch[7] = internal.assets[offset + 13];
    return scratch;
  }

  readAssetPageIndex(listIndex) {
    const internal = getInternal(this);
    requireIndex(listIndex, this.assetPageIndexCount, "Asset Page-list index");
    return internal.assetPageIndices[listIndex];
  }

  readPage(pageId, scratch) {
    const internal = getInternal(this);
    requireIndex(pageId, this.pageCount, "Page id");
    requireScratch(scratch, Float64Array, 11, "Page");
    const offset = pageId * 15;
    for (let field = 0; field < 7; field++) {
      scratch[field] = internal.pages[offset + field];
    }
    scratch[7] = readUint64(internal.pages, offset + 7, "Page offset");
    scratch[8] = readUint64(internal.pages, offset + 9, "Page stored bytes");
    scratch[9] = readUint64(internal.pages, offset + 11, "Page raw bytes");
    scratch[10] = internal.pages[offset + 13];
    return scratch;
  }

  readPack(packId, scratch) {
    const internal = getInternal(this);
    requireIndex(packId, this.packCount, "Pack id");
    requireScratch(scratch, Float64Array, 7, "Pack");
    const offset = packId * 10;
    scratch[0] = internal.packs[offset];
    scratch[1] = internal.packs[offset + 1];
    scratch[2] = internal.packs[offset + 2];
    scratch[3] = internal.packs[offset + 3];
    scratch[4] = readUint64(internal.packs, offset + 4, "Pack splat count");
    scratch[5] = readUint64(internal.packs, offset + 6, "Pack file bytes");
    scratch[6] = internal.packs[offset + 8];
    return scratch;
  }

  leafRepresentationId(leafOrdinal, logicalLevel) {
    const internal = getInternal(this);
    requireIndex(leafOrdinal, this.leafCount, "Leaf ordinal");
    if (
      !Number.isSafeInteger(logicalLevel) ||
      logicalLevel < 0 ||
      logicalLevel > 6
    ) {
      throw new RangeError("Leaf logical level is out of range");
    }
    return internal.leafLevels[leafOrdinal * 7 + logicalLevel];
  }
}

export function decodeSegmentedHierarchyRuntimeIndex(
  bytes,
  expectedIdentity = {},
) {
  const decoded = decodeSparseHierarchyIndexSkeleton(bytes, expectedIdentity);
  validateRequiredShapes(decoded);
  const representations = sectionView(decoded, KIND.REPRESENTATIONS);
  const nodeProxies = sectionView(decoded, KIND.NODE_PROXY);
  const segments = sectionView(decoded, KIND.SEGMENTS);
  const rootRepresentationId = nodeProxies[0];
  if (
    rootRepresentationId >=
    decoded.sectionByKind[KIND.REPRESENTATIONS].elementCount
  ) {
    throw new Error("SCALE-1B root Representation is out of range");
  }
  const representationView = sectionDataView(representations);
  const rootRepresentationOffset = rootRepresentationId * REPRESENTATION_WORDS;
  const internal = {
    artifactBytes: asUint8Array(bytes),
    artifactChecksum: decoded.checksum,
    artifactIdentityWords: bytesToWords(
      decoded.header.sourceSha256,
      decoded.header.policySha256,
      decoded.checksum,
    ),
    nodeCount: decoded.header.nodeCount,
    leafCount: decoded.header.leafCount,
    representationCount:
      decoded.sectionByKind[KIND.REPRESENTATIONS].elementCount,
    segmentCount: decoded.sectionByKind[KIND.SEGMENTS].elementCount,
    assetCount: decoded.sectionByKind[KIND.ASSETS].elementCount,
    assetPageIndexCount:
      decoded.sectionByKind[KIND.ASSET_PAGE_INDICES].elementCount,
    pageCount: decoded.sectionByKind[KIND.PAGES].elementCount,
    packCount: decoded.sectionByKind[KIND.PACKS].elementCount,
    maxShDegree: decoded.header.maxShDegree,
    maximumAssetSplats: decoded.header.maximumAssetSplats,
    maximumPackBytes: decoded.header.maximumPackBytes,
    retainedSplatCount: decoded.header.retainedSplatCount,
    sourceCoverageMass: decoded.header.sourceCoverageMass,
    nodes: sectionView(decoded, KIND.NODE_TOPOLOGY),
    nodeBounds: sectionView(decoded, KIND.NODE_CONTENT_BOUNDS),
    nodeProxies,
    leaves: sectionView(decoded, KIND.LEAF_TOPOLOGY),
    leafLevels: sectionView(decoded, KIND.LEAF_LEVEL_REPRESENTATIONS),
    representations,
    segments,
    assets: sectionView(decoded, KIND.ASSETS),
    assetPageIndices: sectionView(decoded, KIND.ASSET_PAGE_INDICES),
    pages: sectionView(decoded, KIND.PAGES),
    packs: sectionView(decoded, KIND.PACKS),
    nodeProxyView: sectionDataView(nodeProxies),
    representationView,
    segmentView: sectionDataView(segments),
    rootOrigin: Float64Array.of(
      readDouble(
        representationView,
        rootRepresentationOffset + 12,
        "root origin x",
      ),
      readDouble(
        representationView,
        rootRepresentationOffset + 14,
        "root origin y",
      ),
      readDouble(
        representationView,
        rootRepresentationOffset + 16,
        "root origin z",
      ),
    ),
    coordinateSystem: decoded.header.coordinateSystem,
    cellSizeMeters: frozenFiniteArray(
      decoded.header.cellSizeMeters,
      3,
      "cellSizeMeters",
    ),
    metersPerUnit: decoded.header.metersPerUnit,
    localOrigin: frozenFiniteArray(
      decoded.header.localOrigin,
      3,
      "localOrigin",
    ),
    localToFixed: frozenFiniteArray(
      decoded.header.localToFixed,
      16,
      "localToFixed",
    ),
    sourceBounds: frozenFiniteArray(
      decoded.header.sourceBounds,
      6,
      "sourceBounds",
    ),
  };
  validateRuntimeSemantics(internal);
  validatePhysicalSemantics(internal);
  return new SegmentedHierarchyRuntimeIndex(decoded, internal);
}

export function segmentedHierarchyArtifactIdentityEquals(left, right) {
  const leftWords = new Uint32Array(17);
  const rightWords = new Uint32Array(17);
  left.writeArtifactIdentity(leftWords);
  right.writeArtifactIdentity(rightWords);
  for (let index = 0; index < 17; index++) {
    if (leftWords[index] !== rightWords[index]) {
      return false;
    }
  }
  return true;
}

export function validateSegmentedHierarchyRuntimeIndex(index) {
  const internal = runtimeIndexInternals.get(index);
  if (
    !internal ||
    internal.pageCount !== index.pageCount ||
    internal.packCount !== index.packCount ||
    !Number.isSafeInteger(index.pageCount) ||
    index.pageCount < 0 ||
    !Number.isSafeInteger(index.packCount) ||
    index.packCount < 0 ||
    !Number.isSafeInteger(index.byteLength) ||
    index.byteLength < 0 ||
    typeof index.artifactIdentityHex !== "string" ||
    index.artifactIdentityHex.length === 0 ||
    !Number.isSafeInteger(index.mciChecksum) ||
    index.mciChecksum < 0 ||
    index.hierarchyDimension !== 3 ||
    !sameArray(index.cellSizeMeters, internal.cellSizeMeters) ||
    index.coordinateSystem !== internal.coordinateSystem ||
    index.metersPerUnit !== internal.metersPerUnit ||
    !sameArray(index.localOrigin, internal.localOrigin) ||
    !sameArray(index.localToFixed, internal.localToFixed) ||
    !sameArray(index.sourceBounds, internal.sourceBounds) ||
    index.readPage !== SegmentedHierarchyRuntimeIndex.prototype.readPage ||
    index.readPack !== SegmentedHierarchyRuntimeIndex.prototype.readPack ||
    index.readLeafTopology !==
      SegmentedHierarchyRuntimeIndex.prototype.readLeafTopology ||
    index.readRepresentationConservativeError !==
      SegmentedHierarchyRuntimeIndex.prototype
        .readRepresentationConservativeError ||
    index.readRepresentationVisualError !==
      SegmentedHierarchyRuntimeIndex.prototype.readRepresentationVisualError ||
    index.readSegmentConservativeError !==
      SegmentedHierarchyRuntimeIndex.prototype.readSegmentConservativeError ||
    index.readSegmentVisualError !==
      SegmentedHierarchyRuntimeIndex.prototype.readSegmentVisualError ||
    index.writeArtifactIdentity !==
      SegmentedHierarchyRuntimeIndex.prototype.writeArtifactIdentity
  ) {
    throw new TypeError("Expected branded SCALE-1B Runtime Index");
  }
  if (
    crc32WithZeroedRanges(internal.artifactBytes, [[24, 4]]) !==
    internal.artifactChecksum
  ) {
    throw new TypeError("SCALE-1B Runtime Index artifact checksum changed");
  }
  validateRuntimeSemantics(internal);
  validatePhysicalSemantics(internal);
  return index;
}

/** @private */
const _SceneGISGaussianSegmentedHierarchyRuntimeIndex = {
  SEGMENTED_VISUAL_ERROR_METRIC,
  decodeSegmentedHierarchyRuntimeIndex,
  segmentedHierarchyArtifactIdentityEquals,
  validateSegmentedHierarchyRuntimeIndex,
};
export default _SceneGISGaussianSegmentedHierarchyRuntimeIndex;
