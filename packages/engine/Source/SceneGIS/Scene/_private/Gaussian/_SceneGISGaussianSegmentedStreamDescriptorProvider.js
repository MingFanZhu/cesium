/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import DeveloperError from "../../../../Core/DeveloperError.js";
import { PAGE_ALIGNMENT } from "../../../Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";

const providerStates = new WeakMap();

function requireIndex(value, count, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= count) {
    throw new DeveloperError(`${label} is out of range`);
  }
}

function requireSafe(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function exactAdd(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`${label} exceeds the safe integer range`);
  }
  return value;
}

/**
 * On-demand descriptor projection for a branded segmented Runtime Index.
 *
 * @alias _SceneGISGaussianSegmentedStreamDescriptorProvider
 * @constructor
 * @private
 */
function _SceneGISGaussianSegmentedStreamDescriptorProvider(options) {
  options = options ?? {};
  if (typeof options.validateRuntimeIndex !== "function") {
    throw new DeveloperError("validateRuntimeIndex is required");
  }
  if (typeof options.packFileName !== "function") {
    throw new DeveloperError("packFileName is required");
  }
  const runtimeIndex = options.validateRuntimeIndex(options.runtimeIndex);
  if (runtimeIndex !== options.runtimeIndex) {
    throw new DeveloperError("Runtime Index capability identity changed");
  }
  const state = {
    runtimeIndex,
    packFileName: options.packFileName,
    pageScratch: new Float64Array(11),
    packScratch: new Float64Array(7),
    firstPageScratch: new Float64Array(11),
    lastPageScratch: new Float64Array(11),
    descriptorPageReads: 0,
    descriptorPackReads: 0,
  };
  providerStates.set(this, state);
  Object.defineProperties(this, {
    artifactIdentity: { value: runtimeIndex.artifactIdentityHex },
    runtimeIndexIdentity: {
      value: `${runtimeIndex.artifactIdentityHex}:${runtimeIndex.mciChecksum}`,
    },
    pageCount: { value: requireSafe(runtimeIndex.pageCount, "pageCount") },
    packCount: { value: requireSafe(runtimeIndex.packCount, "packCount") },
    compactIndexBytes: {
      value: requireSafe(runtimeIndex.byteLength, "compactIndexBytes"),
    },
    gsiChecksum: { value: 0 },
    strictA4: { value: true },
  });
  Object.freeze(this);
}

_SceneGISGaussianSegmentedStreamDescriptorProvider.prototype.readPageRequest =
  function (pageId) {
    const state = providerStates.get(this);
    requireIndex(pageId, this.pageCount, "Page id");
    const row = state.runtimeIndex.readPage(pageId, state.pageScratch);
    state.descriptorPageReads++;
    return Object.freeze({
      id: pageId,
      index: pageId,
      assetId: row[0],
      assetLocalStart: row[1],
      payloadIndex: row[1],
      splatCount: row[2],
      kind: row[3],
      semantic: row[4],
      layoutId: row[5],
      layoutIndex: row[5],
      packId: row[6],
      packIndex: row[6],
      offset: row[7],
      storedBytes: row[8],
      rawBytes: row[9],
      checksum: row[10],
      artifactIdentity: this.artifactIdentity,
    });
  };

_SceneGISGaussianSegmentedStreamDescriptorProvider.prototype.readPackRequest =
  function (packId) {
    const state = providerStates.get(this);
    requireIndex(packId, this.packCount, "Pack id");
    const row = state.runtimeIndex.readPack(packId, state.packScratch);
    const firstPage = row[2];
    const pageCount = row[3];
    if (pageCount < 1 || firstPage + pageCount > this.pageCount) {
      throw new DeveloperError("Segmented Pack Page coverage is invalid");
    }
    const first = state.runtimeIndex.readPage(
      firstPage,
      state.firstPageScratch,
    );
    const last = state.runtimeIndex.readPage(
      firstPage + pageCount - 1,
      state.lastPageScratch,
    );
    const fileBytes = row[5];
    const payloadOffset = first[7];
    const lastEnd = exactAdd(last[7], last[8], "Pack last Page end");
    if (
      first[6] !== packId ||
      last[6] !== packId ||
      first[3] !== row[0] ||
      last[3] !== row[0] ||
      first[5] !== row[1] ||
      last[5] !== row[1] ||
      payloadOffset % PAGE_ALIGNMENT !== 0 ||
      lastEnd !== fileBytes
    ) {
      throw new DeveloperError("Segmented Pack/Page identity is inconsistent");
    }
    const fileName = state.packFileName({ id: packId, kind: row[0] });
    if (typeof fileName !== "string" || fileName.length === 0) {
      throw new DeveloperError("Segmented Pack filename is invalid");
    }
    state.descriptorPackReads++;
    return Object.freeze({
      id: packId,
      index: packId,
      kind: row[0],
      layoutId: row[1],
      layoutIndex: row[1],
      firstPage,
      pageCount,
      splatCount: row[4],
      fileBytes,
      checksum: row[6],
      payloadOffset,
      payloadBytes: fileBytes - payloadOffset,
      fileName,
      artifactIdentity: this.artifactIdentity,
      strictA4: true,
    });
  };

_SceneGISGaussianSegmentedStreamDescriptorProvider.prototype.packFileName =
  function (packId) {
    return this.readPackRequest(packId).fileName;
  };

Object.defineProperty(
  _SceneGISGaussianSegmentedStreamDescriptorProvider.prototype,
  "statistics",
  {
    get: function () {
      const state = providerStates.get(this);
      return Object.freeze({
        descriptorPageReads: state.descriptorPageReads,
        descriptorPackReads: state.descriptorPackReads,
        residentDescriptorCount: 0,
      });
    },
  },
);

export default _SceneGISGaussianSegmentedStreamDescriptorProvider;
