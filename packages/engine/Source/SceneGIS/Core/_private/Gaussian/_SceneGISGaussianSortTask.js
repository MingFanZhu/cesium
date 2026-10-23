/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import DeveloperError from "../../../../Core/DeveloperError.js";
import { computeSegmentedAtlasPageFootprint } from "./_SceneGISGaussianSegmentedAssetPageOwnership.js";

const INVALID_INDEX = 0xffffffff;
const CORE_BYTES_PER_SPLAT = 32;
const POSITION_BYTES_PER_SPLAT = 12;
let repository = new Map();
let repositoryGeneration = 0;
let metricKeys = new Int32Array(0);
let sortIndices = new Uint32Array(0);
let sortScratch = new Uint32Array(0);
const radixCounts = new Uint32Array(1024);
const radixOffsets = new Uint32Array(256);

function ensureScratch(count) {
  if (metricKeys.length >= count) {
    return;
  }
  metricKeys = new Int32Array(count);
  sortIndices = new Uint32Array(count);
  sortScratch = new Uint32Array(count);
}

function requireIdentity(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new DeveloperError(`Segmented global ${label} is invalid`);
  }
}

function validatePageIdentity(value) {
  if (
    typeof value?.artifactIdentity !== "string" ||
    value.artifactIdentity.length === 0 ||
    !Number.isSafeInteger(value.pageIndex) ||
    value.pageIndex < 0 ||
    !Number.isSafeInteger(value.checksum) ||
    !Number.isSafeInteger(value.pageSplatCount) ||
    value.pageSplatCount < 1 ||
    value.expectedCoreBytes !== value.pageSplatCount * CORE_BYTES_PER_SPLAT ||
    value.positionBytes !== value.pageSplatCount * POSITION_BYTES_PER_SPLAT ||
    !Number.isSafeInteger(value.representationId) ||
    value.representationId < 0 ||
    !Number.isFinite(value.positionOriginX) ||
    !Number.isFinite(value.positionOriginY) ||
    !Number.isFinite(value.positionOriginZ)
  ) {
    throw new DeveloperError(
      "Segmented global position Page identity is invalid",
    );
  }
}

function samePage(left, right) {
  return (
    left?.artifactIdentity === right?.artifactIdentity &&
    left?.pageIndex === right?.pageIndex &&
    left?.checksum === right?.checksum &&
    left?.assetId === right?.assetId &&
    left?.assetLocalStart === right?.assetLocalStart &&
    left?.kind === right?.kind &&
    left?.semantic === right?.semantic &&
    left?.layoutId === right?.layoutId &&
    left?.packId === right?.packId &&
    left?.offset === right?.offset &&
    left?.storedBytes === right?.storedBytes &&
    left?.rawBytes === right?.rawBytes &&
    left?.pageSplatCount === right?.pageSplatCount &&
    left?.expectedCoreBytes === right?.expectedCoreBytes &&
    left?.positionBytes === right?.positionBytes &&
    left?.representationId === right?.representationId &&
    left?.positionOriginX === right?.positionOriginX &&
    left?.positionOriginY === right?.positionOriginY &&
    left?.positionOriginZ === right?.positionOriginZ
  );
}

function validateRetained(values, artifactIdentity) {
  if (!Array.isArray(values)) {
    throw new DeveloperError("Segmented global retained Pages are invalid");
  }
  let previous = -1;
  for (const value of values) {
    validatePageIdentity(value);
    if (
      value.artifactIdentity !== artifactIdentity ||
      value.pageIndex <= previous
    ) {
      throw new DeveloperError(
        "Segmented global retained Pages are not canonical",
      );
    }
    previous = value.pageIndex;
  }
}

