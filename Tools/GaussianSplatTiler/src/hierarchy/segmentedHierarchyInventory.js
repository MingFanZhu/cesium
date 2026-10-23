import { createHash } from "node:crypto";

import {
  decodeSegmentedHierarchyIndex,
  decodeSparseHierarchyIndexSkeleton,
  encodeSegmentedHierarchyIndex,
  SEGMENTED_HIERARCHY_COMPONENT_TYPE as TYPE,
  SEGMENTED_HIERARCHY_SECTION_KIND as KIND,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyIndex.js";

export const G2_INDEX_ROW_SCHEMA_ID = "segmented-hierarchy-mci4-word-rows-v3";

const INVALID_INDEX = 0xffffffff;
const floatScratch = new DataView(new ArrayBuffer(4));
const doubleScratch = new DataView(new ArrayBuffer(8));

function float32Bits(value) {
  floatScratch.setFloat32(0, value, true);
  return floatScratch.getUint32(0, true);
}

function nextFloat32(value, direction) {
  if (!Number.isFinite(value) || Object.is(value, direction < 0 ? -0 : 0)) {
    return direction < 0 ? -(2 ** -149) : 2 ** -149;
  }
  floatScratch.setFloat32(0, value, true);
  let bits = floatScratch.getUint32(0, true);
  bits += value > 0 === direction > 0 ? 1 : -1;
  floatScratch.setUint32(0, bits, true);
  return floatScratch.getFloat32(0, true);
}

export function outwardFloat32Bounds(bounds, origin) {
  const result = new Float32Array(6);
  for (let component = 0; component < 3; component++) {
    const minimum = bounds[component] - origin[component];
    const maximum = bounds[component + 3] - origin[component];
    let storedMinimum = Math.fround(minimum);
    let storedMaximum = Math.fround(maximum);
    if (storedMinimum > minimum) {
      storedMinimum = nextFloat32(storedMinimum, -1);
    }
    if (storedMaximum < maximum) {
      storedMaximum = nextFloat32(storedMaximum, 1);
    }
    result[component] = storedMinimum;
    result[component + 3] = storedMaximum;
  }
  return result;
}

function writeUint64Words(target, offset, value) {
  const integer = BigInt(value);
  target[offset] = Number(integer & 0xffffffffn);
  target[offset + 1] = Number((integer >> 32n) & 0xffffffffn);
}

function writeFloat64Words(target, offset, value) {
  doubleScratch.setFloat64(0, value, true);
  target[offset] = doubleScratch.getUint32(0, true);
  target[offset + 1] = doubleScratch.getUint32(4, true);
}

export function packNodeTopology(hierarchy) {
  const data = new Uint32Array(hierarchy.nodeCount * 8);
  for (let index = 0; index < hierarchy.nodeCount; index++) {
    const offset = index * 8;
    data[offset] = hierarchy.nodeParent[index];
    data[offset + 1] = hierarchy.nodeFirstChild[index];
    data[offset + 2] =
      hierarchy.nodeChildMask[index] | (hierarchy.nodeDepth[index] << 8);
    data[offset + 3] = hierarchy.nodePrefixLow[index];
    data[offset + 4] = hierarchy.nodePrefixHigh[index];
    data[offset + 5] = hierarchy.nodeFirstLeaf[index];
    data[offset + 6] = hierarchy.nodeLeafCount[index];
  }
  return data;
}

export function packLeafTopology(hierarchy) {
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

function section(kind, componentType, componentCount, data) {
  return { kind, componentType, componentCount, data };
}

export function createSegmentedHierarchyProductSections({
  hierarchy,
  rootOrigin,
  nodeBounds,
  nodeProxies,
  leafBounds,
  leafLevelRepresentations,
  representations,
  segments,
  assets,
  assetPageIndices,
  pages,
  packs,
}) {
  const nodeContent = new Float32Array(hierarchy.nodeCount * 6);
  const nodeProxyRows = new Uint32Array(hierarchy.nodeCount * 12);
  for (let index = 0; index < hierarchy.nodeCount; index++) {
    nodeContent.set(
      outwardFloat32Bounds(nodeBounds[index], rootOrigin),
      index * 6,
    );
    const row = nodeProxies[index];
    const offset = index * 12;
    nodeProxyRows[offset] = row.representationId;
    writeUint64Words(nodeProxyRows, offset + 1, row.representedSourceCount);
    writeFloat64Words(nodeProxyRows, offset + 3, row.geometricError);
    writeFloat64Words(nodeProxyRows, offset + 5, row.coverageMass);
    writeFloat64Words(nodeProxyRows, offset + 7, row.coverageWeightedP95Error);
    writeFloat64Words(nodeProxyRows, offset + 9, row.coverageWeightedP99Error);
    nodeProxyRows[offset + 11] = 0;
  }
  const leafContent = new Float32Array(hierarchy.leafCount * 12);
  for (let index = 0; index < hierarchy.leafCount; index++) {
    leafContent.set(
      outwardFloat32Bounds(leafBounds[index].selectionBounds, rootOrigin),
      index * 12,
    );
    leafContent.set(
      outwardFloat32Bounds(leafBounds[index].strictBounds, rootOrigin),
      index * 12 + 6,
    );
  }
  const representationRows = new Uint32Array(representations.length * 24);
  for (let index = 0; index < representations.length; index++) {
    const row = representations[index];
    const offset = index * 24;
    representationRows.set(
      [
        row.ownerNodeIndex,
        row.logicalLevel,
        row.firstSegment,
        row.segmentCount,
        row.firstAsset,
        row.assetCount,
        row.splatCount,
        row.mode === "CONSTANT_LEAF" ? 1 : 2,
      ],
      offset,
    );
    writeUint64Words(
      representationRows,
      offset + 8,
      row.representedSourceCount,
    );
    writeFloat64Words(representationRows, offset + 10, row.geometricError);
    writeFloat64Words(representationRows, offset + 12, row.origin[0]);
    writeFloat64Words(representationRows, offset + 14, row.origin[1]);
    writeFloat64Words(representationRows, offset + 16, row.origin[2]);
    writeFloat64Words(representationRows, offset + 18, row.coverageMass);
    writeFloat64Words(
      representationRows,
      offset + 20,
      row.coverageWeightedP95Error,
    );
    writeFloat64Words(
      representationRows,
      offset + 22,
      row.coverageWeightedP99Error,
    );
  }
  const segmentRows = new Uint32Array(segments.length * 14);
  for (let index = 0; index < segments.length; index++) {
    const row = segments[index];
    const offset = index * 14;
    segmentRows.set(
      [
        row.representationId,
        row.childNodeIndex,
        row.rangeStart,
        row.rangeCount,
      ],
      offset,
    );
    writeUint64Words(segmentRows, offset + 4, row.representedSourceCount);
    writeFloat64Words(segmentRows, offset + 6, row.geometricError);
    writeFloat64Words(segmentRows, offset + 8, row.coverageMass);
    writeFloat64Words(segmentRows, offset + 10, row.coverageWeightedP95Error);
    writeFloat64Words(segmentRows, offset + 12, row.coverageWeightedP99Error);
  }
  const assetRows = new Uint32Array(assets.length * 16);
  for (let index = 0; index < assets.length; index++) {
    const row = assets[index];
    const offset = index * 16;
    assetRows.set(
      [
        row.representationId,
        row.representationStart,
        row.splatCount,
        row.partIndex ?? INVALID_INDEX,
      ],
      offset,
    );
    const bounds = outwardFloat32Bounds(row.contentBounds, rootOrigin);
    for (let component = 0; component < 6; component++) {
      assetRows[offset + 4 + component] = float32Bits(bounds[component]);
    }
    assetRows.set(
      [
        row.corePageListFirst,
        row.corePageListCount,
        row.shPageListFirst,
        row.shPageListCount,
      ],
      offset + 10,
    );
    writeFloat64Words(assetRows, offset + 14, row.coverageMass);
  }
  const pageRows = new Uint32Array(pages.length * 15);
  for (let index = 0; index < pages.length; index++) {
    const row = pages[index];
    const offset = index * 15;
    pageRows.set(
      [
        row.assetId,
        row.assetStart,
        row.splatCount,
        row.kind,
        row.semantic,
        row.layoutId,
        row.packIndex,
      ],
      offset,
    );
    writeUint64Words(pageRows, offset + 7, BigInt(row.offset));
    writeUint64Words(pageRows, offset + 9, BigInt(row.storedBytes));
    writeUint64Words(pageRows, offset + 11, BigInt(row.rawBytes));
    pageRows[offset + 13] = row.checksum;
    pageRows[offset + 14] = 0;
  }
  const packRows = new Uint32Array(packs.length * 10);
  for (let index = 0; index < packs.length; index++) {
    const row = packs[index];
    const offset = index * 10;
    packRows.set(
      [row.kind, row.layoutId, row.firstPage, row.pageCount],
      offset,
    );
    writeUint64Words(packRows, offset + 4, BigInt(row.splatCount));
    writeUint64Words(packRows, offset + 6, BigInt(row.fileBytes));
    packRows[offset + 8] = row.checksum;
    packRows[offset + 9] = row.packIndex;
  }
  return [
    section(KIND.NODE_TOPOLOGY, TYPE.UINT32, 8, packNodeTopology(hierarchy)),
    section(KIND.NODE_CONTENT_BOUNDS, TYPE.FLOAT32, 6, nodeContent),
    section(KIND.NODE_PROXY, TYPE.UINT32, 12, nodeProxyRows),
    section(KIND.LEAF_TOPOLOGY, TYPE.UINT32, 5, packLeafTopology(hierarchy)),
    section(KIND.LEAF_CONTENT_BOUNDS, TYPE.FLOAT32, 12, leafContent),
    section(
      KIND.LEAF_LEVEL_REPRESENTATIONS,
      TYPE.UINT32,
      7,
      leafLevelRepresentations,
    ),
    section(KIND.REPRESENTATIONS, TYPE.UINT32, 24, representationRows),
    section(KIND.SEGMENTS, TYPE.UINT32, 14, segmentRows),
    section(KIND.ASSETS, TYPE.UINT32, 16, assetRows),
    section(KIND.ASSET_PAGE_INDICES, TYPE.UINT32, 1, assetPageIndices),
    section(KIND.PAGES, TYPE.UINT32, 15, pageRows),
    section(KIND.PACKS, TYPE.UINT32, 10, packRows),
  ];
}

export function encodeSegmentedHierarchyProductInventory({ header, sections }) {
  return encodeSegmentedHierarchyIndex({ header, sections });
}

export function decodeAndValidateSegmentedHierarchyProductInventory(
  bytes,
  expected = {},
) {
  const decoded = decodeSparseHierarchyIndexSkeleton(bytes, expected);
  if (decoded.sections.length !== 12) {
    throw new Error("SCALE-1F product MCI must contain all twelve sections");
  }
  const shapes = [8, 6, 12, 5, 12, 7, 24, 14, 16, 1, 15, 10];
  for (let index = 0; index < shapes.length; index++) {
    const sectionRecord = decoded.sectionByKind[index + 1];
    if (
      !sectionRecord ||
      !sectionRecord.required ||
      sectionRecord.componentCount !== shapes[index] ||
      (index === 1 || index === 4
        ? sectionRecord.componentType !== TYPE.FLOAT32
        : sectionRecord.componentType !== TYPE.UINT32)
    ) {
      throw new Error(
        `SCALE-1F product MCI section ${index + 1} shape mismatch`,
      );
    }
  }
  for (const kind of [
    KIND.NODE_TOPOLOGY,
    KIND.NODE_CONTENT_BOUNDS,
    KIND.NODE_PROXY,
  ]) {
    if (decoded.sectionByKind[kind].elementCount !== decoded.header.nodeCount) {
      throw new Error(
        `SCALE-1F product MCI Node section ${kind} element count mismatch`,
      );
    }
  }
  for (const kind of [
    KIND.LEAF_TOPOLOGY,
    KIND.LEAF_CONTENT_BOUNDS,
    KIND.LEAF_LEVEL_REPRESENTATIONS,
  ]) {
    if (decoded.sectionByKind[kind].elementCount !== decoded.header.leafCount) {
      throw new Error(
        `SCALE-1F product MCI leaf section ${kind} element count mismatch`,
      );
    }
  }
  return decodeSegmentedHierarchyIndex(bytes);
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
