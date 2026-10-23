/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import defined from "../../../../Core/defined.js";
import DeveloperError from "../../../../Core/DeveloperError.js";
import TaskProcessor from "../../../../Core/TaskProcessor.js";
import PixelFormat from "../../../../Core/PixelFormat.js";
import PixelDatatype from "../../../../Renderer/PixelDatatype.js";
import Sampler from "../../../../Renderer/Sampler.js";
import Texture from "../../../../Renderer/Texture.js";

const INVALID_INDEX = 0xffffffff;
const ticketStates = new WeakMap();
const ownerStates = new WeakMap();
const orderingUploadStates = new WeakMap();

function uploadBudget(budget, maximumTextureUploads) {
  budget ??= {
    remainingBytes: Number.MAX_SAFE_INTEGER,
    remainingUploads: maximumTextureUploads,
  };
  requireLimit(budget.remainingBytes, "remaining upload bytes");
  requireLimit(budget.remainingUploads, "remaining upload operations");
  return budget;
}

function validateOrderingBinding(binding, ordering) {
  if (
    !Object.isFrozen(binding) ||
    !Number.isSafeInteger(binding.adapterTicketSerial) ||
    binding.adapterTicketSerial < 1 ||
    (typeof binding.sortIntent !== "object" &&
      typeof binding.sortIntent !== "function") ||
    binding.sortIntent === null ||
    !Number.isSafeInteger(binding.sortRequestSerial) ||
    binding.sortRequestSerial < 1 ||
    !Number.isSafeInteger(binding.viewGeneration) ||
    binding.viewGeneration < 1 ||
    !Number.isSafeInteger(binding.contentGeneration) ||
    binding.contentGeneration < 0 ||
    !Number.isSafeInteger(binding.mappingGeneration) ||
    binding.mappingGeneration < 0 ||
    binding.ordering !== ordering
  ) {
    throw new DeveloperError(
      "Segmented global Ordering upload binding is invalid",
    );
  }
}

function sameOrderingBinding(state, binding, ordering) {
  return (
    state.binding === binding &&
    binding.ordering === ordering &&
    state.ordering === ordering &&
    binding.sortIntent.requestSerial === binding.sortRequestSerial &&
    binding.sortIntent.viewGeneration === binding.viewGeneration &&
    binding.sortIntent.contentGeneration === binding.contentGeneration &&
    binding.sortIntent.mappingGeneration === binding.mappingGeneration
  );
}

function requireLimit(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`Segmented global ${label} is invalid`);
  }
  return value;
}

function destroyResource(resource) {
  if (
    resource &&
    (typeof resource.isDestroyed !== "function" || !resource.isDestroyed())
  ) {
    resource.destroy();
  }
}

function defaultTexture(context, options) {
  return new Texture({
    context,
    width: options.width,
    height: options.height,
    pixelFormat: options.float ? PixelFormat.RGBA : PixelFormat.RGBA_INTEGER,
    pixelDatatype: options.float
      ? PixelDatatype.FLOAT
      : PixelDatatype.UNSIGNED_INT,
    sampler: options.float ? undefined : Sampler.NEAREST,
    flipY: false,
  });
}

function asUint32(bytes) {
  return bytes instanceof Uint8Array
    ? new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
    : bytes;
}

function upload(texture, options) {
  if (!texture || typeof texture.copyFrom !== "function") {
    throw new DeveloperError("Segmented global texture upload is unavailable");
  }
  texture.copyFrom({
    source: {
      width: options.width,
      height: options.height ?? 1,
      layers: options.layers,
      arrayBufferView: options.integer ? asUint32(options.data) : options.data,
    },
    xOffset: options.xOffset ?? 0,
    yOffset: options.yOffset ?? 0,
    layerOffset: options.layerOffset ?? 0,
  });
}