export function prepareGaussianSegmentedCore(registration, current) {
  validatePageIdentity(registration);
  const uploadBytes = computeSegmentedAtlasPageFootprint(
    registration.pageSplatCount,
    1,
    0,
  ).uploadBytes;
  if (
    registration.uploadBytes !== uploadBytes ||
    !(registration.core instanceof Uint8Array) ||
    registration.core.byteOffset !== 0 ||
    registration.core.byteLength !== uploadBytes ||
    registration.core.buffer.byteLength !== uploadBytes ||
    (current && !samePage(current, registration))
  ) {
    throw new DeveloperError(
      "Segmented global position registration is invalid",
    );
  }
  const positions =
    current?.positions ?? new Float32Array(registration.pageSplatCount * 3);
  const source = new DataView(registration.core.buffer);
  for (let splat = 0; splat < registration.pageSplatCount; splat++) {
    const sourceOffset = splat * CORE_BYTES_PER_SPLAT;
    const target = splat * 3;
    const relativeX = source.getFloat32(sourceOffset, true);
    const relativeY = source.getFloat32(sourceOffset + 4, true);
    const relativeZ = source.getFloat32(sourceOffset + 8, true);
    const sourceX = current
      ? positions[target]
      : Math.fround(relativeX + registration.positionOriginX);
    const sourceY = current
      ? positions[target + 1]
      : Math.fround(relativeY + registration.positionOriginY);
    const sourceZ = current
      ? positions[target + 2]
      : Math.fround(relativeZ + registration.positionOriginZ);
    if (!current) {
      positions[target] = sourceX;
      positions[target + 1] = sourceY;
      positions[target + 2] = sourceZ;
    }
    if (
      !Number.isFinite(relativeX) ||
      !Number.isFinite(relativeY) ||
      !Number.isFinite(relativeZ) ||
      !Number.isFinite(sourceX) ||
      !Number.isFinite(sourceY) ||
      !Number.isFinite(sourceZ)
    ) {
      throw new DeveloperError("Segmented global position is non-finite");
    }
    source.setFloat32(sourceOffset, sourceX, true);
    source.setFloat32(sourceOffset + 4, sourceY, true);
    source.setFloat32(sourceOffset + 8, sourceZ, true);
  }
  for (
    let offset = registration.expectedCoreBytes;
    offset < uploadBytes;
    offset++
  ) {
    if (registration.core[offset] !== 0) {
      throw new DeveloperError("Segmented prepared Core padding is invalid");
    }
  }
  return positions;
}

function stagePreparation(parameters) {
  const next = new Map(repository);
  const staged = new Set();
  const buffers = new Set();
  let decodedPositionSplats = 0;
  let uploadBytes = 0;
  for (const registration of parameters.corePreparations ?? []) {
    validatePageIdentity(registration);
    if (
      registration.artifactIdentity !== parameters.artifactIdentity ||
      staged.has(registration.pageIndex) ||
      buffers.has(registration.core?.buffer)
    ) {
      throw new DeveloperError(
        "Segmented global position registration is invalid",
      );
    }
    const current = next.get(registration.pageIndex);
    if (current && !samePage(current, registration)) {
      throw new DeveloperError("Segmented global position Page is immutable");
    }
    uploadBytes += registration.uploadBytes;
    if (!Number.isSafeInteger(uploadBytes) || uploadBytes > 8 * 1024 * 1024) {
      throw new DeveloperError(
        "Segmented Core preparation exceeds byte window",
      );
    }
    const positions = prepareGaussianSegmentedCore(registration, current);
    buffers.add(registration.core.buffer);
    next.set(registration.pageIndex, {
      ...registration,
      core: undefined,
      positions,
    });
    staged.add(registration.pageIndex);
    decodedPositionSplats += current ? 0 : registration.pageSplatCount;
  }
  return {
    repository: new Map([...next].sort((a, b) => a[0] - b[0])),
    decodedPositionSplats,
  };
}

function acknowledgement(
  operation,
  parameters,
  next,
  scratchBytes,
  decodedPositionSplats,
) {
  const retainedPages = [...next.values()].map((entry) =>
    Object.freeze({
      artifactIdentity: entry.artifactIdentity,
      pageIndex: entry.pageIndex,
      checksum: entry.checksum,
      assetId: entry.assetId,
      assetLocalStart: entry.assetLocalStart,
      kind: entry.kind,
      semantic: entry.semantic,
      layoutId: entry.layoutId,
      packId: entry.packId,
      offset: entry.offset,
      storedBytes: entry.storedBytes,
      rawBytes: entry.rawBytes,
      pageSplatCount: entry.pageSplatCount,
      expectedCoreBytes: entry.expectedCoreBytes,
      positionBytes: entry.positionBytes,
      representationId: entry.representationId,
      positionOriginX: entry.positionOriginX,
      positionOriginY: entry.positionOriginY,
      positionOriginZ: entry.positionOriginZ,
    }),
  );
  const positionBytes = retainedPages.reduce(
    (sum, page) => sum + page.positionBytes,
    0,
  );
  return {
    operation,
    requestSerial: parameters.requestSerial,
    repositoryGeneration: repositoryGeneration,
    retainedPages,
    retainedPageIds: retainedPages.map((page) => page.pageIndex),
    confirmedPositionPageCount: retainedPages.length,
    confirmedPositionBytes: positionBytes,
    scratchBytes,
    decodedPositionSplats,
  };
}

