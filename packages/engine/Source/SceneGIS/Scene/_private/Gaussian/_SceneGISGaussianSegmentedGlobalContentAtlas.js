/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import DeveloperError from "../../../../Core/DeveloperError.js";
import PixelFormat from "../../../../Core/PixelFormat.js";
import PixelDatatype from "../../../../Renderer/PixelDatatype.js";
import Sampler from "../../../../Renderer/Sampler.js";
import _SceneGISGaussianTextureArray from "../../../Renderer/_SceneGISGaussianTextureArray.js";
import { computeSegmentedAtlasPageFootprint } from "../../../Core/_private/Gaussian/_SceneGISGaussianSegmentedProtocol.js";

import { consumeSegmentedPreparedCoreReceipt } from "./_SceneGISGaussianSegmentedCorePreparation.js";

const SPLATS_PER_ROW = 256;
const MAX_PACKED_LAYERS = 0x4000;
const receiptStates = new WeakMap();

function requireSafe(value, label, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new DeveloperError(
      `${label} must be a ${positive ? "positive " : ""}safe integer`,
    );
  }
  return value;
}

function samePage(left, right) {
  return (
    left?.artifactIdentity === right?.artifactIdentity &&
    left?.index === right?.index &&
    left?.assetId === right?.assetId &&
    left?.assetLocalStart === right?.assetLocalStart &&
    left?.splatCount === right?.splatCount &&
    left?.kind === right?.kind &&
    left?.semantic === right?.semantic &&
    left?.layoutId === right?.layoutId &&
    left?.packId === right?.packId &&
    left?.offset === right?.offset &&
    left?.storedBytes === right?.storedBytes &&
    left?.rawBytes === right?.rawBytes &&
    left?.checksum === right?.checksum
  );
}

function validatePage(descriptor, payload, artifactIdentity, shBytesPerSplat) {
  const bytesPerSplat = descriptor?.semantic === 1 ? 32 : shBytesPerSplat;
  if (
    !descriptor ||
    descriptor.artifactIdentity !== artifactIdentity ||
    ![1, 2].includes(descriptor.semantic) ||
    bytesPerSplat < 1 ||
    !Number.isSafeInteger(descriptor.index) ||
    descriptor.index < 0 ||
    !Number.isSafeInteger(descriptor.assetId) ||
    descriptor.assetId < 0 ||
    !Number.isSafeInteger(descriptor.splatCount) ||
    descriptor.splatCount < 1 ||
    descriptor.splatCount > 0x10000 ||
    descriptor.rawBytes !== descriptor.splatCount * bytesPerSplat ||
    descriptor.storedBytes !== descriptor.rawBytes ||
    !(payload instanceof Uint8Array) ||
    payload.byteLength !== descriptor.rawBytes
  ) {
    throw new DeveloperError("Segmented Page atlas source is invalid");
  }
}

function createDefaultTexture(context, options) {
  return new _SceneGISGaussianTextureArray({
    context,
    width: options.width,
    height: options.height,
    layers: options.layers,
    pixelFormat: PixelFormat.RGBA_INTEGER,
    pixelDatatype: PixelDatatype.UNSIGNED_INT,
    sampler: Sampler.NEAREST,
    flipY: false,
  });
}

function upload(texture, width, height, layer, yOffset, bytes) {
  texture.copyFrom({
    source: {
      width,
      height,
      layers: 1,
      arrayBufferView: new Uint32Array(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength / 4,
      ),
    },
    xOffset: 0,
    yOffset,
    layerOffset: layer,
  });
}

