/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
import {
  align,
  asUint8Array,
  assertZero,
  createView,
  hasMagic,
  readUint64,
  toSafeNumber,
  writeMagic,
  writeUint64,
} from "./_SceneGISGaussianFormatsBinary.js";
import { crc32WithZeroedRanges } from "./_SceneGISGaussianFormatsCrc32.js";
import {
  MACRO_CHUNK_SOURCE_UNIT_ID,
  MACRO_CHUNK_TRANSFORM_CONTRACT_ID,
  validateMacroChunkMetersPerUnit,
  validateMacroChunkRigidTransform,
} from "./_SceneGISGaussianManifest.js";

const MAGIC = Uint8Array.from([0x43, 0x45, 0x53, 0x4d, 0x43, 0x49, 0x34, 0]);
const VERSION = 4;
const LITTLE_ENDIAN_MARKER = 0x01020304;
const FIXED_HEADER_BYTES = 480;
const DIRECTORY_ENTRY_BYTES = 32;
const CHECKSUM_OFFSET = 24;
const CHECKSUM_BYTES = 4;
const DIRECTORY_OFFSET = FIXED_HEADER_BYTES;
const REQUIRED_SECTION_FLAG = 1;
const INVALID_NODE_INDEX = 0xffffffff;
const COORDINATE_SYSTEM = Object.freeze({ LOCAL: 0, ECEF: 1 });
const TRANSFORM_CONTRACT_RIGID_V1 = 1;
const SOURCE_UNIT_METRE = 1;
const IDENTITY_MATRIX = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

const hostEndianProbe = new Uint16Array([0x0102]);
const HOST_IS_LITTLE_ENDIAN = new Uint8Array(hostEndianProbe.buffer)[0] === 2;

export const SEGMENTED_HIERARCHY_SECTION_KIND = Object.freeze({
  NODE_TOPOLOGY: 1,
  NODE_CONTENT_BOUNDS: 2,
  NODE_PROXY: 3,
  LEAF_TOPOLOGY: 4,
  LEAF_CONTENT_BOUNDS: 5,
  LEAF_LEVEL_REPRESENTATIONS: 6,
  REPRESENTATIONS: 7,
  SEGMENTS: 8,
  ASSETS: 9,
  ASSET_PAGE_INDICES: 10,
  PAGES: 11,
  PACKS: 12,
});

export const SEGMENTED_HIERARCHY_COMPONENT_TYPE = Object.freeze({
  UINT8: 1,
  UINT16: 2,
  UINT32: 3,
  INT32: 4,
  FLOAT32: 5,
  FLOAT64: 6,
  BIGUINT64: 7,
});

const componentTypeInfo = new Map([
  [
    SEGMENTED_HIERARCHY_COMPONENT_TYPE.UINT8,
    Object.freeze({ bytes: 1, constructor: Uint8Array }),
  ],
  [
    SEGMENTED_HIERARCHY_COMPONENT_TYPE.UINT16,
    Object.freeze({ bytes: 2, constructor: Uint16Array }),
  ],
  [
    SEGMENTED_HIERARCHY_COMPONENT_TYPE.UINT32,
    Object.freeze({ bytes: 4, constructor: Uint32Array }),
  ],
  [
    SEGMENTED_HIERARCHY_COMPONENT_TYPE.INT32,
    Object.freeze({ bytes: 4, constructor: Int32Array }),
  ],
  [
    SEGMENTED_HIERARCHY_COMPONENT_TYPE.FLOAT32,
    Object.freeze({ bytes: 4, constructor: Float32Array }),
  ],
  [
    SEGMENTED_HIERARCHY_COMPONENT_TYPE.FLOAT64,
    Object.freeze({ bytes: 8, constructor: Float64Array }),
  ],
  [
    SEGMENTED_HIERARCHY_COMPONENT_TYPE.BIGUINT64,
    Object.freeze({ bytes: 8, constructor: BigUint64Array }),
  ],
]);

const knownSectionKinds = new Set(
  Object.values(SEGMENTED_HIERARCHY_SECTION_KIND),
);

function checkedAdd(left, right, label) {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return result;
}

function checkedMultiply(left, right, label) {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return result;
}

function requireUint32(value, label, { positive = false } = {}) {
  if (
    !Number.isInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > 0xffffffff
  ) {
    throw new RangeError(
      `${label} must be a${positive ? " positive" : ""} Uint32`,
    );
  }
  return value;
}

function requireInt32(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
    throw new RangeError(`${label} must be an Int32`);
  }
  return value;
}

function requireSha256(value, label) {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
    throw new TypeError(`${label} must be a 32-byte Uint8Array`);
  }
  return value;
}

function requireSafeUint64(value, label, { positive = false } = {}) {
  const integer = BigInt(value);
  if (
    integer < (positive ? 1n : 0n) ||
    integer > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new RangeError(`${label} exceeds the host-safe Uint64 range`);
  }
  return Number(integer);
}