function validateSort(parameters) {
  for (const name of [
    "artifactIdentity",
    "contentIdentity",
    "dispatchAttemptIdentity",
  ]) {
    requireIdentity(parameters[name], name);
  }
  for (const name of [
    "contentGeneration",
    "mappingGeneration",
    "viewGeneration",
    "requestSerial",
    "selectedSplatCount",
  ]) {
    if (!Number.isSafeInteger(parameters[name]) || parameters[name] < 1) {
      throw new DeveloperError(`Segmented global ${name} is invalid`);
    }
  }
  if (
    !Array.isArray(parameters.sortCenter) ||
    parameters.sortCenter.length !== 3 ||
    !parameters.sortCenter.every(Number.isFinite)
  ) {
    throw new DeveloperError("Segmented global sort center is invalid");
  }
  const arrays = [
    parameters.fragmentCorePageIds,
    parameters.fragmentPageLocalStarts,
    parameters.fragmentCounts,
    parameters.fragmentPresentationStarts,
  ];
  if (
    arrays.some((value) => !(value instanceof Uint32Array)) ||
    arrays.some((value) => value.length !== arrays[0].length) ||
    arrays[0].length < 1 ||
    !(parameters.ordering instanceof Uint32Array) ||
    parameters.ordering.byteOffset !== 0 ||
    parameters.ordering.byteLength !== parameters.ordering.buffer.byteLength ||
    parameters.ordering.length < parameters.selectedSplatCount
  ) {
    throw new DeveloperError("Segmented global sort arrays are invalid");
  }
}

function sort(parameters, next) {
  validateSort(parameters);
  const count = parameters.selectedSplatCount;
  ensureScratch(parameters.ordering.length);
  radixCounts.fill(0);
  let cursor = 0;
  const [centerX, centerY, centerZ] = parameters.sortCenter;
  for (
    let fragment = 0;
    fragment < parameters.fragmentCounts.length;
    fragment++
  ) {
    const page = next.get(parameters.fragmentCorePageIds[fragment]);
    const start = parameters.fragmentPageLocalStarts[fragment];
    const length = parameters.fragmentCounts[fragment];
    const destination = parameters.fragmentPresentationStarts[fragment];
    if (
      !page ||
      destination !== cursor ||
      length < 1 ||
      start + length > page.pageSplatCount
    ) {
      throw new DeveloperError("Segmented global fragment coverage is invalid");
    }
    for (let local = 0; local < length; local++) {
      const ordinal = destination + local;
      const source = (start + local) * 3;
      const dx = page.positions[source] - centerX;
      const dy = page.positions[source + 1] - centerY;
      const dz = page.positions[source + 2] - centerZ;
      const metric = -1000 * Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!Number.isFinite(metric)) {
        throw new DeveloperError("Segmented global sort metric is non-finite");
      }
      const quantized = Math.round(metric);
      if (quantized < -2147483648 || quantized > 2147483647) {
        throw new DeveloperError("Segmented global sort metric exceeds Int32");
      }
      metricKeys[ordinal] = quantized;
      sortIndices[ordinal] = ordinal;
      // Digit frequencies are independent of the intermediate index order.
      const key = quantized ^ 0x80000000;
      radixCounts[key & 0xff]++;
      radixCounts[256 + ((key >>> 8) & 0xff)]++;
      radixCounts[512 + ((key >>> 16) & 0xff)]++;
      radixCounts[768 + (key >>> 24)]++;
    }
    cursor += length;
  }
  if (cursor !== count) {
    throw new DeveloperError(
      "Segmented global fragment coverage is incomplete",
    );
  }
  let activePasses = 0;
  for (let pass = 0; pass < 4; pass++) {
    let constantDigit = false;
    for (let digit = 0; digit < 256; digit++) {
      if (radixCounts[pass * 256 + digit] === count) {
        constantDigit = true;
        break;
      }
    }
    if (!constantDigit) {
      activePasses |= 1 << pass;
    }
  }
  if (activePasses === 0) {
    for (let index = 0; index < count; index++) {
      parameters.ordering[index] = index;
    }
  } else {
    let source = sortIndices;
    let target = sortScratch;
    for (let pass = 0; pass < 4; pass++) {
      if ((activePasses & (1 << pass)) === 0) {
        continue;
      }
      activePasses &= ~(1 << pass);
      // The final effective pass writes the transferable result directly.
      if (activePasses === 0) {
        target = parameters.ordering;
      }
      let offset = 0;
      for (let digit = 0; digit < 256; digit++) {
        radixOffsets[digit] = offset;
        offset += radixCounts[pass * 256 + digit];
      }
      const shift = pass * 8;
      for (let index = 0; index < count; index++) {
        const ordinal = source[index];
        const digit = ((metricKeys[ordinal] ^ 0x80000000) >>> shift) & 0xff;
        target[radixOffsets[digit]++] = ordinal;
      }
      [source, target] = [target, source];
    }
  }
  parameters.ordering.fill(INVALID_INDEX, count);
  return (
    metricKeys.byteLength +
    sortIndices.byteLength +
    sortScratch.byteLength +
    radixCounts.byteLength +
    radixOffsets.byteLength
  );
}