function validatePage(source, pageId, semantic, artifactIdentity) {
  if (
    !source ||
    source.descriptor?.artifactIdentity !== artifactIdentity ||
    source.descriptor?.index !== pageId ||
    source.descriptor?.semantic !== semantic ||
    !Number.isSafeInteger(source.descriptor?.assetId) ||
    source.descriptor.assetId < 0 ||
    !Number.isSafeInteger(source.descriptor?.assetLocalStart) ||
    source.descriptor.assetLocalStart < 0 ||
    !Number.isSafeInteger(source.descriptor?.splatCount) ||
    source.descriptor.splatCount < 1 ||
    !(source.payload instanceof Uint8Array) ||
    source.payload.byteLength !== source.descriptor.rawBytes ||
    (semantic === 1
      ? source.descriptor.rawBytes !== source.descriptor.splatCount * 32
      : ![16, 32, 64].includes(
          source.descriptor.rawBytes / source.descriptor.splatCount,
        )) ||
    source.descriptor.storedBytes !== source.descriptor.rawBytes
  ) {
    throw new DeveloperError(
      "Segmented global Page source is stale or corrupt",
    );
  }
}

function validateComposition(
  composition,
  descriptor,
  shDenseStarts,
  maxShDegree,
) {
  const arrays = [
    composition.fragmentCorePageIds,
    composition.fragmentShPageIds,
    composition.fragmentPageLocalStarts,
    composition.fragmentCounts,
    composition.fragmentPresentationStarts,
    composition.fragmentSlotIds,
  ];
  if (
    arrays.some((value) => !(value instanceof Uint32Array)) ||
    arrays.some((value) => value.length !== composition.fragmentCount) ||
    !(composition.slotCoverageNodeIds instanceof Uint32Array) ||
    composition.slotCoverageNodeIds.length !== composition.slotCount ||
    !(composition.slotRepresentationIds instanceof Uint32Array) ||
    composition.slotRepresentationIds.length !== composition.slotCount ||
    !(composition.slotCropBounds instanceof Float64Array) ||
    composition.slotCropBounds.length !== composition.slotCount * 4
  ) {
    throw new DeveloperError("Segmented global composition arrays are invalid");
  }
  let coreCursor = 0;
  let shCursor = 0;
  for (let fragment = 0; fragment < composition.fragmentCount; fragment++) {
    const count = composition.fragmentCounts[fragment];
    const shStart = shDenseStarts[fragment];
    if (
      count < 1 ||
      composition.fragmentPresentationStarts[fragment] !== coreCursor ||
      composition.fragmentSlotIds[fragment] >= composition.slotCount ||
      !Number.isSafeInteger(
        composition.fragmentPageLocalStarts[fragment] + count,
      )
    ) {
      throw new DeveloperError(
        "Segmented global composition coverage is invalid",
      );
    }
    coreCursor += count;
    if (shStart !== INVALID_INDEX) {
      if (maxShDegree === 0 || shStart !== shCursor) {
        throw new DeveloperError(
          "Segmented global dense SH coverage is invalid",
        );
      }
      shCursor += count;
    }
  }
  const shBytesPerSplat = [0, 16, 32, 64][maxShDegree];
  if (
    coreCursor !== composition.selectedSplatCount ||
    descriptor.coreLogicalBytes !== coreCursor * 32 ||
    descriptor.shLogicalBytes !== shCursor * shBytesPerSplat ||
    descriptor.mappingBytes < coreCursor * 16 ||
    descriptor.cropBytes < composition.slotCount * 16 ||
    descriptor.coreCanonicalizationScratchBytes !== 0
  ) {
    throw new DeveloperError("Segmented global descriptor coverage is invalid");
  }
}

function textureShape(descriptor, role, maxShDegree, cropTextureWidth) {
  if (role === "core") {
    return {
      width: 512,
      height: descriptor.coreTextureHeight,
      layers: descriptor.coreLayerCount,
    };
  }
  if (role === "sh") {
    return {
      width: [0, 256, 512, 1024][maxShDegree],
      height: descriptor.shTextureHeight,
      layers: descriptor.shLayerCount,
    };
  }
  if (role === "mapping") {
    return { width: 4096, height: descriptor.mappingBytes / (4096 * 16) };
  }
  if (role === "ordering") {
    return { width: 4096, height: descriptor.orderingBytes / (4096 * 16) };
  }
  return {
    width: cropTextureWidth,
    height:
      descriptor.cropLogicalSlots === 0
        ? 0
        : descriptor.cropCapacitySlots / cropTextureWidth,
  };
}