function requireFiniteArray(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${label} must contain ${length} finite values`);
  }
  return Object.freeze([...value]);
}

function requireOrderedBounds(value, label) {
  const bounds = requireFiniteArray(value, 6, label);
  if (bounds[0] > bounds[3] || bounds[1] > bounds[4] || bounds[2] > bounds[5]) {
    throw new RangeError(`${label} must be ordered`);
  }
  return bounds;
}

function equalBytes(left, right) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < left.byteLength; i++) {
    difference |= left[i] ^ right[i];
  }
  return difference === 0;
}

function requireHeader(header) {
  if (header === null || typeof header !== "object") {
    throw new TypeError("segmented hierarchy header is required");
  }
  if (header.dimension !== 3) {
    throw new RangeError("SCALE-1F supports only a 3D hierarchy");
  }
  if (
    !Array.isArray(header.rootTileOrigin) ||
    header.rootTileOrigin.length !== 3
  ) {
    throw new TypeError(
      "rootTileOrigin must contain three signed Tile coordinates",
    );
  }
  const rootTileOrigin = Object.freeze(
    header.rootTileOrigin.map((value, component) =>
      requireInt32(value, `rootTileOrigin[${component}]`),
    ),
  );
  if (
    !Number.isSafeInteger(header.rootSizeTiles) ||
    header.rootSizeTiles <= 0 ||
    header.rootSizeTiles > 2 ** 21
  ) {
    throw new RangeError(
      "rootSizeTiles must be a power of two no greater than 2^21",
    );
  }
  const rootDepth = Math.log2(header.rootSizeTiles);
  if (!Number.isInteger(rootDepth) || rootDepth > 21) {
    throw new RangeError(
      "rootSizeTiles must encode no more than 21 XYZ levels",
    );
  }
  if (header.rootDepth !== rootDepth) {
    throw new RangeError("rootDepth must equal log2(rootSizeTiles)");
  }
  const leafCount = requireUint32(header.leafCount, "leafCount", {
    positive: true,
  });
  const nodeCount = requireUint32(header.nodeCount, "nodeCount", {
    positive: true,
  });
  if (nodeCount > leafCount * 2 - 1) {
    throw new RangeError("nodeCount exceeds the sparse hierarchy bound");
  }
  const fixedGridOrigin = requireFiniteArray(
    header.fixedGridOrigin,
    3,
    "fixedGridOrigin",
  );
  const cellSizeMeters = requireFiniteArray(
    header.cellSizeMeters,
    3,
    "cellSizeMeters",
  );
  if (!cellSizeMeters.every((value) => value > 0)) {
    throw new RangeError(
      "SCALE-1F cellSizeMeters must contain three positive finite values",
    );
  }
  const coordinateSystem = header.coordinateSystem;
  if (coordinateSystem !== "local" && coordinateSystem !== "ecef") {
    throw new RangeError("coordinateSystem must be local or ecef");
  }
  const maxShDegree = requireUint32(header.maxShDegree, "maxShDegree");
  if (maxShDegree > 3) {
    throw new RangeError("maxShDegree must be in [0, 3]");
  }
  const maximumAssetSplats = requireUint32(
    header.maximumAssetSplats,
    "maximumAssetSplats",
    { positive: true },
  );
  if (maximumAssetSplats !== 400000) {
    throw new RangeError("maximumAssetSplats must be exactly 400000");
  }
  const maximumPackBytes = requireSafeUint64(
    header.maximumPackBytes,
    "maximumPackBytes",
    { positive: true },
  );
  if (maximumPackBytes < 256) {
    throw new RangeError("maximumPackBytes must be at least 256");
  }
  const sourceVertexCount = requireSafeUint64(
    header.sourceVertexCount,
    "sourceVertexCount",
    { positive: true },
  );
  const retainedSplatCount = requireSafeUint64(
    header.retainedSplatCount,
    "retainedSplatCount",
    { positive: true },
  );
  if (sourceVertexCount < retainedSplatCount) {
    throw new RangeError("sourceVertexCount must cover retainedSplatCount");
  }
  if (
    !Number.isFinite(header.sourceCoverageMass) ||
    header.sourceCoverageMass <= 0
  ) {
    throw new RangeError("sourceCoverageMass must be finite and positive");
  }
  const metersPerUnit = validateMacroChunkMetersPerUnit(header.metersPerUnit);
  const localOrigin = requireFiniteArray(header.localOrigin, 3, "localOrigin");
  const localToFixed = validateMacroChunkRigidTransform(header.localToFixed);
  const sourceBounds = requireOrderedBounds(
    header.sourceBounds,
    "sourceBounds",
  );
  if (
    (header.transformContractId ?? MACRO_CHUNK_TRANSFORM_CONTRACT_ID) !==
      MACRO_CHUNK_TRANSFORM_CONTRACT_ID ||
    (header.sourceUnitId ?? MACRO_CHUNK_SOURCE_UNIT_ID) !==
      MACRO_CHUNK_SOURCE_UNIT_ID
  ) {
    throw new RangeError("MCI v3 transform contract must be rigid-v1/metre");
  }
  return Object.freeze({
    dimension: 3,
    rootTileOrigin,
    rootSizeTiles: header.rootSizeTiles,
    rootDepth,
    leafCount,
    nodeCount,
    fixedGridOrigin,
    cellSizeMeters,
    sourceSha256: requireSha256(header.sourceSha256, "sourceSha256"),
    policySha256: requireSha256(header.policySha256, "policySha256"),
    coordinateSystem,
    maxShDegree,
    maximumAssetSplats,
    maximumPackBytes,
    sourceVertexCount,
    retainedSplatCount,
    sourceCoverageMass: header.sourceCoverageMass,
    transformContractId: MACRO_CHUNK_TRANSFORM_CONTRACT_ID,
    sourceUnitId: MACRO_CHUNK_SOURCE_UNIT_ID,
    metersPerUnit,
    localOrigin,
    localToFixed,
    sourceBounds,
  });
}

function normalizeSection(section, requireData) {
  if (section === null || typeof section !== "object") {
    throw new TypeError("MCI v3 section descriptor must be an object");
  }
  const kind = requireUint32(section.kind, "section kind", { positive: true });
  if (kind > 0xffff || !knownSectionKinds.has(kind)) {
    throw new RangeError(`unknown MCI v3 writer section kind ${kind}`);
  }
  const componentType = requireUint32(
    section.componentType,
    "section componentType",
    { positive: true },
  );
  const info = componentTypeInfo.get(componentType);
  if (info === undefined) {
    throw new RangeError(`unknown MCI v3 component type ${componentType}`);
  }
  const componentCount = requireUint32(
    section.componentCount,
    "section componentCount",
    { positive: true },
  );
  let elementCount;
  let data;
  if (requireData) {
    data = section.data;
    if (!(data instanceof info.constructor)) {
      throw new TypeError(
        `section ${kind} data must be ${info.constructor.name}`,
      );
    }
    if (data.length % componentCount !== 0) {
      throw new RangeError(
        `section ${kind} data length must be divisible by componentCount`,
      );
    }
    elementCount = data.length / componentCount;
    if (
      section.elementCount !== undefined &&
      section.elementCount !== elementCount
    ) {
      throw new RangeError(`section ${kind} elementCount does not match data`);
    }
  } else {
    elementCount = requireUint32(section.elementCount, "section elementCount");
  }
  requireUint32(elementCount, "section elementCount");
  const scalarCount = checkedMultiply(
    componentCount,
    elementCount,
    `section ${kind} scalar count`,
  );
  const byteLength = checkedMultiply(
    scalarCount,
    info.bytes,
    `section ${kind} byteLength`,
  );
  return Object.freeze({
    kind,
    componentType,
    componentCount,
    elementCount,
    required: section.required !== false,
    data,
    byteLength,
    info,
  });
}

function layoutSections(sections, requireData) {
  if (!Array.isArray(sections)) {
    throw new TypeError("MCI v3 sections must be an array");
  }
  const normalized = sections
    .map((section) => normalizeSection(section, requireData))
    .sort((left, right) => left.kind - right.kind);
  for (let i = 1; i < normalized.length; i++) {
    if (normalized[i].kind === normalized[i - 1].kind) {
      throw new RangeError(
        `duplicate MCI v3 section kind ${normalized[i].kind}`,
      );
    }
  }

  const directoryBytes = checkedMultiply(
    normalized.length,
    DIRECTORY_ENTRY_BYTES,
    "MCI v3 directory bytes",
  );
  const headerBytes = align(
    checkedAdd(FIXED_HEADER_BYTES, directoryBytes, "MCI v3 header bytes"),
    8,
  );
  let cursor = headerBytes;
  const entries = normalized.map((section) => {
    cursor = align(cursor, 8);
    const byteOffset = cursor;
    cursor = checkedAdd(cursor, section.byteLength, "MCI v3 total byteLength");
    return Object.freeze({ ...section, byteOffset });
  });
  return Object.freeze({
    entries: Object.freeze(entries),
    directoryBytes,
    headerBytes,
    totalByteLength: cursor,
  });
}

export function estimateSegmentedHierarchyIndexByteLength(sections) {
  return layoutSections(sections, false).totalByteLength;
}

export function encodeSegmentedHierarchyIndex({ header, sections }) {
  if (!HOST_IS_LITTLE_ENDIAN) {
    throw new Error(
      "MCI v3 direct typed-array sections require little-endian host data",
    );
  }
  const normalizedHeader = requireHeader(header);
  const layout = layoutSections(sections, true);
  const bytes = new Uint8Array(layout.totalByteLength);
  const view = new DataView(bytes.buffer);

  writeMagic(bytes, MAGIC);
  view.setUint32(8, VERSION, true);
  view.setUint32(12, layout.headerBytes, true);
  writeUint64(view, 16, layout.totalByteLength);
  view.setUint32(CHECKSUM_OFFSET, 0, true);
  view.setUint32(28, LITTLE_ENDIAN_MARKER, true);
  view.setUint32(32, layout.entries.length, true);
  view.setUint32(36, normalizedHeader.dimension, true);
  for (let component = 0; component < 3; component++) {
    view.setInt32(
      40 + component * 4,
      normalizedHeader.rootTileOrigin[component],
      true,
    );
  }
  view.setUint32(52, 0, true);
  writeUint64(view, 56, normalizedHeader.rootSizeTiles);
  view.setUint32(64, normalizedHeader.rootDepth, true);
  view.setUint32(68, normalizedHeader.leafCount, true);
  view.setUint32(72, normalizedHeader.nodeCount, true);
  view.setUint32(76, 0, true);
  writeUint64(view, 80, DIRECTORY_OFFSET);
  writeUint64(view, 88, layout.directoryBytes);
  for (let component = 0; component < 3; component++) {
    view.setFloat64(
      96 + component * 8,
      normalizedHeader.fixedGridOrigin[component],
      true,
    );
    view.setFloat64(
      120 + component * 8,
      normalizedHeader.cellSizeMeters[component],
      true,
    );
  }
  bytes.set(normalizedHeader.sourceSha256, 144);
  bytes.set(normalizedHeader.policySha256, 176);
  view.setUint32(
    208,
    normalizedHeader.coordinateSystem === "local"
      ? COORDINATE_SYSTEM.LOCAL
      : COORDINATE_SYSTEM.ECEF,
    true,
  );
  view.setUint32(212, normalizedHeader.maxShDegree, true);
  view.setUint32(216, normalizedHeader.maximumAssetSplats, true);
  view.setUint32(220, TRANSFORM_CONTRACT_RIGID_V1, true);
  view.setUint32(224, SOURCE_UNIT_METRE, true);
  view.setUint32(228, 0, true);
  writeUint64(view, 232, normalizedHeader.maximumPackBytes);
  writeUint64(view, 240, normalizedHeader.sourceVertexCount);
  writeUint64(view, 248, normalizedHeader.retainedSplatCount);
  view.setFloat64(256, normalizedHeader.sourceCoverageMass, true);
  view.setFloat64(264, normalizedHeader.metersPerUnit, true);
  for (let component = 0; component < 3; component++) {
    view.setFloat64(
      272 + component * 8,
      normalizedHeader.localOrigin[component],
      true,
    );
  }
  for (let component = 0; component < 16; component++) {
    view.setFloat64(
      296 + component * 8,
      normalizedHeader.localToFixed[component],
      true,
    );
  }
  for (let component = 0; component < 6; component++) {
    view.setFloat64(
      424 + component * 8,
      normalizedHeader.sourceBounds[component],
      true,
    );
  }

  for (let i = 0; i < layout.entries.length; i++) {
    const entry = layout.entries[i];
    const directoryEntryOffset = DIRECTORY_OFFSET + i * DIRECTORY_ENTRY_BYTES;
    view.setUint16(directoryEntryOffset, entry.kind, true);
    view.setUint16(directoryEntryOffset + 2, entry.componentType, true);
    view.setUint32(directoryEntryOffset + 4, entry.componentCount, true);
    view.setUint32(directoryEntryOffset + 8, entry.elementCount, true);
    view.setUint32(
      directoryEntryOffset + 12,
      entry.required ? REQUIRED_SECTION_FLAG : 0,
      true,
    );
    writeUint64(view, directoryEntryOffset + 16, entry.byteOffset);
    writeUint64(view, directoryEntryOffset + 24, entry.byteLength);
    bytes.set(asUint8Array(entry.data), entry.byteOffset);
  }

  view.setUint32(
    CHECKSUM_OFFSET,
    crc32WithZeroedRanges(bytes, [[CHECKSUM_OFFSET, CHECKSUM_BYTES]]),
    true,
  );
  return bytes;
}

function typedSectionView(bytes, entry) {
  const info = componentTypeInfo.get(entry.componentType);
  if (info === undefined) {
    throw new RangeError(
      `unknown MCI v3 component type ${entry.componentType}`,
    );
  }
  const absoluteOffset = bytes.byteOffset + entry.byteOffset;
  if (absoluteOffset % info.bytes !== 0) {
    throw new RangeError(
      `section ${entry.kind} typed-array offset is misaligned`,
    );
  }
  return new info.constructor(
    bytes.buffer,
    absoluteOffset,
    entry.componentCount * entry.elementCount,
  );
}

export function decodeSegmentedHierarchyIndex(input) {
  if (!HOST_IS_LITTLE_ENDIAN) {
    throw new Error(
      "MCI v3 direct typed-array sections require little-endian host data",
    );
  }
  const bytes = asUint8Array(input);
  if (bytes.byteLength < FIXED_HEADER_BYTES || !hasMagic(bytes, MAGIC)) {
    throw new Error("Expected an MCI v3 segmented hierarchy index");
  }
  const view = createView(bytes);
  if (view.getUint32(8, true) !== VERSION) {
    throw new Error("Unsupported MCI segmented hierarchy index version");
  }
  const headerBytes = view.getUint32(12, true);
  const totalByteLength = toSafeNumber(
    readUint64(view, 16),
    "MCI v3 total byteLength",
  );
  if (totalByteLength !== bytes.byteLength) {
    throw new RangeError("MCI v3 total byteLength does not match input bytes");
  }
  const expectedChecksum = view.getUint32(CHECKSUM_OFFSET, true);
  const actualChecksum = crc32WithZeroedRanges(bytes, [
    [CHECKSUM_OFFSET, CHECKSUM_BYTES],
  ]);
  if (actualChecksum !== expectedChecksum) {
    throw new Error("MCI v3 checksum mismatch");
  }
  if (view.getUint32(28, true) !== LITTLE_ENDIAN_MARKER) {
    throw new Error("MCI v3 little-endian marker mismatch");
  }

  const sectionCount = view.getUint32(32, true);
  const directoryOffset = toSafeNumber(
    readUint64(view, 80),
    "MCI v3 directory offset",
  );
  const directoryBytes = toSafeNumber(
    readUint64(view, 88),
    "MCI v3 directory byteLength",
  );
  const expectedDirectoryBytes = checkedMultiply(
    sectionCount,
    DIRECTORY_ENTRY_BYTES,
    "MCI v3 directory bytes",
  );
  const expectedHeaderBytes = align(
    checkedAdd(
      FIXED_HEADER_BYTES,
      expectedDirectoryBytes,
      "MCI v3 header bytes",
    ),
    8,
  );
  if (
    directoryOffset !== DIRECTORY_OFFSET ||
    directoryBytes !== expectedDirectoryBytes ||
    headerBytes !== expectedHeaderBytes ||
    headerBytes > bytes.byteLength
  ) {
    throw new RangeError("MCI v3 section directory bounds are invalid");
  }
  if (
    view.getUint32(52, true) !== 0 ||
    view.getUint32(76, true) !== 0 ||
    view.getUint32(228, true) !== 0
  ) {
    throw new Error("MCI v3 reserved header word must be zero");
  }
  assertZero(bytes, 472, FIXED_HEADER_BYTES, "MCI v3 header");

  const coordinateCode = view.getUint32(208, true);
  if (
    ![COORDINATE_SYSTEM.LOCAL, COORDINATE_SYSTEM.ECEF].includes(coordinateCode)
  ) {
    throw new RangeError("MCI v3 coordinate system code is invalid");
  }
  if (
    view.getUint32(220, true) !== TRANSFORM_CONTRACT_RIGID_V1 ||
    view.getUint32(224, true) !== SOURCE_UNIT_METRE
  ) {
    throw new RangeError("MCI v3 transform/unit code is invalid");
  }

  const header = requireHeader({
    dimension: view.getUint32(36, true),
    rootTileOrigin: [0, 1, 2].map((component) =>
      view.getInt32(40 + component * 4, true),
    ),
    rootSizeTiles: toSafeNumber(readUint64(view, 56), "MCI v3 rootSizeTiles"),
    rootDepth: view.getUint32(64, true),
    leafCount: view.getUint32(68, true),
    nodeCount: view.getUint32(72, true),
    fixedGridOrigin: [0, 1, 2].map((component) =>
      view.getFloat64(96 + component * 8, true),
    ),
    cellSizeMeters: [0, 1, 2].map((component) =>
      view.getFloat64(120 + component * 8, true),
    ),
    sourceSha256: bytes.subarray(144, 176),
    policySha256: bytes.subarray(176, 208),
    coordinateSystem:
      coordinateCode === COORDINATE_SYSTEM.LOCAL ? "local" : "ecef",
    maxShDegree: view.getUint32(212, true),
    maximumAssetSplats: view.getUint32(216, true),
    maximumPackBytes: readUint64(view, 232),
    sourceVertexCount: readUint64(view, 240),
    retainedSplatCount: readUint64(view, 248),
    sourceCoverageMass: view.getFloat64(256, true),
    transformContractId: MACRO_CHUNK_TRANSFORM_CONTRACT_ID,
    sourceUnitId: MACRO_CHUNK_SOURCE_UNIT_ID,
    metersPerUnit: view.getFloat64(264, true),
    localOrigin: Array.from({ length: 3 }, (_, component) =>
      view.getFloat64(272 + component * 8, true),
    ),
    localToFixed: Array.from({ length: 16 }, (_, component) =>
      view.getFloat64(296 + component * 8, true),
    ),
    sourceBounds: Array.from({ length: 6 }, (_, component) =>
      view.getFloat64(424 + component * 8, true),
    ),
  });

  const sectionByKind = Object.create(null);
  const sections = [];
  let previousKind = 0;
  let previousEnd = headerBytes;
  for (let i = 0; i < sectionCount; i++) {
    const entryOffset = directoryOffset + i * DIRECTORY_ENTRY_BYTES;
    const kind = view.getUint16(entryOffset, true);
    const componentType = view.getUint16(entryOffset + 2, true);
    const componentCount = view.getUint32(entryOffset + 4, true);
    const elementCount = view.getUint32(entryOffset + 8, true);
    const flags = view.getUint32(entryOffset + 12, true);
    const byteOffset = toSafeNumber(
      readUint64(view, entryOffset + 16),
      `MCI v3 section ${kind} offset`,
    );
    const byteLength = toSafeNumber(
      readUint64(view, entryOffset + 24),
      `MCI v3 section ${kind} byteLength`,
    );
    if (kind <= previousKind) {
      throw new RangeError("MCI v3 section kinds must be unique and ordered");
    }
    previousKind = kind;
    if ((flags & ~REQUIRED_SECTION_FLAG) !== 0) {
      throw new Error(`section ${kind} has unknown required flags`);
    }
    const required = (flags & REQUIRED_SECTION_FLAG) !== 0;
    const known = knownSectionKinds.has(kind);
    if (!known && required) {
      throw new Error(`unknown required MCI v3 section kind ${kind}`);
    }
    const info = componentTypeInfo.get(componentType);
    if (info === undefined) {
      throw new RangeError(`unknown MCI v3 component type ${componentType}`);
    }
    if (componentCount === 0) {
      throw new RangeError(`section ${kind} componentCount must be positive`);
    }
    const expectedByteLength = checkedMultiply(
      checkedMultiply(
        componentCount,
        elementCount,
        `section ${kind} scalar count`,
      ),
      info.bytes,
      `section ${kind} byteLength`,
    );
    const sectionEnd = checkedAdd(
      byteOffset,
      byteLength,
      `section ${kind} end`,
    );
    if (
      byteLength !== expectedByteLength ||
      byteOffset < headerBytes ||
      byteOffset % 8 !== 0 ||
      byteOffset < previousEnd ||
      sectionEnd > bytes.byteLength
    ) {
      throw new RangeError(`section ${kind} byte range is invalid`);
    }
    assertZero(
      bytes,
      previousEnd,
      byteOffset,
      `MCI v3 section ${kind} padding`,
    );

    const descriptor = Object.freeze({
      kind,
      componentType,
      componentCount,
      elementCount,
      required,
      byteOffset,
      byteLength,
      data: typedSectionView(bytes, {
        kind,
        componentType,
        componentCount,
        elementCount,
        byteOffset,
      }),
    });
    sections.push(descriptor);
    sectionByKind[kind] = descriptor;
    previousEnd = sectionEnd;
  }
  if (previousEnd !== bytes.byteLength) {
    throw new RangeError("MCI v3 contains trailing bytes outside its sections");
  }

  return Object.freeze({
    version: VERSION,
    checksum: expectedChecksum,
    byteLength: bytes.byteLength,
    header,
    sections: Object.freeze(sections),
    sectionByKind: Object.freeze(sectionByKind),
  });
}

function packedNodeTopology(hierarchy) {
  const data = new Uint32Array(hierarchy.nodeCount * 8);
  for (let i = 0; i < hierarchy.nodeCount; i++) {
    const offset = i * 8;
    data[offset] = hierarchy.nodeParent[i];
    data[offset + 1] = hierarchy.nodeFirstChild[i];
    data[offset + 2] =
      hierarchy.nodeChildMask[i] | (hierarchy.nodeDepth[i] << 8);
    data[offset + 3] = hierarchy.nodePrefixLow[i];
    data[offset + 4] = hierarchy.nodePrefixHigh[i];
    data[offset + 5] = hierarchy.nodeFirstLeaf[i];
    data[offset + 6] = hierarchy.nodeLeafCount[i];
  }
  return data;
}

function packedLeafTopology(hierarchy) {
  const data = new Uint32Array(hierarchy.leafCount * 5);
  for (let index = 0; index < hierarchy.leafCount; index++) {
    const offset = index * 5;
    data[offset] = hierarchy.leafTileX[index] >>> 0;
    data[offset + 1] = hierarchy.leafTileY[index] >>> 0;
    data[offset + 2] = hierarchy.leafTileZ[index] >>> 0;
    data[offset + 3] = hierarchy.leafNodeIndex[index];
    data[offset + 4] = hierarchy.leafPhysicalPartCount[index];
  }
  return data;
}

export function encodeSparseHierarchyIndexSkeleton({
  hierarchy,
  fixedGridOrigin,
  cellSizeMeters,
  sourceSha256,
  policySha256,
}) {
  if (
    hierarchy === null ||
    typeof hierarchy !== "object" ||
    hierarchy.dimension !== 3
  ) {
    throw new TypeError("a 3D sparse hierarchy plan is required");
  }
  return encodeSegmentedHierarchyIndex({
    header: {
      dimension: 3,
      rootTileOrigin: [
        hierarchy.root.tileX,
        hierarchy.root.tileY,
        hierarchy.root.tileZ,
      ],
      rootSizeTiles: hierarchy.root.sizeTiles,
      rootDepth: hierarchy.root.depth,
      leafCount: hierarchy.leafCount,
      nodeCount: hierarchy.nodeCount,
      fixedGridOrigin,
      cellSizeMeters,
      sourceSha256,
      policySha256,
      coordinateSystem: "local",
      maxShDegree: 0,
      maximumAssetSplats: 400000,
      maximumPackBytes: 256,
      sourceVertexCount: hierarchy.leafCount,
      retainedSplatCount: hierarchy.leafCount,
      sourceCoverageMass: hierarchy.leafCount,
      metersPerUnit: 1,
      localOrigin: [0, 0, 0],
      localToFixed: IDENTITY_MATRIX,
      sourceBounds: [0, 0, 0, 0, 0, 0],
    },
    sections: [
      {
        kind: SEGMENTED_HIERARCHY_SECTION_KIND.NODE_TOPOLOGY,
        componentType: SEGMENTED_HIERARCHY_COMPONENT_TYPE.UINT32,
        componentCount: 8,
        data: packedNodeTopology(hierarchy),
      },
      {
        kind: SEGMENTED_HIERARCHY_SECTION_KIND.LEAF_TOPOLOGY,
        componentType: SEGMENTED_HIERARCHY_COMPONENT_TYPE.UINT32,
        componentCount: 5,
        data: packedLeafTopology(hierarchy),
      },
    ],
  });
}

function nodePrefix(nodeTopology, nodeIndex) {
  const offset = nodeIndex * 8;
  return (
    (BigInt(nodeTopology[offset + 4]) << 32n) | BigInt(nodeTopology[offset + 3])
  );
}

function popcount8(mask) {
  let count = 0;
  for (let ordinal = 0; ordinal < 8; ordinal++) {
    count += (mask >> ordinal) & 1;
  }
  return count;
}

function morton3d(x, y, z) {
  let result = 0n;
  for (let bit = 0; bit < 21; bit++) {
    const input = BigInt(bit);
    const output = BigInt(bit * 3);
    result |= ((BigInt(x) >> input) & 1n) << output;
    result |= ((BigInt(y) >> input) & 1n) << (output + 1n);
    result |= ((BigInt(z) >> input) & 1n) << (output + 2n);
  }
  return result;
}

function validateSparseTopology(decoded) {
  const { header } = decoded;
  const nodeSection =
    decoded.sectionByKind[SEGMENTED_HIERARCHY_SECTION_KIND.NODE_TOPOLOGY];
  const leafSection =
    decoded.sectionByKind[SEGMENTED_HIERARCHY_SECTION_KIND.LEAF_TOPOLOGY];
  if (
    nodeSection?.componentType !== SEGMENTED_HIERARCHY_COMPONENT_TYPE.UINT32 ||
    !nodeSection.required ||
    nodeSection.componentCount !== 8 ||
    nodeSection.elementCount !== header.nodeCount ||
    leafSection?.componentType !== SEGMENTED_HIERARCHY_COMPONENT_TYPE.UINT32 ||
    !leafSection.required ||
    leafSection.componentCount !== 5 ||
    leafSection.elementCount !== header.leafCount
  ) {
    throw new Error("MCI v3 hierarchy topology section shape is invalid");
  }

  const nodes = nodeSection.data;
  const leaves = leafSection.data;
  const claimedNode = new Uint8Array(header.nodeCount);
  const claimedLeafNode = new Uint8Array(header.nodeCount);
  if (
    nodes[0] !== INVALID_NODE_INDEX ||
    nodes[2] >>> 8 !== 0 ||
    nodes[3] !== 0 ||
    nodes[4] !== 0 ||
    nodes[5] !== 0 ||
    nodes[6] !== header.leafCount ||
    nodes[7] !== 0
  ) {
    throw new Error("MCI v3 hierarchy root topology is invalid");
  }

  for (let nodeIndex = 0; nodeIndex < header.nodeCount; nodeIndex++) {
    const offset = nodeIndex * 8;
    const parent = nodes[offset];
    const firstChild = nodes[offset + 1];
    const packed = nodes[offset + 2];
    const childMask = packed & 0xff;
    const depth = (packed >>> 8) & 0xff;
    const firstLeaf = nodes[offset + 5];
    const leafCount = nodes[offset + 6];
    if (
      packed >>> 16 !== 0 ||
      depth > header.rootDepth ||
      leafCount === 0 ||
      firstLeaf + leafCount > header.leafCount ||
      nodes[offset + 7] !== 0
    ) {
      throw new Error(`MCI v3 hierarchy Node ${nodeIndex} is malformed`);
    }
    if (
      nodeIndex > 0 &&
      (parent >= nodeIndex || parent === INVALID_NODE_INDEX)
    ) {
      throw new Error(`MCI v3 hierarchy Node ${nodeIndex} has invalid parent`);
    }
    const prefix = nodePrefix(nodes, nodeIndex);
    const prefixBits = depth * 3;
    if (prefixBits < 64 && prefix >> BigInt(prefixBits) !== 0n) {
      throw new Error(
        `MCI v3 hierarchy Node ${nodeIndex} prefix is out of range`,
      );
    }
    const childCount = popcount8(childMask);
    if (childCount === 0) {
      if (
        firstChild !== INVALID_NODE_INDEX ||
        depth !== header.rootDepth ||
        leafCount !== 1
      ) {
        throw new Error(`MCI v3 hierarchy leaf Node ${nodeIndex} is invalid`);
      }
      continue;
    }
    if (
      childCount < 2 ||
      firstChild === INVALID_NODE_INDEX ||
      firstChild + childCount > header.nodeCount
    ) {
      throw new Error(`MCI v3 hierarchy internal Node ${nodeIndex} is invalid`);
    }

    let expectedFirstLeaf = firstLeaf;
    let observedMask = 0;
    let previousChildCode = -1;
    for (let childOffset = 0; childOffset < childCount; childOffset++) {
      const childIndex = firstChild + childOffset;
      const childRecordOffset = childIndex * 8;
      const childDepth = (nodes[childRecordOffset + 2] >>> 8) & 0xff;
      const childFirstLeaf = nodes[childRecordOffset + 5];
      const childLeafCount = nodes[childRecordOffset + 6];
      const childPrefix = nodePrefix(nodes, childIndex);
      if (
        nodes[childRecordOffset] !== nodeIndex ||
        childDepth <= depth ||
        childFirstLeaf !== expectedFirstLeaf ||
        claimedNode[childIndex] !== 0 ||
        childPrefix >> BigInt((childDepth - depth) * 3) !== prefix
      ) {
        throw new Error(`MCI v3 hierarchy child ${childIndex} is inconsistent`);
      }
      const childCode = Number(
        (childPrefix >> BigInt((childDepth - depth - 1) * 3)) & 7n,
      );
      if (childCode <= previousChildCode) {
        throw new Error("MCI v3 hierarchy children are not Morton ordered");
      }
      previousChildCode = childCode;
      observedMask |= 1 << childCode;
      claimedNode[childIndex] = 1;
      expectedFirstLeaf += childLeafCount;
    }
    if (
      observedMask !== childMask ||
      expectedFirstLeaf !== firstLeaf + leafCount
    ) {
      throw new Error(
        `MCI v3 hierarchy Node ${nodeIndex} child coverage is invalid`,
      );
    }
  }

  for (let nodeIndex = 1; nodeIndex < header.nodeCount; nodeIndex++) {
    if (claimedNode[nodeIndex] !== 1) {
      throw new Error(
        `MCI v3 hierarchy Node ${nodeIndex} is not uniquely reachable`,
      );
    }
  }

  let previousMorton = -1n;
  for (let leafOrdinal = 0; leafOrdinal < header.leafCount; leafOrdinal++) {
    const offset = leafOrdinal * 5;
    const tileX = leaves[offset] | 0;
    const tileY = leaves[offset + 1] | 0;
    const tileZ = leaves[offset + 2] | 0;
    const leafNodeIndex = leaves[offset + 3];
    const partCount = leaves[offset + 4];
    if (leafNodeIndex >= header.nodeCount || partCount === 0) {
      throw new Error(`MCI v3 hierarchy leaf ${leafOrdinal} is malformed`);
    }
    const nodeOffset = leafNodeIndex * 8;
    if (
      (nodes[nodeOffset + 2] & 0xff) !== 0 ||
      nodes[nodeOffset + 5] !== leafOrdinal ||
      nodes[nodeOffset + 6] !== 1 ||
      claimedLeafNode[leafNodeIndex] !== 0
    ) {
      throw new Error(
        `MCI v3 hierarchy leaf ${leafOrdinal} ownership is invalid`,
      );
    }
    claimedLeafNode[leafNodeIndex] = 1;
    const relativeX = tileX - header.rootTileOrigin[0];
    const relativeY = tileY - header.rootTileOrigin[1];
    const relativeZ = tileZ - header.rootTileOrigin[2];
    if (
      relativeX < 0 ||
      relativeY < 0 ||
      relativeZ < 0 ||
      relativeX >= header.rootSizeTiles ||
      relativeY >= header.rootSizeTiles ||
      relativeZ >= header.rootSizeTiles
    ) {
      throw new Error(
        `MCI v3 hierarchy leaf ${leafOrdinal} is outside the root`,
      );
    }
    const morton = morton3d(relativeX, relativeY, relativeZ);
    if (
      morton <= previousMorton ||
      nodePrefix(nodes, leafNodeIndex) !== morton
    ) {
      throw new Error(
        `MCI v3 hierarchy leaf ${leafOrdinal} Morton identity is invalid`,
      );
    }
    previousMorton = morton;
  }
  for (let nodeIndex = 0; nodeIndex < header.nodeCount; nodeIndex++) {
    const childMask = nodes[nodeIndex * 8 + 2] & 0xff;
    if ((childMask === 0) !== (claimedLeafNode[nodeIndex] === 1)) {
      throw new Error(`MCI v3 hierarchy leaf Node ${nodeIndex} has no owner`);
    }
  }
}

export function decodeSparseHierarchyIndexSkeleton(
  input,
  { expectedSourceSha256, expectedPolicySha256 } = {},
) {
  const decoded = decodeSegmentedHierarchyIndex(input);
  if (
    expectedSourceSha256 !== undefined &&
    !equalBytes(
      decoded.header.sourceSha256,
      requireSha256(expectedSourceSha256, "expectedSourceSha256"),
    )
  ) {
    throw new Error("MCI v3 source identity mismatch");
  }
  if (
    expectedPolicySha256 !== undefined &&
    !equalBytes(
      decoded.header.policySha256,
      requireSha256(expectedPolicySha256, "expectedPolicySha256"),
    )
  ) {
    throw new Error("MCI v3 policy identity mismatch");
  }
  validateSparseTopology(decoded);
  return decoded;
}

export {
  COORDINATE_SYSTEM as SEGMENTED_HIERARCHY_COORDINATE_SYSTEM,
  DIRECTORY_ENTRY_BYTES as SEGMENTED_HIERARCHY_DIRECTORY_ENTRY_BYTES,
  FIXED_HEADER_BYTES as SEGMENTED_HIERARCHY_FIXED_HEADER_BYTES,
  VERSION as SEGMENTED_HIERARCHY_INDEX_VERSION,
};

/** @private */
const _SceneGISGaussianSegmentedHierarchyIndex = {
  SEGMENTED_HIERARCHY_SECTION_KIND,
  SEGMENTED_HIERARCHY_COMPONENT_TYPE,
  estimateSegmentedHierarchyIndexByteLength,
  encodeSegmentedHierarchyIndex,
  decodeSegmentedHierarchyIndex,
  encodeSparseHierarchyIndexSkeleton,
  decodeSparseHierarchyIndexSkeleton,
};
export default _SceneGISGaussianSegmentedHierarchyIndex;
