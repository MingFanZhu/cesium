import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { lstat, open, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  decodeCorePage,
  decodeShPage,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianEncodingExt.js";
import { covarianceFromScaleRotation } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianMath.js";
import { crc32 } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsCrc32.js";
import {
  GSP_HEADER_BYTES,
  PAGE_ALIGNMENT,
  PACK_KIND,
  VERSION,
  packFileName,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import { decodePackHeader } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsGsp.js";
import {
  createMacroChunkRuntimeManifest,
  MACRO_CHUNK_SOURCE_UNIT_ID,
  MACRO_CHUNK_TRANSFORM_CONTRACT_ID,
  parseMacroChunkRuntimeManifest,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianManifest.js";

import {
  LOD_RATIO_POLICY_ID,
  LOD_REUSE_POLICY_ID,
  PAYLOAD_PACKING_POLICY_ID,
} from "../policy.js";
import {
  FIXED_XYZ_GRID_PARTITION_POLICY_ID,
  SEGMENTED_FIXED_CELL_SIZE_METERS,
} from "../segmentedPartition.js";
import {
  PROXY_V2_FIT_ID,
  PROXY_V2_GRAPH_ID,
  PROXY_V2_POLICY_ID,
  PROXY_V2_PRIORITY_ID,
} from "../proxy-v2/constants.js";
import {
  G2_INDEX_ROW_SCHEMA_ID,
  outwardFloat32Bounds,
} from "./segmentedHierarchyInventory.js";
import {
  DYADIC_VISUAL_ERROR_METHOD,
  VISUAL_ERROR_BIN_COUNT,
} from "./visualErrorHistogram.js";
import {
  PROXY_SEED_LAYOUT_ID,
  SEGMENTED_PROXY_POLICY_ID,
} from "./segmentedProxyReducer.js";

const A1_POLICY_ID = "sparse-fixed-grid-patricia-octree-v1";
const MCI_HEADER_POLICY_ID = "segmented-hierarchy-mci4-fixed-header-480-v1";
const MANIFEST_POLICY_ID = "cesium-gaussian-macro-chunk-manifest/v1";
const ENCODED_BOUNDS_POLICY_ID = "encoded-bounds-from-core-bytes-v1";
const COVERAGE_POLICY_ID = "reducer-coverage-scalar-conservation-v1";
const PAGE_PACK_POLICY_ID = "gsp-page-pack-transport-v1";
const CRC_BUFFER_BYTES = 8 * 1024 * 1024;
const MCI_CELL_SIZE_METERS_OFFSET = 120;
const MCI_POLICY_SHA256_OFFSET = 176;
const DEFAULT_GRID_POLICY_ID = `${FIXED_XYZ_GRID_PARTITION_POLICY_ID}/exact-10-10-20-metre-cell-v1`;

// The restored Proxy V2 producer with its original fixed owner-cell domain.
// Freeze this identity rather than deriving another legacy producer whenever
// unrelated production policy lines change in the future.
export const LEGACY_NODE_DOMAIN_PRODUCT_POLICY_SHA256_HEX =
  "5b0acf361809de991f226c3368bce96e75436c8934d86d88265d6eb40586097f";

export const G2_PRODUCT_POLICY_LINES = Object.freeze([
  MCI_HEADER_POLICY_ID,
  G2_INDEX_ROW_SCHEMA_ID,
  "segmented-active-cut-v3",
  `${DYADIC_VISUAL_ERROR_METHOD}/${VISUAL_ERROR_BIN_COUNT}/p95-p99`,
  MANIFEST_POLICY_ID,
  `${MACRO_CHUNK_TRANSFORM_CONTRACT_ID}/${MACRO_CHUNK_SOURCE_UNIT_ID}`,
  A1_POLICY_ID,
  SEGMENTED_PROXY_POLICY_ID,
  PROXY_V2_POLICY_ID,
  PROXY_V2_GRAPH_ID,
  PROXY_V2_PRIORITY_ID,
  PROXY_V2_FIT_ID,
  PROXY_SEED_LAYOUT_ID,
  DEFAULT_GRID_POLICY_ID,
  `${LOD_RATIO_POLICY_ID}/${LOD_REUSE_POLICY_ID}`,
  `${PAYLOAD_PACKING_POLICY_ID}/${PAGE_PACK_POLICY_ID}`,
  ENCODED_BOUNDS_POLICY_ID,
  COVERAGE_POLICY_ID,
]);

export function g2ProductPolicySha256(
  cellSizeMeters = SEGMENTED_FIXED_CELL_SIZE_METERS,
) {
  if (
    !Array.isArray(cellSizeMeters) ||
    cellSizeMeters.length !== 3 ||
    !Array.from(cellSizeMeters).every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    throw new RangeError(
      "cellSizeMeters must contain three positive finite metres",
    );
  }
  const defaultGrid = cellSizeMeters.every(
    (value, index) => value === SEGMENTED_FIXED_CELL_SIZE_METERS[index],
  );
  const policyLines = defaultGrid
    ? G2_PRODUCT_POLICY_LINES
    : G2_PRODUCT_POLICY_LINES.map((line) =>
        line === DEFAULT_GRID_POLICY_ID
          ? `${FIXED_XYZ_GRID_PARTITION_POLICY_ID}/variable-metre-cell-v1/${JSON.stringify(cellSizeMeters)}`
          : line,
      );
  return createHash("sha256").update(policyLines.join("\n")).digest();
}

export async function resolveG2ProductPolicySha256(
  directory,
  expectedPolicySha256,
) {
  if (
    expectedPolicySha256 !== undefined &&
    (!(expectedPolicySha256 instanceof Uint8Array) ||
      expectedPolicySha256.byteLength !== 32)
  ) {
    throw new Error("SCALE-1A caller policy identity mismatch");
  }
  const metadata = new Uint8Array(
    MCI_POLICY_SHA256_OFFSET + 32 - MCI_CELL_SIZE_METERS_OFFSET,
  );
  const handle = await open(path.join(directory, "scene.mci"), "r");
  try {
    // This bounded probe only selects a known expected identity. The existing
    // validator independently reads and checks the complete MCI and its Packs.
    await readExactly(
      handle,
      metadata,
      MCI_CELL_SIZE_METERS_OFFSET,
      "MCI grid and product policy",
    );
  } finally {
    await handle.close();
  }
  const view = new DataView(metadata.buffer);
  const cellSizeMeters = [0, 1, 2].map((axis) =>
    view.getFloat64(axis * 8, true),
  );
  const currentPolicy = g2ProductPolicySha256(cellSizeMeters);
  const defaultGrid = cellSizeMeters.every(
    (value, index) => value === SEGMENTED_FIXED_CELL_SIZE_METERS[index],
  );
  const legacyPolicy = Buffer.from(
    LEGACY_NODE_DOMAIN_PRODUCT_POLICY_SHA256_HEX,
    "hex",
  );
  const supported = (policy) =>
    equalBytes(policy, currentPolicy) ||
    (defaultGrid && equalBytes(policy, legacyPolicy));
  if (expectedPolicySha256 !== undefined) {
    if (!supported(expectedPolicySha256)) {
      throw new Error("SCALE-1A caller policy identity mismatch");
    }
    // The full validator still compares the artifact to this exact identity.
    return new Uint8Array(expectedPolicySha256);
  }
  const policy = metadata.subarray(
    MCI_POLICY_SHA256_OFFSET - MCI_CELL_SIZE_METERS_OFFSET,
  );
  if (!supported(policy)) {
    throw new Error("Unsupported segmented product policy identity");
  }
  return policy;
}

export function equalBytes(left, right) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.byteLength; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function deterministicSum(values, label = "values") {
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${label} contains a non-positive finite scalar`);
    }
    total += value;
  }
  if (!Number.isFinite(total) || total <= 0) {
    throw new RangeError(`${label} total is invalid`);
  }
  return total;
}

export function coverageTolerance(count, mass) {
  return 64 * Number.EPSILON * Math.max(1, count) * Math.max(1, Math.abs(mass));
}

function emptyBounds() {
  return [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
}

function extendPoint(bounds, point) {
  for (let component = 0; component < 3; component++) {
    bounds[component] = Math.min(bounds[component], point[component]);
    bounds[component + 3] = Math.max(bounds[component + 3], point[component]);
  }
}

function extendStrictGaussian(bounds, gaussian, origin) {
  const position = gaussian.position.map(
    (value, component) => value + origin[component],
  );
  const covariance = covarianceFromScaleRotation(
    gaussian.scale,
    0,
    gaussian.rotation,
    0,
  );
  if (
    !position.every(Number.isFinite) ||
    !gaussian.scale.every((value) => Number.isFinite(value) && value > 0) ||
    !gaussian.rotation.every(Number.isFinite) ||
    !covariance.every(Number.isFinite) ||
    !Number.isFinite(gaussian.opacity) ||
    !gaussian.color.every(Number.isFinite)
  ) {
    throw new RangeError("decoded Core Page contains an invalid Gaussian");
  }
  const norm = Math.hypot(...gaussian.rotation);
  if (Math.abs(norm - 1) > 32 * 2 ** -23) {
    throw new RangeError("decoded Core Page quaternion is not normalized");
  }
  extendPoint(bounds.position, position);
  for (let component = 0; component < 3; component++) {
    const radius = 3 * Math.sqrt(Math.max(0, covariance[component]));
    if (!Number.isFinite(radius)) {
      throw new RangeError("decoded Core Page covariance is invalid");
    }
    bounds.strict[component] = Math.min(
      bounds.strict[component],
      position[component] - radius,
    );
    bounds.strict[component + 3] = Math.max(
      bounds.strict[component + 3],
      position[component] + radius,
    );
  }
}

export function boundsFromEncodedCorePages(encodedPages, origin) {
  const bounds = { position: emptyBounds(), strict: emptyBounds() };
  let decodedSplatCount = 0;
  for (const page of encodedPages) {
    if (page.kind !== 1) {
      continue;
    }
    const decoded = decodeCorePage(page.bytes);
    if (decoded.length !== page.count) {
      throw new Error("encoded Core Page count does not match its authority");
    }
    for (const gaussian of decoded) {
      extendStrictGaussian(bounds, gaussian, origin);
    }
    decodedSplatCount += decoded.length;
  }
  if (decodedSplatCount === 0) {
    throw new Error("Asset requires at least one encoded Core Page");
  }
  return Object.freeze({
    positionBounds: Object.freeze(bounds.position),
    strictBounds: Object.freeze(bounds.strict),
    decodedSplatCount,
  });
}

export function canonicalManifestBytes(mciBytes, checksum) {
  const manifest = createMacroChunkRuntimeManifest({
    url: "scene.mci",
    byteLength: mciBytes.byteLength,
    checksum,
  });
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function writeCanonicalProductManifest(
  directory,
  mciBytes,
  checksum,
) {
  const bytes = canonicalManifestBytes(mciBytes, checksum);
  await writeFile(path.join(directory, "scene.mcl.json"), bytes);
  return Object.freeze({
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

export async function validateCanonicalProductManifest(directory, mciBytes) {
  const bytes = await readFile(path.join(directory, "scene.mcl.json"));
  const parsed = parseMacroChunkRuntimeManifest(bytes);
  const expected = canonicalManifestBytes(mciBytes, parsed.index.checksum);
  if (!equalBytes(bytes, expected)) {
    throw new Error("SCALE-1A manifest is not canonical byte-for-byte");
  }
  const mciChecksum = new DataView(
    mciBytes.buffer,
    mciBytes.byteOffset,
    mciBytes.byteLength,
  ).getUint32(24, true);
  if (
    parsed.index.url !== "scene.mci" ||
    parsed.index.byteLength !== mciBytes.byteLength ||
    parsed.index.checksum !== mciChecksum
  ) {
    throw new Error("SCALE-1A manifest MCI identity is stale");
  }
  return Object.freeze({
    parsed,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    checksum: crc32(bytes),
  });
}

function readUint64Words(words, offset) {
  return (BigInt(words[offset + 1]) << 32n) | BigInt(words[offset]);
}

function safeUint64Words(words, offset, label) {
  const value = readUint64Words(words, offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the host-safe range`);
  }
  return Number(value);
}

function readFloat64Words(words, offset) {
  const scratch = new DataView(new ArrayBuffer(8));
  scratch.setUint32(0, words[offset], true);
  scratch.setUint32(4, words[offset + 1], true);
  return scratch.getFloat64(0, true);
}

async function readExactly(handle, bytes, position, label) {
  let cursor = 0;
  while (cursor < bytes.byteLength) {
    const { bytesRead } = await handle.read(
      bytes,
      cursor,
      bytes.byteLength - cursor,
      position + cursor,
    );
    if (bytesRead === 0) {
      throw new Error(`${label} ended before its declared byte range`);
    }
    cursor += bytesRead;
  }
}

async function assertZeroFileRange(handle, start, end, scratch, label) {
  let cursor = start;
  while (cursor < end) {
    const length = Math.min(scratch.byteLength, end - cursor);
    const bytes = scratch.subarray(0, length);
    await readExactly(handle, bytes, cursor, label);
    if (bytes.some((value) => value !== 0)) {
      throw new Error(`${label} must be zero-filled`);
    }
    cursor += length;
  }
}

function includeBounds(target, source) {
  for (let component = 0; component < 3; component++) {
    target[component] = Math.min(target[component], source[component]);
    target[component + 3] = Math.max(
      target[component + 3],
      source[component + 3],
    );
  }
}

function requireSourcePosition(position, sourceBounds) {
  for (let component = 0; component < 3; component++) {
    const tolerance =
      8 *
      2 ** -23 *
      Math.max(
        1,
        Math.abs(position[component]),
        Math.abs(sourceBounds[component]),
        Math.abs(sourceBounds[component + 3]),
      );
    if (
      position[component] < sourceBounds[component] - tolerance ||
      position[component] > sourceBounds[component + 3] + tolerance
    ) {
      throw new RangeError("decoded source position exceeds header bounds");
    }
  }
}

export async function validateBoundedProductPacks(
  decoded,
  directory,
  { onDuringPackValidation } = {},
) {
  const pageRows = decoded.sectionByKind[11].data;
  const packRows = decoded.sectionByKind[12].data;
  const assetRows = decoded.sectionByKind[9].data;
  const representationRows = decoded.sectionByKind[7].data;
  const nodeProxyRows = decoded.sectionByKind[3].data;
  const rootRepresentationId = nodeProxyRows[0];
  const rootRepresentationOffset = rootRepresentationId * 24;
  const rootOrigin = [0, 1, 2].map((component) =>
    readFloat64Words(
      representationRows,
      rootRepresentationOffset + 12 + component * 2,
    ),
  );
  const assetStrictBounds = Array.from(
    { length: decoded.sectionByKind[9].elementCount },
    emptyBounds,
  );
  const assetPositionBounds = Array.from(
    { length: decoded.sectionByKind[9].elementCount },
    emptyBounds,
  );
  const expectedPackNames = new Set();
  const packs = [];
  let maximumPackReadBytes = GSP_HEADER_BYTES;
  let maximumDecodedPageSplats = 0;
  const crcScratch = Buffer.allocUnsafe(CRC_BUFFER_BYTES);
  let injected = false;

  for (
    let packIndex = 0;
    packIndex < decoded.sectionByKind[12].elementCount;
    packIndex++
  ) {
    const packOffset = packIndex * 10;
    const kind = packRows[packOffset];
    const fileName = packFileName({ id: packIndex, kind });
    expectedPackNames.add(fileName);
    const filePath = path.join(directory, "packs", fileName);
    const fileStats = await lstat(filePath);
    if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
      throw new Error(`Pack ${fileName} must be a regular non-symlink file`);
    }
    const fileBytes = safeUint64Words(packRows, packOffset + 6, "Pack bytes");
    if (
      fileStats.size !== fileBytes ||
      fileBytes > decoded.header.maximumPackBytes
    ) {
      throw new Error(`Pack ${fileName} violates its declared hard cap`);
    }
    const handle = await open(filePath, "r");
    try {
      const headerBytes = Buffer.alloc(GSP_HEADER_BYTES);
      await readExactly(handle, headerBytes, 0, `Pack ${fileName} header`);
      const header = decodePackHeader(headerBytes, { verifyChecksum: false });
      const firstPage = packRows[packOffset + 2];
      const pageCount = packRows[packOffset + 3];
      const expectedPayloadOffset =
        pageCount === 0
          ? GSP_HEADER_BYTES
          : safeUint64Words(pageRows, firstPage * 15 + 7, "first Page offset");
      if (
        header.minor !== VERSION.minor ||
        header.flags !== 0 ||
        header.packId !== packIndex ||
        header.kind !== kind ||
        header.layoutId !== packRows[packOffset + 1] ||
        header.pageCount !== pageCount ||
        header.fileBytes !== BigInt(fileBytes) ||
        header.payloadOffset !== BigInt(expectedPayloadOffset) ||
        header.payloadBytes !== BigInt(fileBytes - expectedPayloadOffset) ||
        header.splatCount !== readUint64Words(packRows, packOffset + 4) ||
        header.checksum !== packRows[packOffset + 8] ||
        header.gsiChecksum !== 0
      ) {
        throw new Error(`Pack ${fileName} header identity mismatch`);
      }

      const sha = createHash("sha256");
      sha.update(headerBytes);
      const crcHeader = Buffer.from(headerBytes);
      crcHeader.fill(0, 64, 68);
      crcHeader.fill(0, 72, 76);
      let checksum = crc32(crcHeader);
      let cursor = GSP_HEADER_BYTES;
      while (cursor < fileBytes) {
        const length = Math.min(CRC_BUFFER_BYTES, fileBytes - cursor);
        const bytes = crcScratch.subarray(0, length);
        await readExactly(handle, bytes, cursor, `Pack ${fileName} CRC stream`);
        checksum = crc32(bytes, checksum);
        sha.update(bytes);
        maximumPackReadBytes = Math.max(maximumPackReadBytes, length);
        cursor += length;
      }
      if (checksum !== header.checksum) {
        throw new Error(`Pack ${fileName} whole-file CRC mismatch`);
      }

      let previousEnd = GSP_HEADER_BYTES;
      for (let local = 0; local < pageCount; local++) {
        const pageId = firstPage + local;
        const pageOffset = pageId * 15;
        const offset = safeUint64Words(pageRows, pageOffset + 7, "Page offset");
        const storedBytes = safeUint64Words(
          pageRows,
          pageOffset + 9,
          "Page storedBytes",
        );
        if (
          offset % PAGE_ALIGNMENT !== 0 ||
          offset < previousEnd ||
          storedBytes > fileBytes - offset
        ) {
          throw new Error(
            `Pack ${fileName} Page ${pageId} physical range is invalid`,
          );
        }
        await assertZeroFileRange(
          handle,
          previousEnd,
          offset,
          crcScratch,
          `Pack ${fileName} Page padding`,
        );
        const pageBytes = Buffer.allocUnsafe(storedBytes);
        await readExactly(handle, pageBytes, offset, `Pack ${fileName} Page`);
        maximumPackReadBytes = Math.max(maximumPackReadBytes, storedBytes);
        if (crc32(pageBytes) !== pageRows[pageOffset + 13]) {
          throw new Error(`Pack ${fileName} Page ${pageId} CRC mismatch`);
        }
        const pageSplats = pageRows[pageOffset + 2];
        maximumDecodedPageSplats = Math.max(
          maximumDecodedPageSplats,
          pageSplats,
        );
        if (kind === PACK_KIND.CORE) {
          const assetId = pageRows[pageOffset];
          const representationId = assetRows[assetId * 16];
          const representationOffset = representationId * 24;
          const origin = [0, 1, 2].map((component) =>
            readFloat64Words(
              representationRows,
              representationOffset + 12 + component * 2,
            ),
          );
          const pageBounds = boundsFromEncodedCorePages(
            [{ kind, count: pageSplats, bytes: pageBytes }],
            origin,
          );
          for (
            let gaussianIndex = 0;
            gaussianIndex < pageSplats;
            gaussianIndex++
          ) {
            const relative = new DataView(
              pageBytes.buffer,
              pageBytes.byteOffset + gaussianIndex * 32,
              12,
            );
            requireSourcePosition(
              [0, 1, 2].map(
                (component) =>
                  relative.getFloat32(component * 4, true) + origin[component],
              ),
              decoded.header.sourceBounds,
            );
          }
          includeBounds(assetStrictBounds[assetId], pageBounds.strictBounds);
          includeBounds(
            assetPositionBounds[assetId],
            pageBounds.positionBounds,
          );
        } else {
          const decodedSh = decodeShPage(pageBytes, decoded.header.maxShDegree);
          if (!decodedSh.every(Number.isFinite)) {
            throw new RangeError(`Pack ${fileName} SH Page is non-finite`);
          }
        }
        previousEnd = offset + storedBytes;
      }
      if (previousEnd !== fileBytes) {
        throw new Error(`Pack ${fileName} contains trailing or missing bytes`);
      }
      if (!injected) {
        injected = true;
        await onDuringPackValidation?.();
      }
      packs.push(
        Object.freeze({
          fileName,
          kind,
          fileBytes,
          checksum,
          sha256: sha.digest("hex"),
        }),
      );
    } finally {
      await handle.close();
    }
  }

  for (let assetId = 0; assetId < assetStrictBounds.length; assetId++) {
    if (!assetStrictBounds[assetId].every(Number.isFinite)) {
      throw new Error(`Asset ${assetId} has no decoded Core bounds`);
    }
    const stored = outwardFloat32Bounds(assetStrictBounds[assetId], rootOrigin);
    const scratch = new DataView(new ArrayBuffer(4));
    for (let component = 0; component < 6; component++) {
      scratch.setFloat32(0, stored[component], true);
      if (
        scratch.getUint32(0, true) !== assetRows[assetId * 16 + 4 + component]
      ) {
        throw new Error(`Asset ${assetId} encoded bounds are stale`);
      }
    }
  }

  const rootEntries = await readdir(directory, { withFileTypes: true });
  const allowedRoot = new Set([
    "scene.mcl.json",
    "scene.mci",
    "scene.report.json",
    "packs",
  ]);
  for (const entry of rootEntries) {
    if (!allowedRoot.has(entry.name) || entry.isSymbolicLink()) {
      throw new Error(
        `SCALE-1A artifact contains extra root entry ${entry.name}`,
      );
    }
  }
  const packEntries = await readdir(path.join(directory, "packs"), {
    withFileTypes: true,
  });
  if (
    packEntries.length !== expectedPackNames.size ||
    packEntries.some(
      (entry) =>
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !expectedPackNames.has(entry.name),
    )
  ) {
    throw new Error("SCALE-1A packs directory allowlist mismatch");
  }

  return Object.freeze({
    assetStrictBounds: Object.freeze(assetStrictBounds),
    assetPositionBounds: Object.freeze(assetPositionBounds),
    packs: Object.freeze(packs),
    validator: Object.freeze({
      maximumPackReadBytes,
      crcBufferBytes: CRC_BUFFER_BYTES,
      maximumDecodedPageSplats,
    }),
  });
}