class SegmentedGlobalResourceTicket {
  constructor(state) {
    this.selectedSplatCount = state.composition.selectedSplatCount;
    this.slotCount = state.composition.slotCount;
    this.cpuBytes = state.descriptor.cpuStagingBytes;
    this.gpuBytes = state.descriptor.gpuPresentationBytes;
    ticketStates.set(this, state);
    Object.freeze(this);
  }
  get state() {
    return ticketStates.get(this).phase;
  }
  get copiedSplats() {
    return ticketStates.get(this).copiedSplats;
  }
  get uploadedResources() {
    return ticketStates.get(this).uploadedResources;
  }
  get reachableCpuRoles() {
    const state = ticketStates.get(this);
    return Object.freeze({
      planBytes:
        (state.composition.byteLength ?? 0) +
        state.fragmentShDenseStarts.byteLength,
      mappingBytes: state.mapping?.byteLength ?? 0,
      cropBytes: state.crop?.byteLength ?? 0,
      orderingBytes: state.ordering?.byteLength ?? 0,
      coreCanonicalizationScratchBytes: state.coreScratch?.byteLength ?? 0,
      coreBytes: 0,
      shBytes: 0,
    });
  }
}

/** @private */
export default class _SceneGISGaussianSegmentedGlobalPresentationResources {
  constructor(options = {}) {
    if (!options.context && !options.createTexture) {
      throw new DeveloperError("Segmented global resource context is required");
    }
    this._context = options.context;
    this._createTexture =
      options.createTexture ??
      ((value) => defaultTexture(this._context, value));
    if (
      !options.contentAtlas ||
      typeof options.contentAtlas.pageAddress !== "function"
    ) {
      throw new DeveloperError("Segmented global content atlas is required");
    }
    this._contentAtlas = options.contentAtlas;
    this._captureFootprintDiagnostics =
      options.captureFootprintDiagnostics === true;
    this._mappingTaskProcessor =
      options.mappingTaskProcessor ??
      new TaskProcessor("SceneGISGaussianMappingWorker", 1);
    this._mappingInFlight = undefined;
    this._mappingSettlements = [];
    this._destroyed = false;
    this._statistics = {
      allocationCount: 0,
      copiedSplats: 0,
      uploadedResources: 0,
      uploadedBytes: 0,
      destroyedResources: 0,
      cleanupDebtBytes: 0,
      activeOrderingUploadCursorCount: 0,
      coreCanonicalizationScratchBytes: 0,
      coreCanonicalizationScratchHighWaterBytes: 0,
      presentationCoreRewriteSplats: 0,
      mappingEntriesWritten: 0,
      lastFrameMappingEntriesWritten: 0,
      mappingWorkerDispatchCount: 0,
      mappingWorkerCompletionCount: 0,
      mappingWorkerFailureCount: 0,
      mappingWorkerMilliseconds: 0,
      mappingEntriesProduced: 0,
      staleMappingDiscardCount: 0,
    };
  }

  prepare(options) {
    const { resolvePage, physicalSnapshot, ...resourceOptions } = options;
    const { composition, descriptor } = options;
    if (
      this._destroyed ||
      !composition ||
      !descriptor ||
      typeof options.artifactIdentity !== "string" ||
      options.artifactIdentity.length === 0 ||
      typeof options.contentIdentity !== "string" ||
      options.contentIdentity.length === 0 ||
      !Number.isSafeInteger(options.contentGeneration) ||
      options.contentGeneration < 1 ||
      !Number.isSafeInteger(options.mappingGeneration) ||
      options.mappingGeneration < 1 ||
      typeof resolvePage !== "function" ||
      !Number.isSafeInteger(options.maxShDegree) ||
      options.maxShDegree < 0 ||
      options.maxShDegree > 3
    ) {
      throw new DeveloperError("Segmented global resource plan is invalid");
    }
    const fragmentShDenseStarts = options.fragmentShDenseStarts;
    if (
      !(fragmentShDenseStarts instanceof Uint32Array) ||
      fragmentShDenseStarts.length !== composition.fragmentCount
    ) {
      throw new DeveloperError("Segmented global SH layout is invalid");
    }
    validateComposition(
      composition,
      descriptor,
      fragmentShDenseStarts,
      options.maxShDegree,
    );
    const state = {
      manager: this,
      phase: "PLANNED",
      ...resourceOptions,
      fragmentShDenseStarts,
      fragment: 0,
      fragmentLocal: 0,
      copiedSplats: 0,
      uploadedResources: 0,
      uploadRole: 0,
      uploadPhase: "ALLOCATE",
      uploadRow: 0,
      pendingRun: undefined,
      resources: {},
      cleanupCursor: 0,
      cropTextureWidth: Math.min(
        Math.max(1, composition.slotCount),
        options.maximumTextureSize ?? Math.max(1, composition.slotCount),
      ),
    };
    state.pageAddresses = new Map();
    const expectedSemantics = new Map();
    for (const pageId of composition.fragmentCorePageIds) {
      expectedSemantics.set(pageId, 1);
    }
    for (const pageId of composition.fragmentShPageIds) {
      if (pageId !== INVALID_INDEX) {
        if (expectedSemantics.has(pageId)) {
          throw new DeveloperError("Segmented global Core/SH Page aliases");
        }
        expectedSemantics.set(pageId, 2);
      }
    }
    for (const [pageId, semantic] of expectedSemantics) {
      if (pageId === INVALID_INDEX) {
        continue;
      }
      const source = options.resolvePage(pageId, physicalSnapshot);
      validatePage(source, pageId, semantic, options.artifactIdentity);
      const address = this._contentAtlas.pageAddress(source.descriptor);
      if (
        !address ||
        address.semantic !== semantic ||
        address.splatCount !== source.descriptor.splatCount ||
        !Number.isSafeInteger(address.packedAddress) ||
        address.packedAddress < 0
      ) {
        throw new DeveloperError("Segmented global atlas address is invalid");
      }
      state.pageAddresses.set(pageId, address);
    }
    return new SegmentedGlobalResourceTicket(state);
  }