/** Stable immutable segmented Core/SH Page atlas. @private */
export default class _SceneGISGaussianSegmentedGlobalContentAtlas {
  constructor(options = {}) {
    if (
      typeof options.artifactIdentity !== "string" ||
      options.artifactIdentity.length === 0 ||
      (!options.context && typeof options.createArrayTexture !== "function")
    ) {
      throw new DeveloperError("Segmented Page atlas options are invalid");
    }
    this.artifactIdentity = options.artifactIdentity;
    this._captureFootprintDiagnostics =
      options.captureFootprintDiagnostics === true;
    this._maxShDegree = requireSafe(options.maxShDegree ?? 0, "maxShDegree");
    if (this._maxShDegree > 3) {
      throw new DeveloperError("Segmented Page atlas SH degree is invalid");
    }
    this._shBytesPerSplat = [0, 16, 32, 64][this._maxShDegree];
    this._shTexelsPerSplat = [0, 1, 2, 4][this._maxShDegree];
    this.maximumBytes = requireSafe(options.maximumBytes, "maximumBytes", true);
    const maximumTextureSize = requireSafe(
      options.maximumTextureSize,
      "maximumTextureSize",
      true,
    );
    const maximumTextureArrayLayers = Math.min(
      requireSafe(
        options.maximumTextureArrayLayers,
        "maximumTextureArrayLayers",
        true,
      ),
      MAX_PACKED_LAYERS,
    );
    const bytesPerPhysicalSplat = 32 + this._shBytesPerSplat;
    const rowBudget = Math.floor(
      this.maximumBytes / (bytesPerPhysicalSplat * SPLATS_PER_ROW),
    );
    const height = Math.min(256, maximumTextureSize, rowBudget);
    const layers = Math.min(
      maximumTextureArrayLayers,
      height < 1 ? 0 : Math.floor(rowBudget / height),
    );
    if (
      height < 1 ||
      layers < 1 ||
      maximumTextureSize < 512 ||
      (this._shTexelsPerSplat > 0 &&
        maximumTextureSize < SPLATS_PER_ROW * this._shTexelsPerSplat)
    ) {
      throw new DeveloperError("Segmented Page atlas capacity is impossible");
    }
    this._height = height;
    this._layers = layers;
    this._splatsPerLayer = height * SPLATS_PER_ROW;
    this._capacitySplats = this._splatsPerLayer * layers;
    this._allocatedBytes = this._capacitySplats * bytesPerPhysicalSplat;
    this._createArrayTexture =
      options.createArrayTexture ??
      ((textureOptions) =>
        createDefaultTexture(options.context, textureOptions));
    this._beforeRelease = options.beforeRelease;
    this._textures = { core: undefined, sh: undefined };
    this._free = {
      core: Array.from({ length: layers }, (_, layer) => ({
        layer,
        start: 0,
        count: this._splatsPerLayer,
      })),
      sh: Array.from({ length: layers }, (_, layer) => ({
        layer,
        start: 0,
        count: this._splatsPerLayer,
      })),
    };
    this._records = new Map();
    this._generation = 0;
    this._destroyCursor = 0;
    this._destroyed = false;
    this._statistics = {
      allocationCount: 0,
      releaseAttemptCount: 0,
      successfulReleaseCount: 0,
      cleanupDebtCount: 0,
      pageAtlasCanonicalizedCoreSplats: 0,
      pageAtlasUploadedCoreBytes: 0,
      pageAtlasUploadedShBytes: 0,
      pageAtlasRetainedHitCount: 0,
    };
  }

  _texture(semantic) {
    const role = semantic === 1 ? "core" : "sh";
    if (!this._textures[role]) {
      const texelsPerSplat = semantic === 1 ? 2 : this._shTexelsPerSplat;
      this._textures[role] = this._createArrayTexture({
        role,
        width: SPLATS_PER_ROW * texelsPerSplat,
        height: this._height,
        layers: this._layers,
      });
      if (
        !this._textures[role] ||
        typeof this._textures[role].copyFrom !== "function" ||
        typeof this._textures[role].destroy !== "function"
      ) {
        throw new DeveloperError("Segmented Page atlas texture is invalid");
      }
      this._statistics.allocationCount++;
    }
    return this._textures[role];
  }

