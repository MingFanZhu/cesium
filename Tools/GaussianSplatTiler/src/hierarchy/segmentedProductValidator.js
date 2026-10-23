import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PACK_KIND,
  LAYOUT_KIND,
  PAGE_SEMANTIC,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import { emptyBounds, unionBounds } from "../bounds.js";
import {
  decodeAndValidateSegmentedHierarchyProductInventory,
  outwardFloat32Bounds,
  sha256Bytes,
} from "./segmentedHierarchyInventory.js";
import { planHalfRateSegmentCount } from "./segmentedProxyReducer.js";
import { INVALID_NODE_INDEX } from "./sparseHierarchy.js";
import { prebuiltLodPolicySha256 } from "../prebuiltLodPolicy.js";
import {
  validateCanonicalProductManifest,
  equalBytes,
  deterministicSum,
  coverageTolerance,
  validateBoundedProductPacks,
} from "./segmentedHierarchyProductArtifact.js";
const NODE_PROXY_WORDS = 12,
  REPRESENTATION_WORDS = 24,
  SEGMENT_WORDS = 14;
function popcount8(mask) {
  let n = 0;
  for (let i = 0; i < 8; i++) {
    n += (mask >> i) & 1;
  }
  return n;
}
function mergeBounds(records, field) {
  const b = emptyBounds();
  for (const r of records) {
    unionBounds(b, r[field]);
  }
  return b;
}
export async function validateSegmentedProductStructure(
  directory,
  { expectedSourceSha256, expectedPolicySha256, onDuringPackValidation } = {},
) {
  const mciBytes = await readFile(path.join(directory, "scene.mci"));
  await validateCanonicalProductManifest(directory, mciBytes);
  if (
    !(expectedPolicySha256 instanceof Uint8Array) ||
    expectedPolicySha256.length !== 32
  ) {
    throw new Error("An explicit 32-byte producer policy is required");
  }
  const currentPolicySha256 = expectedPolicySha256;
  const decoded = decodeAndValidateSegmentedHierarchyProductInventory(
    mciBytes,
    {
      expectedSourceSha256,
      expectedPolicySha256: currentPolicySha256,
    },
  );
  if (
    expectedPolicySha256 !== undefined &&
    !equalBytes(expectedPolicySha256, currentPolicySha256)
  ) {
    throw new Error("SCALE-1A caller policy identity mismatch");
  }
  const expectedMaximumAssetSplats = decoded.header.maximumAssetSplats;
  // External LODs retain their actual counts. Only this explicit producer may
  // pass through a child or import a segment satisfying the existing runtime
  // refinement bound; CPU/distillation products retain the exact-half contract.
  const importedLods = equalBytes(
    currentPolicySha256,
    prebuiltLodPolicySha256(decoded.header.cellSizeMeters),
  );
  const nodeTopologySection = decoded.sectionByKind[1];
  const nodeContentSection = decoded.sectionByKind[2];
  const nodeProxySection = decoded.sectionByKind[3];
  const leafTopologySection = decoded.sectionByKind[4];
  const leafContentSection = decoded.sectionByKind[5];
  const leafLevelSection = decoded.sectionByKind[6];
  const representationSection = decoded.sectionByKind[7];
  const segmentSection = decoded.sectionByKind[8];
  const assetSection = decoded.sectionByKind[9];
  const assetPageIndexSection = decoded.sectionByKind[10];
  const packSection = decoded.sectionByKind[12];
  const pageSection = decoded.sectionByKind[11];
  const representationCount = representationSection.elementCount;
  const segmentCount = segmentSection.elementCount;
  const assetCount = assetSection.elementCount;
  const pageCount = pageSection.elementCount;
  const packCount = packSection.elementCount;
  const readUint64Words = (words, offset) =>
    (BigInt(words[offset + 1]) << 32n) | BigInt(words[offset]);
  const safeUint64Words = (words, offset, label) => {
    const value = readUint64Words(words, offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(`${label} exceeds the host safe integer range`);
    }
    return Number(value);
  };
  const doubleScratch = new DataView(new ArrayBuffer(8));
  const readFloat64Words = (words, offset) => {
    doubleScratch.setUint32(0, words[offset], true);
    doubleScratch.setUint32(4, words[offset + 1], true);
    return doubleScratch.getFloat64(0, true);
  };

  if (segmentCount !== decoded.header.nodeCount - 1) {
    throw new Error("A3 Segment inventory must equal hierarchy edgeCount");
  }
  if (
    representationCount === 0 ||
    assetCount === 0 ||
    pageCount === 0 ||
    packCount === 0 ||
    assetPageIndexSection.elementCount !== pageCount
  ) {
    throw new Error("A3 inventory cardinalities are incomplete");
  }
  const claimedRepresentations = new Uint8Array(representationCount);
  const claimedSegments = new Uint8Array(segmentCount);
  for (let nodeIndex = 0; nodeIndex < decoded.header.nodeCount; nodeIndex++) {
    const proxyOffset = nodeIndex * NODE_PROXY_WORDS;
    const representationId = nodeProxySection.data[proxyOffset];
    const representationOffset = representationId * REPRESENTATION_WORDS;
    if (
      representationId >= representationCount ||
      representationSection.data[representationOffset] !== nodeIndex ||
      readUint64Words(nodeProxySection.data, proxyOffset + 1) !==
        readUint64Words(representationSection.data, representationOffset + 8) ||
      nodeProxySection.data[proxyOffset + 3] !==
        representationSection.data[representationOffset + 10] ||
      nodeProxySection.data[proxyOffset + 4] !==
        representationSection.data[representationOffset + 11] ||
      nodeProxySection.data[proxyOffset + 5] !==
        representationSection.data[representationOffset + 18] ||
      nodeProxySection.data[proxyOffset + 6] !==
        representationSection.data[representationOffset + 19] ||
      nodeProxySection.data[proxyOffset + 7] !==
        representationSection.data[representationOffset + 20] ||
      nodeProxySection.data[proxyOffset + 8] !==
        representationSection.data[representationOffset + 21] ||
      nodeProxySection.data[proxyOffset + 9] !==
        representationSection.data[representationOffset + 22] ||
      nodeProxySection.data[proxyOffset + 10] !==
        representationSection.data[representationOffset + 23] ||
      nodeProxySection.data[proxyOffset + 11] !== 0
    ) {
      throw new Error(`A3 Node ${nodeIndex} proxy authority is invalid`);
    }
    const childMask = nodeTopologySection.data[nodeIndex * 8 + 2] & 0xff;
    if (childMask !== 0) {
      const firstChild = nodeTopologySection.data[nodeIndex * 8 + 1];
      const childCount = popcount8(childMask);
      let childSourceCount = 0n;
      for (let ordinal = 0; ordinal < childCount; ordinal++) {
        childSourceCount += readUint64Words(
          nodeProxySection.data,
          (firstChild + ordinal) * NODE_PROXY_WORDS + 1,
        );
      }
      if (
        childSourceCount !==
        readUint64Words(nodeProxySection.data, proxyOffset + 1)
      ) {
        throw new Error(`A3 Node ${nodeIndex} source conservation failed`);
      }
      if (
        representationSection.data[representationOffset + 7] !== 2 ||
        representationSection.data[representationOffset + 3] !== childCount
      ) {
        throw new Error(`A3 internal Node ${nodeIndex} proxy mode is invalid`);
      }
      const firstSegment = representationSection.data[representationOffset + 2];
      for (let ordinal = 0; ordinal < childCount; ordinal++) {
        const segmentOffset = (firstSegment + ordinal) * SEGMENT_WORDS;
        const childNodeIndex = firstChild + ordinal;
        const childRepresentationId =
          nodeProxySection.data[childNodeIndex * NODE_PROXY_WORDS];
        const childSeedCount =
          representationSection.data[
            childRepresentationId * REPRESENTATION_WORDS + 6
          ];
        const expectedTargetCount = planHalfRateSegmentCount(childSeedCount);
        const actualTargetCount = segmentSection.data[segmentOffset + 3];
        const validTargetCount = importedLods
          ? actualTargetCount > 0 &&
            actualTargetCount <= childSeedCount &&
            childSeedCount <= 2 * actualTargetCount + 1
          : actualTargetCount === expectedTargetCount;
        if (
          firstSegment + ordinal >= segmentCount ||
          claimedSegments[firstSegment + ordinal] !== 0 ||
          segmentSection.data[segmentOffset] !== representationId ||
          segmentSection.data[segmentOffset + 1] !== childNodeIndex ||
          segmentSection.data[segmentOffset + 1] >= decoded.header.nodeCount ||
          !validTargetCount ||
          readUint64Words(segmentSection.data, segmentOffset + 4) !==
            readUint64Words(
              nodeProxySection.data,
              childNodeIndex * NODE_PROXY_WORDS + 1,
            )
        ) {
          throw new Error(
            `A3 internal Node ${nodeIndex} direct-child Segment mapping is invalid`,
          );
        }
        claimedSegments[firstSegment + ordinal] = 1;
      }
    }
    claimedRepresentations[representationId] = 1;
  }
  let representationOrderCursor = 0;
  for (
    let leafOrdinal = 0;
    leafOrdinal < decoded.header.leafCount;
    leafOrdinal++
  ) {
    const leafNodeIndex = leafTopologySection.data[leafOrdinal * 5 + 3];
    let previousRepresentationId = INVALID_NODE_INDEX;
    for (let logicalLevel = 0; logicalLevel < 7; logicalLevel++) {
      const representationId =
        leafLevelSection.data[leafOrdinal * 7 + logicalLevel];
      const representationOffset = representationId * REPRESENTATION_WORDS;
      if (
        representationId >= representationCount ||
        representationSection.data[representationOffset] !== leafNodeIndex ||
        representationSection.data[representationOffset + 1] > logicalLevel ||
        representationSection.data[representationOffset + 1] > 6 ||
        representationSection.data[representationOffset + 7] !== 1
      ) {
        throw new Error("A3 leaf level Representation owner/mode is invalid");
      }
      if (representationId !== previousRepresentationId) {
        if (
          representationId !== representationOrderCursor ||
          representationSection.data[representationOffset + 1] !== logicalLevel
        ) {
          throw new Error("A3 leaf Representation ID order is invalid");
        }
        representationOrderCursor++;
        previousRepresentationId = representationId;
      }
      claimedRepresentations[representationId] = 1;
      if (
        logicalLevel === 6 &&
        nodeProxySection.data[leafNodeIndex * NODE_PROXY_WORDS] !==
          representationId
      ) {
        throw new Error("A3 leaf coarsest Node proxy identity is invalid");
      }
    }
  }
  let segmentOrderCursor = 0;
  for (
    let nodeIndex = decoded.header.nodeCount - 1;
    nodeIndex >= 0;
    nodeIndex--
  ) {
    const childMask = nodeTopologySection.data[nodeIndex * 8 + 2] & 0xff;
    if (childMask === 0) {
      continue;
    }
    const representationId =
      nodeProxySection.data[nodeIndex * NODE_PROXY_WORDS];
    if (
      representationId !== representationOrderCursor ||
      representationSection.data[
        representationId * REPRESENTATION_WORDS + 2
      ] !== segmentOrderCursor
    ) {
      throw new Error("A3 internal Representation/Segment ID order is invalid");
    }
    representationOrderCursor++;
    segmentOrderCursor += popcount8(childMask);
  }
  if (
    representationOrderCursor !== representationCount ||
    segmentOrderCursor !== segmentCount
  ) {
    throw new Error("A3 Representation/Segment ID inventory is incomplete");
  }
  if (claimedRepresentations.some((value) => value !== 1)) {
    throw new Error("A3 Representation inventory contains unreferenced rows");
  }
  if (claimedSegments.some((value) => value !== 1)) {
    throw new Error("A3 Segment inventory is not exactly owned by Nodes");
  }

  const leafPartCountByNode = new Uint32Array(decoded.header.nodeCount);
  for (
    let leafOrdinal = 0;
    leafOrdinal < decoded.header.leafCount;
    leafOrdinal++
  ) {
    const leafOffset = leafOrdinal * 5;
    leafPartCountByNode[leafTopologySection.data[leafOffset + 3]] =
      leafTopologySection.data[leafOffset + 4];
  }
  const claimedAssets = new Uint8Array(assetCount);
  let assetOrderCursor = 0;

  for (
    let representationId = 0;
    representationId < representationCount;
    representationId++
  ) {
    const offset = representationId * REPRESENTATION_WORDS;
    const ownerNodeIndex = representationSection.data[offset];
    const firstSegment = representationSection.data[offset + 2];
    const ownedSegmentCount = representationSection.data[offset + 3];
    const firstAsset = representationSection.data[offset + 4];
    const ownedAssetCount = representationSection.data[offset + 5];
    const splatCount = representationSection.data[offset + 6];
    const mode = representationSection.data[offset + 7];
    const ownerChildMask =
      nodeTopologySection.data[ownerNodeIndex * 8 + 2] & 0xff;
    if (
      ownerNodeIndex >= decoded.header.nodeCount ||
      ![1, 2].includes(mode) ||
      ownedAssetCount === 0 ||
      firstAsset !== assetOrderCursor ||
      firstAsset + ownedAssetCount > assetCount ||
      (mode === 1 &&
        (ownerChildMask !== 0 ||
          representationSection.data[offset + 1] > 6 ||
          firstSegment !== INVALID_NODE_INDEX ||
          ownedSegmentCount !== 0 ||
          ownedAssetCount !== leafPartCountByNode[ownerNodeIndex])) ||
      (mode === 2 &&
        (ownerChildMask === 0 ||
          representationSection.data[offset + 1] !== INVALID_NODE_INDEX ||
          firstSegment + ownedSegmentCount > segmentCount))
    ) {
      throw new Error(`A3 Representation ${representationId} range is invalid`);
    }
    let assetCursor = 0;
    for (let local = 0; local < ownedAssetCount; local++) {
      const assetOffset = (firstAsset + local) * 16;
      if (
        claimedAssets[firstAsset + local] !== 0 ||
        assetSection.data[assetOffset] !== representationId ||
        assetSection.data[assetOffset + 1] !== assetCursor ||
        assetSection.data[assetOffset + 2] === 0 ||
        assetSection.data[assetOffset + 2] > expectedMaximumAssetSplats ||
        (mode === 1 && assetSection.data[assetOffset + 3] !== local) ||
        (mode === 2 &&
          assetSection.data[assetOffset + 3] !== INVALID_NODE_INDEX)
      ) {
        throw new Error(
          `A3 Representation ${representationId} Asset partition is invalid`,
        );
      }
      claimedAssets[firstAsset + local] = 1;
      assetCursor += assetSection.data[assetOffset + 2];
    }
    if (assetCursor !== splatCount) {
      throw new Error(
        `A3 Representation ${representationId} Asset range is incomplete`,
      );
    }
    assetOrderCursor += ownedAssetCount;
    if (mode === 2) {
      let segmentCursor = 0;
      let segmentSourceCount = 0n;
      for (let local = 0; local < ownedSegmentCount; local++) {
        const segmentOffset = (firstSegment + local) * SEGMENT_WORDS;
        if (
          segmentSection.data[segmentOffset] !== representationId ||
          segmentSection.data[segmentOffset + 2] !== segmentCursor ||
          segmentSection.data[segmentOffset + 3] === 0
        ) {
          throw new Error(
            `A3 Representation ${representationId} Segment partition is invalid`,
          );
        }
        segmentCursor += segmentSection.data[segmentOffset + 3];
        segmentSourceCount += readUint64Words(
          segmentSection.data,
          segmentOffset + 4,
        );
      }
      if (
        segmentCursor !== splatCount ||
        segmentSourceCount !==
          readUint64Words(representationSection.data, offset + 8)
      ) {
        throw new Error(
          `A3 Representation ${representationId} Segment range is incomplete`,
        );
      }
    }
  }
  if (
    assetOrderCursor !== assetCount ||
    claimedAssets.some((value) => value !== 1)
  ) {
    throw new Error(
      "A3 Asset inventory is not exactly owned by Representations",
    );
  }

  for (
    let representationId = 0;
    representationId < representationCount;
    representationId++
  ) {
    const offset = representationId * REPRESENTATION_WORDS;
    const firstAsset = representationSection.data[offset + 4];
    const ownedAssetCount = representationSection.data[offset + 5];
    const splatCount = representationSection.data[offset + 6];
    const mode = representationSection.data[offset + 7];
    const representationError = readFloat64Words(
      representationSection.data,
      offset + 10,
    );
    const representationCoverage = readFloat64Words(
      representationSection.data,
      offset + 18,
    );
    const representationP95 = readFloat64Words(
      representationSection.data,
      offset + 20,
    );
    const representationP99 = readFloat64Words(
      representationSection.data,
      offset + 22,
    );
    if (
      !Number.isFinite(representationError) ||
      representationError < 0 ||
      !Number.isFinite(representationCoverage) ||
      representationCoverage <= 0 ||
      !Number.isFinite(representationP95) ||
      !Number.isFinite(representationP99) ||
      representationP95 < 0 ||
      representationP95 > representationP99 ||
      representationP99 > representationError
    ) {
      throw new Error(
        `A4 Representation ${representationId} scalar authority is invalid`,
      );
    }
    const assetCoverage = [];
    for (let local = 0; local < ownedAssetCount; local++) {
      const coverage = readFloat64Words(
        assetSection.data,
        (firstAsset + local) * 16 + 14,
      );
      if (!Number.isFinite(coverage) || coverage <= 0) {
        throw new Error(`A4 Asset ${firstAsset + local} coverage is invalid`);
      }
      assetCoverage.push(coverage);
    }
    const assetCoverageSum = deterministicSum(
      assetCoverage,
      `Representation ${representationId} Asset coverage`,
    );
    if (
      Math.abs(assetCoverageSum - representationCoverage) >
      coverageTolerance(splatCount, representationCoverage)
    ) {
      throw new Error(
        `A4 Representation ${representationId} Asset coverage conservation failed`,
      );
    }
    if (mode === 2) {
      const firstSegment = representationSection.data[offset + 2];
      const ownedSegmentCount = representationSection.data[offset + 3];
      const segmentCoverage = [];
      let maximumSegmentError = 0;
      for (let local = 0; local < ownedSegmentCount; local++) {
        const segmentOffset = (firstSegment + local) * SEGMENT_WORDS;
        const childNodeIndex = segmentSection.data[segmentOffset + 1];
        const coverage = readFloat64Words(
          segmentSection.data,
          segmentOffset + 8,
        );
        const childCoverage = readFloat64Words(
          nodeProxySection.data,
          childNodeIndex * NODE_PROXY_WORDS + 5,
        );
        const segmentError = readFloat64Words(
          segmentSection.data,
          segmentOffset + 6,
        );
        const childError = readFloat64Words(
          nodeProxySection.data,
          childNodeIndex * NODE_PROXY_WORDS + 3,
        );
        const segmentP95 = readFloat64Words(
          segmentSection.data,
          segmentOffset + 10,
        );
        const segmentP99 = readFloat64Words(
          segmentSection.data,
          segmentOffset + 12,
        );
        if (
          !Number.isFinite(coverage) ||
          coverage <= 0 ||
          Math.abs(coverage - childCoverage) >
            coverageTolerance(
              segmentSection.data[segmentOffset + 3],
              childCoverage,
            ) ||
          !Number.isFinite(segmentError) ||
          segmentError < childError ||
          !Number.isFinite(segmentP95) ||
          !Number.isFinite(segmentP99) ||
          segmentP95 < 0 ||
          segmentP95 > segmentP99 ||
          segmentP99 > segmentError
        ) {
          throw new Error(
            `A4 Segment ${firstSegment + local} conservation is invalid`,
          );
        }
        segmentCoverage.push(coverage);
        maximumSegmentError = Math.max(maximumSegmentError, segmentError);
      }
      const segmentCoverageSum = deterministicSum(
        segmentCoverage,
        `Representation ${representationId} Segment coverage`,
      );
      if (
        Math.abs(segmentCoverageSum - representationCoverage) >
          coverageTolerance(splatCount, representationCoverage) ||
        !Object.is(maximumSegmentError, representationError)
      ) {
        throw new Error(
          `A4 Representation ${representationId} Segment authority is invalid`,
        );
      }
    }
  }

  let retainedSplatCount = 0;
  const finestLeafCoverages = [];
  for (
    let leafOrdinal = 0;
    leafOrdinal < decoded.header.leafCount;
    leafOrdinal++
  ) {
    const finestRepresentationId = leafLevelSection.data[leafOrdinal * 7];
    const finestOffset = finestRepresentationId * REPRESENTATION_WORDS;
    const finestCount = representationSection.data[finestOffset + 6];
    const finestSourceCount = readUint64Words(
      representationSection.data,
      finestOffset + 8,
    );
    if (finestSourceCount !== BigInt(finestCount)) {
      throw new Error(
        `A4 leaf ${leafOrdinal} finest represented-source authority is invalid`,
      );
    }
    const finestCoverage = readFloat64Words(
      representationSection.data,
      finestOffset + 18,
    );
    retainedSplatCount += finestCount;
    finestLeafCoverages.push(finestCoverage);
    let previousError = -Infinity;
    let previousP95 = -Infinity;
    let previousP99 = -Infinity;
    let previousRepresentationId = INVALID_NODE_INDEX;
    for (let logicalLevel = 0; logicalLevel < 7; logicalLevel++) {
      const representationId =
        leafLevelSection.data[leafOrdinal * 7 + logicalLevel];
      if (representationId === previousRepresentationId) {
        continue;
      }
      const offset = representationId * REPRESENTATION_WORDS;
      const coverage = readFloat64Words(
        representationSection.data,
        offset + 18,
      );
      const error = readFloat64Words(representationSection.data, offset + 10);
      const p95 = readFloat64Words(representationSection.data, offset + 20);
      const p99 = readFloat64Words(representationSection.data, offset + 22);
      if (
        readUint64Words(representationSection.data, offset + 8) !==
          finestSourceCount ||
        Math.abs(coverage - finestCoverage) >
          coverageTolerance(finestCount, finestCoverage) ||
        error < previousError ||
        p95 < previousP95 ||
        p99 < previousP99
      ) {
        throw new Error(`A4 leaf ${leafOrdinal} LOD conservation is invalid`);
      }
      previousError = error;
      previousP95 = p95;
      previousP99 = p99;
      previousRepresentationId = representationId;
    }
  }
  const sourceCoverageMass = deterministicSum(
    finestLeafCoverages,
    "header leaf coverage",
  );
  const rootCoverage = readFloat64Words(nodeProxySection.data, 5);
  const rootSourceCount = readUint64Words(nodeProxySection.data, 1);
  if (
    retainedSplatCount !== decoded.header.retainedSplatCount ||
    rootSourceCount !== BigInt(decoded.header.retainedSplatCount) ||
    Math.abs(sourceCoverageMass - decoded.header.sourceCoverageMass) >
      coverageTolerance(
        retainedSplatCount,
        decoded.header.sourceCoverageMass,
      ) ||
    Math.abs(rootCoverage - decoded.header.sourceCoverageMass) >
      coverageTolerance(retainedSplatCount, decoded.header.sourceCoverageMass)
  ) {
    throw new Error("A4 header/root source conservation failed");
  }

  let leafSeedSplats = 0n;
  let internalProxySplats = 0n;
  for (let nodeIndex = 0; nodeIndex < decoded.header.nodeCount; nodeIndex++) {
    const representationId =
      nodeProxySection.data[nodeIndex * NODE_PROXY_WORDS];
    const splatCount = BigInt(
      representationSection.data[representationId * REPRESENTATION_WORDS + 6],
    );
    if ((nodeTopologySection.data[nodeIndex * 8 + 2] & 0xff) === 0) {
      leafSeedSplats += splatCount;
    } else {
      internalProxySplats += splatCount;
    }
  }
  const hierarchyBound = importedLods
    ? leafSeedSplats * BigInt(decoded.header.rootDepth)
    : leafSeedSplats + BigInt(segmentCount);
  if (internalProxySplats > hierarchyBound) {
    throw new Error("A3 count-only global hierarchy bound failed");
  }

  const claimedPages = new Uint8Array(pageCount);
  const expectsShPages = decoded.header.maxShDegree > 0;
  let pageListCursor = 0;
  for (let assetId = 0; assetId < assetCount; assetId++) {
    const assetOffset = assetId * 16;
    const assetSplats = assetSection.data[assetOffset + 2];
    const intervalsByKind = [];
    for (const [firstOffset, countOffset, expectedKind] of [
      [10, 11, 1],
      [12, 13, 2],
    ]) {
      const first = assetSection.data[assetOffset + firstOffset];
      const count = assetSection.data[assetOffset + countOffset];
      if (
        first !== pageListCursor ||
        first + count > assetPageIndexSection.elementCount
      ) {
        throw new Error(`A3 Asset ${assetId} Page list is out of range`);
      }
      let cursor = 0;
      const intervals = [];
      for (let local = 0; local < count; local++) {
        const pageId = assetPageIndexSection.data[first + local];
        if (pageId >= pageCount || claimedPages[pageId]) {
          throw new Error(
            `A3 Page ${pageId} does not have unique Asset ownership`,
          );
        }
        claimedPages[pageId] = 1;
        const pageOffset = pageId * 15;
        if (
          pageSection.data[pageOffset] !== assetId ||
          pageSection.data[pageOffset + 1] !== cursor ||
          pageSection.data[pageOffset + 2] === 0 ||
          pageSection.data[pageOffset + 2] > 65536 ||
          pageSection.data[pageOffset + 3] !== expectedKind ||
          pageSection.data[pageOffset + 6] >= packCount ||
          pageSection.data[pageOffset + 14] !== 0
        ) {
          throw new Error(`A3 Asset ${assetId} Page interval is invalid`);
        }
        intervals.push([
          pageSection.data[pageOffset + 1],
          pageSection.data[pageOffset + 2],
        ]);
        cursor += pageSection.data[pageOffset + 2];
      }
      if (
        (count > 0 && cursor !== assetSplats) ||
        (expectedKind === PACK_KIND.CORE && count === 0) ||
        (expectedKind === PACK_KIND.SH && expectsShPages && count === 0)
      ) {
        throw new Error(`A3 Asset ${assetId} Page list is incomplete`);
      }
      intervalsByKind.push(intervals);
      pageListCursor += count;
    }
    if (
      (!expectsShPages && intervalsByKind[1].length !== 0) ||
      (expectsShPages &&
        (intervalsByKind[0].length !== intervalsByKind[1].length ||
          intervalsByKind[0].some(
            (interval, index) =>
              interval[0] !== intervalsByKind[1][index][0] ||
              interval[1] !== intervalsByKind[1][index][1],
          )))
    ) {
      throw new Error(`A4 Asset ${assetId} Core/SH intervals do not align`);
    }
  }
  if (
    pageListCursor !== assetPageIndexSection.elementCount ||
    claimedPages.some((value) => value !== 1)
  ) {
    throw new Error("A3 Page inventory has unclaimed records");
  }

  const pages = [];
  let pageOrderKind = PACK_KIND.CORE;
  let pageOrderAsset = -1;
  for (let index = 0; index < pageSection.elementCount; index++) {
    const offset = index * 15;
    const assetId = pageSection.data[offset];
    const kind = pageSection.data[offset + 3];
    if (
      kind < pageOrderKind ||
      kind > PACK_KIND.SH ||
      (kind === pageOrderKind && assetId < pageOrderAsset)
    ) {
      throw new Error("A3 Page ID packing order is invalid");
    }
    if (kind !== pageOrderKind) {
      pageOrderKind = kind;
    }
    pageOrderAsset = assetId;
    pages.push({
      pageIndex: index,
      packIndex: pageSection.data[offset + 6],
      offset: safeUint64Words(pageSection.data, offset + 7, "Page offset"),
      storedBytes: safeUint64Words(
        pageSection.data,
        offset + 9,
        "Page storedBytes",
      ),
      checksum: pageSection.data[offset + 13],
    });
  }
  const packs = [];
  let packPageCursor = 0;
  for (let index = 0; index < packSection.elementCount; index++) {
    const offset = index * 10;
    const kind = packSection.data[offset];
    packs.push({
      packIndex: index,
      fileName: `scene.${kind === 1 ? "core" : "sh"}.${String(index).padStart(3, "0")}.gsp`,
      kind,
      layoutId: packSection.data[offset + 1],
      firstPage: packSection.data[offset + 2],
      pageCount: packSection.data[offset + 3],
      splatCount: safeUint64Words(
        packSection.data,
        offset + 4,
        "Pack splatCount",
      ),
      fileBytes: safeUint64Words(
        packSection.data,
        offset + 6,
        "Pack fileBytes",
      ),
      checksum: packSection.data[offset + 8],
    });
    const firstPage = packSection.data[offset + 2];
    const ownedPageCount = packSection.data[offset + 3];
    if (
      ![PACK_KIND.CORE, PACK_KIND.SH].includes(kind) ||
      packSection.data[offset + 9] !== index ||
      ownedPageCount === 0 ||
      firstPage !== packPageCursor ||
      firstPage + ownedPageCount > pageCount
    ) {
      throw new Error(`A3 Pack ${index} Page range is invalid`);
    }
    let packSplatCount = 0;
    for (
      let pageId = firstPage;
      pageId < firstPage + ownedPageCount;
      pageId++
    ) {
      if (pageSection.data[pageId * 15 + 6] !== index) {
        throw new Error(
          `A3 Pack ${index} does not own a contiguous Page range`,
        );
      }
      const pageOffset = pageId * 15;
      const pageLayout = pageSection.data[pageOffset + 5];
      const pageSemantic = pageSection.data[pageOffset + 4];
      const pageKind = pageSection.data[pageOffset + 3];
      const pageSplats = pageSection.data[pageOffset + 2];
      const expectedRawBytes = pageSplats * [0, 32, 16, 32, 64][pageLayout];
      if (
        pageKind !== kind ||
        pageLayout !== packSection.data[offset + 1] ||
        pageLayout < LAYOUT_KIND.EXT_CORE_32 ||
        pageLayout > LAYOUT_KIND.EXT_SH3_64 ||
        (kind === PACK_KIND.CORE &&
          (pageSemantic !== PAGE_SEMANTIC.CORE ||
            pageLayout !== LAYOUT_KIND.EXT_CORE_32)) ||
        (kind === PACK_KIND.SH &&
          (pageSemantic < PAGE_SEMANTIC.SH1 ||
            pageSemantic > PAGE_SEMANTIC.SH3 ||
            pageSemantic !== pageLayout ||
            pageLayout !== decoded.header.maxShDegree + 1)) ||
        safeUint64Words(pageSection.data, pageOffset + 11, "Page rawBytes") !==
          expectedRawBytes ||
        pages[pageId].storedBytes !== expectedRawBytes
      ) {
        throw new Error(`A3 Page ${pageId} Pack ABI is invalid`);
      }
      packSplatCount += pageSplats;
    }
    if (packSplatCount !== packs[index].splatCount) {
      throw new Error(`A3 Pack ${index} splat range is incomplete`);
    }
    packPageCursor += ownedPageCount;
  }
  if (packs.length !== packCount || packPageCursor !== pageCount) {
    throw new Error("A3 Pack inventory cardinality mismatch");
  }
  const bounded = await validateBoundedProductPacks(decoded, directory, {
    onDuringPackValidation,
  });
  const rootRepresentationId = nodeProxySection.data[0];
  const rootRepresentationOffset = rootRepresentationId * REPRESENTATION_WORDS;
  const rootOrigin = [0, 1, 2].map((component) =>
    readFloat64Words(
      representationSection.data,
      rootRepresentationOffset + 12 + component * 2,
    ),
  );
  function assertStoredBounds(sectionData, offset, expected, label) {
    const projected = outwardFloat32Bounds(expected, rootOrigin);
    for (let component = 0; component < 6; component++) {
      if (!Object.is(sectionData[offset + component], projected[component])) {
        throw new Error(`${label} is not the exact encoded-byte union`);
      }
    }
  }
  const expectedNodeBounds = new Array(decoded.header.nodeCount);
  for (
    let leafOrdinal = 0;
    leafOrdinal < decoded.header.leafCount;
    leafOrdinal++
  ) {
    const distinctRepresentationIds = new Set(
      leafLevelSection.data.subarray(leafOrdinal * 7, leafOrdinal * 7 + 7),
    );
    const strictRecords = [];
    for (const representationId of distinctRepresentationIds) {
      const representationOffset = representationId * REPRESENTATION_WORDS;
      const firstAsset = representationSection.data[representationOffset + 4];
      const ownedAssetCount =
        representationSection.data[representationOffset + 5];
      for (let local = 0; local < ownedAssetCount; local++) {
        strictRecords.push({
          bounds: bounded.assetStrictBounds[firstAsset + local],
        });
      }
    }
    const finestRepresentationId = leafLevelSection.data[leafOrdinal * 7];
    const finestOffset = finestRepresentationId * REPRESENTATION_WORDS;
    const finestFirstAsset = representationSection.data[finestOffset + 4];
    const finestAssetCount = representationSection.data[finestOffset + 5];
    const positionRecords = Array.from(
      { length: finestAssetCount },
      (_, local) => ({
        bounds: bounded.assetPositionBounds[finestFirstAsset + local],
      }),
    );
    const selectionBounds = mergeBounds(positionRecords, "bounds");
    const strictBounds = mergeBounds(strictRecords, "bounds");
    assertStoredBounds(
      leafContentSection.data,
      leafOrdinal * 12,
      selectionBounds,
      `Leaf ${leafOrdinal} selection bounds`,
    );
    assertStoredBounds(
      leafContentSection.data,
      leafOrdinal * 12 + 6,
      strictBounds,
      `Leaf ${leafOrdinal} strict bounds`,
    );
    expectedNodeBounds[leafTopologySection.data[leafOrdinal * 5 + 3]] =
      strictBounds;
  }
  for (
    let nodeIndex = decoded.header.nodeCount - 1;
    nodeIndex >= 0;
    nodeIndex--
  ) {
    const nodeOffset = nodeIndex * 8;
    const childMask = nodeTopologySection.data[nodeOffset + 2] & 0xff;
    if (childMask !== 0) {
      const firstChild = nodeTopologySection.data[nodeOffset + 1];
      const childCount = popcount8(childMask);
      const records = Array.from({ length: childCount }, (_, local) => ({
        bounds: expectedNodeBounds[firstChild + local],
      }));
      const representationId =
        nodeProxySection.data[nodeIndex * NODE_PROXY_WORDS];
      const representationOffset = representationId * REPRESENTATION_WORDS;
      const firstAsset = representationSection.data[representationOffset + 4];
      const ownedAssetCount =
        representationSection.data[representationOffset + 5];
      for (let local = 0; local < ownedAssetCount; local++) {
        records.push({ bounds: bounded.assetStrictBounds[firstAsset + local] });
      }
      expectedNodeBounds[nodeIndex] = mergeBounds(records, "bounds");
    }
    assertStoredBounds(
      nodeContentSection.data,
      nodeIndex * 6,
      expectedNodeBounds[nodeIndex],
      `Node ${nodeIndex} bounds`,
    );
  }
  return Object.freeze({
    decoded,
    mciSha256: sha256Bytes(mciBytes),
    validator: bounded.validator,
    packs: bounded.packs,
  });
}