  _allocate(state) {
    const descriptor = state.descriptor;
    state.crop = new Float32Array(descriptor.cropBytes / 4);
    const cropBounds = state.composition.slotCropBounds;
    state.crop.set(new Float32Array(cropBounds), 0);
    state.phase = "MAPPING";
    this._statistics.allocationCount++;
  }

  _mappingParameters(state) {
    const composition = state.composition;
    const fragmentCount = composition.fragmentCount;
    const coreAddresses = new Uint32Array(fragmentCount);
    const coreCounts = new Uint32Array(fragmentCount);
    const shAddresses = new Uint32Array(fragmentCount);
    const shCounts = new Uint32Array(fragmentCount);
    shAddresses.fill(INVALID_INDEX);
    for (let fragment = 0; fragment < fragmentCount; fragment++) {
      const core = state.pageAddresses.get(
        composition.fragmentCorePageIds[fragment],
      );
      const shPageId = composition.fragmentShPageIds[fragment];
      const sh =
        shPageId === INVALID_INDEX
          ? undefined
          : state.pageAddresses.get(shPageId);
      if (!core || (shPageId !== INVALID_INDEX && !sh)) {
        throw new DeveloperError(
          "Segmented Mapping atlas projection is unavailable",
        );
      }
      coreAddresses[fragment] = core.packedAddress;
      coreCounts[fragment] = core.splatCount;
      if (sh) {
        shAddresses[fragment] = sh.packedAddress;
        shCounts[fragment] = sh.splatCount;
      }
    }
    const parameters = {
      artifactIdentity: state.artifactIdentity,
      contentIdentity: state.contentIdentity,
      contentGeneration: state.contentGeneration,
      mappingGeneration: state.mappingGeneration,
      selectedSplatCount: composition.selectedSplatCount,
      mappingElementCount: state.descriptor.mappingBytes / 4,
      fragmentCount,
      slotCount: composition.slotCount,
      fragmentCorePageIds: composition.fragmentCorePageIds.slice(),
      fragmentShPageIds: composition.fragmentShPageIds.slice(),
      fragmentPageLocalStarts: composition.fragmentPageLocalStarts.slice(),
      fragmentCounts: composition.fragmentCounts.slice(),
      fragmentPresentationStarts:
        composition.fragmentPresentationStarts.slice(),
      fragmentSlotIds: composition.fragmentSlotIds.slice(),
      fragmentShDenseStarts: state.fragmentShDenseStarts.slice(),
      fragmentCorePackedAddresses: coreAddresses,
      fragmentCorePageSplatCounts: coreCounts,
      fragmentShPackedAddresses: shAddresses,
      fragmentShPageSplatCounts: shCounts,
      slotCoverageNodeIds: composition.slotCoverageNodeIds.slice(),
    };
    return {
      parameters,
      transfer: Object.values(parameters)
        .filter((value) => value instanceof Uint32Array)
        .map((value) => value.buffer),
    };
  }