  _allocate(semantic, splatCount) {
    const role = semantic === 1 ? "core" : "sh";
    const footprint = computeSegmentedAtlasPageFootprint(
      splatCount,
      semantic,
      this._maxShDegree,
    );
    const reserved = footprint.reservedSplats;
    const ranges = this._free[role];
    const index = ranges.findIndex((range) => range.count >= reserved);
    if (index < 0) {
      throw new DeveloperError("Segmented Page atlas has no free range");
    }
    const range = ranges[index];
    const allocation = {
      role,
      layer: range.layer,
      start: range.start,
      count: reserved,
      splatCount,
    };
    range.start += reserved;
    range.count -= reserved;
    if (range.count === 0) {
      ranges.splice(index, 1);
    }
    return allocation;
  }

  _freeRange(range) {
    const ranges = this._free[range.role];
    ranges.push({ layer: range.layer, start: range.start, count: range.count });
    ranges.sort((left, right) =>
      left.layer === right.layer
        ? left.start - right.start
        : left.layer - right.layer,
    );
    for (let index = 1; index < ranges.length;) {
      const previous = ranges[index - 1];
      const current = ranges[index];
      if (
        previous.layer === current.layer &&
        previous.start + previous.count === current.start
      ) {
        previous.count += current.count;
        ranges.splice(index, 1);
      } else {
        index++;
      }
    }
  }

  retainedBindingReceipt(descriptor) {
    const existing = this._records.get(descriptor.index);
    if (!existing) {
      return undefined;
    }
    if (!samePage(existing.descriptor, descriptor) || existing.debt) {
      throw new DeveloperError("Segmented Page atlas backing conflicts");
    }
    return existing.receipt;
  }

  canAllocatePage(descriptor) {
    const role = descriptor.semantic === 1 ? "core" : "sh";
    const count = computeSegmentedAtlasPageFootprint(
      descriptor.splatCount,
      descriptor.semantic,
      this._maxShDegree,
    ).reservedSplats;
    return this._free[role].some((range) => range.count >= count);
  }

  createBindingReceipt(descriptor, input) {
    if (this._destroyed) {
      throw new DeveloperError("Segmented Page atlas is destroyed");
    }
    const rawPayload =
      descriptor.semantic === 1
        ? consumeSegmentedPreparedCoreReceipt(input, descriptor)
        : input;
    validatePage(
      descriptor,
      descriptor.semantic === 1
        ? rawPayload.subarray(0, descriptor.rawBytes)
        : rawPayload,
      this.artifactIdentity,
      this._shBytesPerSplat,
    );
    const existing = this._records.get(descriptor.index);
    if (existing) {
      if (!samePage(existing.descriptor, descriptor) || existing.debt) {
        throw new DeveloperError("Segmented Page atlas backing conflicts");
      }
      this._statistics.pageAtlasRetainedHitCount++;
      return existing.receipt;
    }
    const range = this._allocate(descriptor.semantic, descriptor.splatCount);
    let diagnosticBytes;
    try {
      const bytes =
        descriptor.semantic === 1
          ? rawPayload
          : (() => {
              const padded = new Uint8Array(
                range.count * this._shBytesPerSplat,
              );
              padded.set(rawPayload);
              return padded;
            })();
      const texelsPerSplat =
        descriptor.semantic === 1 ? 2 : this._shTexelsPerSplat;
      upload(
        this._texture(descriptor.semantic),
        SPLATS_PER_ROW * texelsPerSplat,
        range.count / SPLATS_PER_ROW,
        range.layer,
        range.start / SPLATS_PER_ROW,
        bytes,
      );
      if (descriptor.semantic === 1) {
        if (this._captureFootprintDiagnostics) {
          diagnosticBytes = bytes.slice(0, descriptor.splatCount * 32);
        }

        this._statistics.pageAtlasUploadedCoreBytes += bytes.byteLength;
      } else {
        this._statistics.pageAtlasUploadedShBytes += bytes.byteLength;
      }
    } catch (error) {
      this._freeRange(range);
      throw error;
    }
    const generation = ++this._generation;
    const packedAddress = (range.layer << 16) | range.start;
    const receipt = Object.freeze({
      artifactIdentity: descriptor.artifactIdentity,
      pageIndex: descriptor.index,
      semantic: descriptor.semantic,
      packedAddress,
      splatCount: descriptor.splatCount,
      backendGeneration: generation,
    });
    const record = {
      descriptor,
      receipt,
      range,
      generation,
      debt: false,
      diagnosticBytes,
    };
    receiptStates.set(receipt, { atlas: this, record });
    this._records.set(descriptor.index, record);
    return receipt;
  }