export function sortGaussianSegmentedGlobalPositions(
  parameters,
  transferableObjects = [],
) {
  const operation = parameters?.operation ?? "SORT";
  if (!["SORT", "PREPARE_CORE", "PRUNE"].includes(operation)) {
    throw new DeveloperError("Segmented global Worker operation is invalid");
  }
  requireIdentity(parameters.artifactIdentity, "artifactIdentity");
  if (
    !Number.isSafeInteger(parameters.requestSerial) ||
    parameters.requestSerial < 1
  ) {
    throw new DeveloperError("Segmented global request serial is invalid");
  }
  if (parameters.repositoryGeneration !== repositoryGeneration) {
    throw new DeveloperError("Segmented repository generation is stale");
  }
  let next;
  let decodedPositionSplats = 0;
  if (operation === "PREPARE_CORE") {
    requireIdentity(parameters.contentIdentity, "preparation owner");
    if (
      !Array.isArray(parameters.corePreparations) ||
      parameters.corePreparations.length === 0
    ) {
      throw new DeveloperError("Segmented Core preparation batch is empty");
    }
    const staged = stagePreparation(parameters);
    next = staged.repository;
    decodedPositionSplats = staged.decodedPositionSplats;
  } else {
    validateRetained(parameters.retainedPages, parameters.artifactIdentity);
    const required = new Map();
    for (const identity of parameters.retainedPages) {
      const entry = repository.get(identity.pageIndex);
      if (!samePage(entry, identity)) {
        throw new DeveloperError(
          "Segmented global retained Page is unavailable",
        );
      }
      required.set(identity.pageIndex, entry);
    }
    next = required;
  }
  let scratchBytes = 0;
  if (operation === "SORT") {
    scratchBytes = sort(parameters, next);
  }
  if (operation !== "SORT") {
    repository = next;
    repositoryGeneration++;
  }
  const result = acknowledgement(
    operation,
    parameters,
    next,
    scratchBytes,
    decodedPositionSplats,
  );
  if (operation === "PREPARE_CORE") {
    result.contentIdentity = parameters.contentIdentity;
    result.preparedCore = parameters.corePreparations;
    for (const prepared of result.preparedCore) {
      transferableObjects.push(prepared.core.buffer);
    }
  }
  if (operation === "SORT") {
    Object.assign(result, {
      artifactIdentity: parameters.artifactIdentity,
      contentIdentity: parameters.contentIdentity,
      contentGeneration: parameters.contentGeneration,
      mappingGeneration: parameters.mappingGeneration,
      viewGeneration: parameters.viewGeneration,
      dispatchAttemptIdentity: parameters.dispatchAttemptIdentity,
      selectedSplatCount: parameters.selectedSplatCount,
      ordering: parameters.ordering,
      returnedOrderingBytes: parameters.ordering.byteLength,
    });
    transferableObjects.push(parameters.ordering.buffer);
  }
  return result;
}

export function resetGaussianSegmentedGlobalSorterRepositoryForSpecs() {
  repository = new Map();
  repositoryGeneration = 0;
  metricKeys = new Int32Array(0);
  sortIndices = new Uint32Array(0);
  sortScratch = new Uint32Array(0);
}

export default sortGaussianSegmentedGlobalPositions;