  _dispatchMapping(state) {
    if (this._mappingInFlight || state.mappingDispatched) {
      return false;
    }
    const envelope = this._mappingParameters(state);
    const started = performance.now();
    const promise = this._mappingTaskProcessor.scheduleTask(
      envelope.parameters,
      envelope.transfer,
    );
    if (!defined(promise)) {
      return false;
    }
    const owner = Object.freeze({ state, started });
    state.mappingDispatched = true;
    this._mappingInFlight = owner;
    this._statistics.mappingWorkerDispatchCount++;
    Promise.resolve(promise).then(
      (result) => this._settleMapping(owner, { result }),
      (error) => this._settleMapping(owner, { error }),
    );
    return true;
  }

  _settleMapping(owner, settlement) {
    if (this._mappingInFlight === owner) {
      this._mappingInFlight = undefined;
    }
    const state = owner.state;
    if (this._destroyed || state.phase === "ABORTED") {
      this._statistics.staleMappingDiscardCount++;
      return;
    }
    this._statistics.mappingWorkerMilliseconds +=
      performance.now() - owner.started;
    this._mappingSettlements.push({ state, ...settlement });
  }

  _consumeMappingSettlement(state) {
    const index = this._mappingSettlements.findIndex(
      (settlement) => settlement.state === state,
    );
    if (index < 0) {
      return false;
    }
    const settlement = this._mappingSettlements.splice(index, 1)[0];
    if (settlement.error) {
      this._statistics.mappingWorkerFailureCount++;
      throw settlement.error;
    }
    const result = settlement.result;
    if (
      result?.artifactIdentity !== state.artifactIdentity ||
      result.contentIdentity !== state.contentIdentity ||
      result.contentGeneration !== state.contentGeneration ||
      result.mappingGeneration !== state.mappingGeneration ||
      result.selectedSplatCount !== state.composition.selectedSplatCount ||
      result.mappingElementCount !== state.descriptor.mappingBytes / 4 ||
      result.writtenCount !== state.composition.selectedSplatCount ||
      !(result.mapping instanceof Uint32Array) ||
      result.mapping.byteOffset !== 0 ||
      result.mapping.byteLength !== state.descriptor.mappingBytes ||
      result.mapping.buffer.byteLength !== state.descriptor.mappingBytes
    ) {
      this._statistics.mappingWorkerFailureCount++;
      throw new DeveloperError("Segmented Mapping Worker result is stale");
    }
    state.mapping = result.mapping;
    state.copiedSplats = result.writtenCount;
    this._statistics.copiedSplats += result.writtenCount;
    this._statistics.mappingWorkerCompletionCount++;
    this._statistics.mappingEntriesProduced += result.writtenCount;
    this._statistics.mappingEntriesWritten += result.writtenCount;
    state.phase = "UPLOADING";
    return true;
  }

  _allocateTexture(state) {
    const descriptor = state.descriptor;
    const roles = ["mapping", "crop"];
    const role = roles[state.uploadRole];
    const shape = textureShape(
      descriptor,
      role,
      state.maxShDegree,
      state.cropTextureWidth,
    );
    if (shape.height < 1 || (shape.layers !== undefined && shape.layers < 1)) {
      throw new DeveloperError(
        `Segmented global ${role} texture shape is invalid`,
      );
    }
    state.resources[`${role}Texture`] = this._createTexture({
      role,
      ...shape,
      float: role === "crop",
    });
    state.uploadRole++;
    state.uploadedResources++;
    this._statistics.uploadedResources++;
    return true;
  }