  validateBindingReceipt(receipt, descriptor, ownerToken) {
    if (
      (typeof ownerToken !== "object" && typeof ownerToken !== "function") ||
      ownerToken === null
    ) {
      throw new DeveloperError("Segmented Page atlas owner is invalid");
    }
    const state = receiptStates.get(receipt);
    const record = this._records.get(descriptor?.index);
    if (
      !state ||
      state.atlas !== this ||
      state.record !== record ||
      record.receipt !== receipt ||
      record.debt ||
      !samePage(record.descriptor, descriptor)
    ) {
      throw new DeveloperError("Segmented Page atlas receipt is stale");
    }
    return receipt;
  }

  pageAddress(descriptor) {
    const record = this._records.get(descriptor?.index);
    if (!record || record.debt || !samePage(record.descriptor, descriptor)) {
      throw new DeveloperError("Segmented Page atlas address is unavailable");
    }
    return Object.freeze({
      packedAddress: record.receipt.packedAddress,
      splatCount: record.descriptor.splatCount,
      semantic: record.descriptor.semantic,
    });
  }

  diagnosticCoreRecord(pageId, pageLocalIndex) {
    const record = this._records.get(pageId);
    if (
      !this._captureFootprintDiagnostics ||
      !record?.diagnosticBytes ||
      !Number.isSafeInteger(pageLocalIndex) ||
      pageLocalIndex < 0 ||
      pageLocalIndex >= record.descriptor.splatCount
    ) {
      throw new DeveloperError(
        "Segmented footprint diagnostic record is unavailable",
      );
    }
    const start = pageLocalIndex * 32;
    return Object.freeze({
      pageId,
      pageLocalIndex,
      packedAddress: record.receipt.packedAddress + pageLocalIndex,
      bytes: record.diagnosticBytes.slice(start, start + 32),
    });
  }

  releaseBinding(receipt, descriptor) {
    const state = receiptStates.get(receipt);
    const record = this._records.get(descriptor?.index);
    if (
      !state ||
      state.atlas !== this ||
      state.record !== record ||
      record.receipt !== receipt ||
      !samePage(record.descriptor, descriptor)
    ) {
      throw new DeveloperError("Segmented Page atlas release is stale");
    }
    this._statistics.releaseAttemptCount++;
    try {
      this._beforeRelease?.(record);
    } catch (error) {
      if (!record.debt) {
        record.debt = true;
        this._statistics.cleanupDebtCount++;
      }
      throw error;
    }
    if (record.debt) {
      record.debt = false;
      this._statistics.cleanupDebtCount--;
    }
    this._records.delete(descriptor.index);
    this._freeRange(record.range);
    this._statistics.successfulReleaseCount++;
    return true;
  }

  destroy() {
    if (this._records.size !== 0) {
      throw new DeveloperError("Segmented Page atlas still owns ranges");
    }
    const resources = [this._textures.sh, this._textures.core];
    while (this._destroyCursor < resources.length) {
      const resource = resources[this._destroyCursor];
      if (
        resource &&
        (typeof resource.isDestroyed !== "function" || !resource.isDestroyed())
      ) {
        resource.destroy();
      }
      this._destroyCursor++;
    }
    this._allocatedBytes = 0;
    this._destroyed = true;
    return true;
  }

  get coreTexture() {
    return this._textures.core;
  }

  get shTexture() {
    return this._textures.sh;
  }

  get statistics() {
    let bytes = 0;
    for (const record of this._records.values()) {
      bytes += record.descriptor.rawBytes;
    }
    return Object.freeze({
      ...this._statistics,
      backingCount: this._records.size,
      backingBytes: bytes,
      backendGeneration: this._generation,
      capacitySplats: this._capacitySplats,
      allocatedTextureBytes: this._allocatedBytes,
      destroyed: this._destroyed,
    });
  }
}