  advance(ticket, limits = {}) {
    const state = ticketStates.get(ticket);
    if (
      !state ||
      state.manager !== this ||
      ["ABORTED", "READY"].includes(state.phase)
    ) {
      throw new DeveloperError("Segmented global resource ticket is stale");
    }
    requireLimit(limits.maximumMappingEntries ?? 0, "Mapping entry limit");
    requireLimit(
      limits.maximumPositionExtractions ?? 0,
      "position extraction limit",
    );
    let uploads = requireLimit(
      limits.maximumTextureUploads ?? 0,
      "upload limit",
    );
    const budget = uploadBudget(limits.textureUploadBudget, uploads);
    uploads = Math.min(uploads, budget.remainingUploads);
    if (state.phase === "PLANNED") {
      this._allocate(state);
    }
    this._statistics.lastFrameMappingEntriesWritten = 0;
    if (state.phase === "MAPPING") {
      this._consumeMappingSettlement(state);
      if (state.phase === "MAPPING") {
        this._dispatchMapping(state);
      }
    }
    while (state.phase === "UPLOADING" && uploads > 0) {
      if (state.uploadRole < 2) {
        if (this._allocateTexture(state)) {
          uploads--;
          budget.remainingUploads--;
        }
        continue;
      }
      if (state.uploadPhase === "ALLOCATE") {
        const rows = this._uploadRows(
          state.resources.mappingTexture,
          {
            width: 4096,
            height: state.descriptor.mappingBytes / (4096 * 16),
            data: state.mapping,
            integer: true,
          },
          state.uploadRow,
          budget,
        );
        if (rows === 0) {
          break;
        }
        state.uploadRow += rows;
        if (state.uploadRow === state.descriptor.mappingBytes / (4096 * 16)) {
          state.uploadPhase = "MAPPING";
          state.uploadRow = 0;
        }
        uploads--;
        continue;
      }
      if (state.uploadPhase === "MAPPING") {
        const height =
          state.descriptor.cropCapacitySlots / state.cropTextureWidth;
        const rows = this._uploadRows(
          state.resources.cropTexture,
          {
            width: state.cropTextureWidth,
            height,
            data: state.crop,
            integer: false,
          },
          state.uploadRow,
          budget,
        );
        if (rows === 0) {
          break;
        }
        state.uploadRow += rows;
        uploads--;
        if (state.uploadRow === height) {
          state.uploadPhase = "DONE";
          state.phase = "CONTENT_READY";
        }
      }
    }
    return Object.freeze({
      state: state.phase,
      copiedSplats: state.copiedSplats,
      uploadedResources: state.uploadedResources,
      ready: state.phase === "CONTENT_READY" || state.phase === "READY",
    });
  }

  _uploadRows(texture, options, row, budget) {
    const rowBytes = options.width * 16;
    const rows = Math.min(
      options.height - row,
      Math.floor(budget.remainingBytes / rowBytes),
    );
    if (rows === 0 || budget.remainingUploads === 0) {
      return 0;
    }
    const elementsPerRow = options.width * 4;
    upload(texture, {
      ...options,
      height: rows,
      yOffset: row,
      data: options.data.subarray(
        row * elementsPerRow,
        (row + rows) * elementsPerRow,
      ),
    });
    const bytes = rows * rowBytes;
    budget.remainingBytes -= bytes;
    budget.remainingUploads--;
    this._statistics.uploadedBytes += bytes;
    return rows;
  }

  prepareOrderingUpload(descriptor, ordering, binding) {
    if (
      !(ordering instanceof Uint32Array) ||
      ordering.byteLength !== descriptor?.orderingBytes
    ) {
      throw new DeveloperError("Segmented global Ordering bytes are invalid");
    }
    validateOrderingBinding(binding, ordering);
    const cursor = Object.freeze({});
    orderingUploadStates.set(cursor, {
      manager: this,
      descriptor,
      ordering,
      binding,
      texture: undefined,
      phase: "ALLOCATE_TEXTURE",
      copyFromCount: 0,
      uploadRow: 0,
      cleanupComplete: false,
    });
    this._statistics.activeOrderingUploadCursorCount++;
    return cursor;
  }

  rebindOrderingUpload(cursor, descriptor, ordering, binding) {
    const state = orderingUploadStates.get(cursor);
    validateOrderingBinding(binding, ordering);
    if (
      !state ||
      state.manager !== this ||
      state.descriptor !== descriptor ||
      !["ALLOCATE_TEXTURE", "UPLOAD_ORDERING"].includes(state.phase) ||
      state.copyFromCount !== 0 ||
      !(ordering instanceof Uint32Array) ||
      ordering.byteLength !== descriptor.orderingBytes
    ) {
      throw new DeveloperError(
        "Segmented global Ordering upload cannot be rebound",
      );
    }
    state.ordering = ordering;
    state.binding = binding;
    return cursor;
  }

  advanceOrderingUpload(
    cursor,
    maximumTextureUploads = 0,
    binding,
    ordering,
    textureUploadBudget,
  ) {
    const state = orderingUploadStates.get(cursor);
    const uploads = requireLimit(
      maximumTextureUploads,
      "Ordering upload limit",
    );
    const budget = uploadBudget(textureUploadBudget, uploads);
    let uploadedBytes = 0;
    if (
      !state ||
      state.manager !== this ||
      ["ABORTED", "CONSUMED"].includes(state.phase)
    ) {
      throw new DeveloperError("Segmented global Ordering upload is stale");
    }
    validateOrderingBinding(binding, ordering);
    if (!sameOrderingBinding(state, binding, ordering)) {
      throw new DeveloperError(
        "Segmented global Ordering upload authority changed",
      );
    }
    if (state.phase === "ALLOCATE_TEXTURE") {
      const shape = textureShape(state.descriptor, "ordering", 0, 1);
      state.texture = this._createTexture({
        role: "ordering",
        ...shape,
        float: false,
      });
      state.shape = shape;
      state.phase = "UPLOAD_ORDERING";
      this._statistics.allocationCount++;
    }
    if (
      state.phase === "UPLOAD_ORDERING" &&
      uploads > 0 &&
      budget.remainingUploads > 0
    ) {
      try {
        const rows = this._uploadRows(
          state.texture,
          {
            ...state.shape,
            data: state.ordering,
            integer: true,
          },
          state.uploadRow,
          budget,
        );
        if (rows > 0) {
          state.uploadRow += rows;
          uploadedBytes = rows * state.shape.width * 16;
          state.copyFromCount++;
          this._statistics.uploadedResources++;
          if (state.uploadRow === state.shape.height) {
            state.phase = "READY";
          }
        }
      } catch (error) {
        state.phase = "CLEANUP";
        this._statistics.cleanupDebtBytes += state.descriptor.orderingBytes;
        throw error;
      }
    }
    return Object.freeze({
      state: state.phase,
      ready: state.phase === "READY",
      uploadedBytes,
      uploadedTextures: state.phase === "READY" ? 1 : 0,
    });
  }

  consumeOrderingUpload(cursor, binding, ordering) {
    const state = orderingUploadStates.get(cursor);
    validateOrderingBinding(binding, ordering);
    if (!state || state.manager !== this || state.phase !== "READY") {
      throw new DeveloperError("Segmented global Ordering upload is not ready");
    }
    if (!sameOrderingBinding(state, binding, ordering)) {
      throw new DeveloperError(
        "Segmented global Ordering upload consume authority changed",
      );
    }
    state.phase = "CONSUMED";
    this._statistics.activeOrderingUploadCursorCount--;
    const prepared = Object.freeze({
      texture: state.texture,
      ordering: state.ordering,
    });
    state.binding = undefined;
    state.ordering = undefined;
    state.texture = undefined;
    return prepared;
  }

  abortOrderingUpload(cursor) {
    const state = orderingUploadStates.get(cursor);
    if (
      !state ||
      state.manager !== this ||
      state.phase === "CONSUMED" ||
      state.phase === "ABORTED"
    ) {
      throw new DeveloperError("Segmented global Ordering upload cannot abort");
    }
    if (state.texture && !state.cleanupComplete) {
      destroyResource(state.texture);
      state.cleanupComplete = true;
      this._statistics.destroyedResources++;
    }
    state.texture = undefined;
    state.ordering = undefined;
    state.binding = undefined;
    if (state.phase === "CLEANUP") {
      this._statistics.cleanupDebtBytes -= state.descriptor.orderingBytes;
    }
    state.phase = "ABORTED";
    this._statistics.activeOrderingUploadCursorCount--;
    return true;
  }

  installPreparedOrdering(ticket, cursor, binding, ordering) {
    const state = ticketStates.get(ticket);
    if (!state || state.manager !== this || state.phase !== "CONTENT_READY") {
      throw new DeveloperError(
        "Segmented global content is not ready for Ordering",
      );
    }
    const prepared = this.consumeOrderingUpload(cursor, binding, ordering);
    state.resources.orderingTexture = prepared.texture;
    state.ordering = prepared.ordering;
    state.phase = "READY";
    state.uploadedResources++;
    return ticket;
  }

  resetOrdering(ticket) {
    const state = ticketStates.get(ticket);
    if (
      !state ||
      state.manager !== this ||
      state.phase !== "READY" ||
      state.owner
    ) {
      throw new DeveloperError("Segmented global Ordering cannot be reset");
    }
    destroyResource(state.resources.orderingTexture);
    state.resources.orderingTexture = undefined;
    state.ordering = undefined;
    state.phase = "CONTENT_READY";
    this._statistics.destroyedResources++;
    return true;
  }

  createOwner(ticket, options = {}) {
    const state = ticketStates.get(ticket);
    if (!state || state.manager !== this || state.phase !== "READY") {
      throw new DeveloperError("Segmented global resources are not ready");
    }
    const owner = Object.freeze({
      resourceOwnerIdentity: options.resourceOwnerIdentity,
      selectedSplatCount: state.composition.selectedSplatCount,
      slotCount: state.composition.slotCount,
      descriptor: state.descriptor,
      coreTexture: this._contentAtlas.coreTexture,
      shTexture: this._contentAtlas.shTexture,
      mappingTexture: state.resources.mappingTexture,
      cropTexture: state.resources.cropTexture,
      get orderingTexture() {
        return ownerStates.get(owner)?.orderingTexture;
      },
      get ordering() {
        return ownerStates.get(owner)?.ordering;
      },
    });
    ownerStates.set(owner, {
      manager: this,
      resources: [
        state.resources.orderingTexture,
        state.resources.mappingTexture,
        state.resources.cropTexture,
      ],
      cursor: 0,
      bytes: state.descriptor.gpuPresentationBytes,
      orderingTexture: state.resources.orderingTexture,
      ordering: state.ordering,
      mapping: this._captureFootprintDiagnostics ? state.mapping : undefined,
    });
    state.owner = owner;
    return owner;
  }

  diagnosticMapping(owner, presentationOrdinal) {
    const state = ownerStates.get(owner);
    if (
      !this._captureFootprintDiagnostics ||
      !state?.mapping ||
      !Number.isSafeInteger(presentationOrdinal) ||
      presentationOrdinal < 0 ||
      presentationOrdinal * 4 + 3 >= state.mapping.length
    ) {
      throw new DeveloperError(
        "Segmented footprint diagnostic mapping is unavailable",
      );
    }
    return state.mapping.slice(
      presentationOrdinal * 4,
      presentationOrdinal * 4 + 4,
    );
  }

  destroyOrderingTexture(texture) {
    destroyResource(texture);
    this._statistics.destroyedResources++;
    return true;
  }

  prepareOrderingSwap(owner, texture, ordering) {
    const state = ownerStates.get(owner);
    if (
      !state ||
      state.manager !== this ||
      !texture ||
      !(ordering instanceof Uint32Array)
    ) {
      throw new DeveloperError("Segmented global Ordering owner is stale");
    }
    const previous = state.resources[0];
    return () => {
      state.resources[0] = texture;
      state.orderingTexture = texture;
      state.ordering = ordering;
      return previous;
    };
  }

  retire(owner) {
    const state = ownerStates.get(owner);
    if (!state || state.manager !== this) {
      throw new DeveloperError(
        "Segmented global resource owner is stale or foreign",
      );
    }
    while (state.cursor < state.resources.length) {
      const resource = state.resources[state.cursor];
      destroyResource(resource);
      state.cursor++;
      if (resource) {
        this._statistics.destroyedResources++;
      }
    }
    ownerStates.delete(owner);
    return true;
  }

  abort(ticket) {
    const state = ticketStates.get(ticket);
    if (!state || state.manager !== this || state.owner) {
      throw new DeveloperError("Segmented global resource ticket cannot abort");
    }
    const resources = [
      state.resources.orderingTexture,
      state.resources.mappingTexture,
      state.resources.cropTexture,
    ];
    while (state.cleanupCursor < resources.length) {
      destroyResource(resources[state.cleanupCursor]);
      state.cleanupCursor++;
    }
    state.phase = "ABORTED";
    return true;
  }

  get copiedSplats() {
    return this._statistics.copiedSplats;
  }

  get uploadedResources() {
    return this._statistics.uploadedResources;
  }

  get statistics() {
    return Object.freeze({ ...this._statistics });
  }

  destroy() {
    if (this._destroyed) {
      return false;
    }
    this._destroyed = true;
    this._mappingSettlements.length = 0;
    this._mappingInFlight = undefined;
    const result = this._mappingTaskProcessor.destroy?.();
    return result !== false;
  }
}
