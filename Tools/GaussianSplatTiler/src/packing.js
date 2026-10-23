import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { shLayoutKind } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianEncodingExt.js";
import {
  GSP_HEADER_BYTES,
  LAYOUT_KIND,
  MAX_PAGE_SPLATS,
  PACK_KIND,
  PAGE_ALIGNMENT,
  PAGE_SEMANTIC,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import {
  decodePackHeader,
  encodePack,
  validatePackPage,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsGsp.js";
import { DEFAULT_MAX_PACK_BYTES, PAYLOAD_PACKING_POLICY_ID } from "./policy.js";

function align(value) {
  return Math.ceil(value / PAGE_ALIGNMENT) * PAGE_ALIGNMENT;
}

function pageByteLength(count, bytesPerSplat) {
  return count * bytesPerSplat;
}

function pagePlans(payloads, shDegree) {
  const pages = [];
  for (const payload of payloads) {
    for (let start = 0; start < payload.count; start += MAX_PAGE_SPLATS) {
      const count = Math.min(MAX_PAGE_SPLATS, payload.count - start);
      pages.push({
        payloadId: payload.payloadId,
        kind: PACK_KIND.CORE,
        semantic: PAGE_SEMANTIC.CORE,
        layoutId: LAYOUT_KIND.EXT_CORE_32,
        start,
        count,
        rawBytes: pageByteLength(count, 32),
      });
    }
  }
  if (shDegree > 0) {
    for (const payload of payloads) {
      const shBytesPerSplat = [0, 16, 32, 64][shDegree];
      for (let start = 0; start < payload.count; start += MAX_PAGE_SPLATS) {
        const count = Math.min(MAX_PAGE_SPLATS, payload.count - start);
        pages.push({
          payloadId: payload.payloadId,
          kind: PACK_KIND.SH,
          semantic: [
            undefined,
            PAGE_SEMANTIC.SH1,
            PAGE_SEMANTIC.SH2,
            PAGE_SEMANTIC.SH3,
          ][shDegree],
          layoutId: shLayoutKind(shDegree),
          start,
          count,
          rawBytes: pageByteLength(count, shBytesPerSplat),
        });
      }
    }
  }
  return pages;
}

function groupPages(pages, maxPackBytes) {
  const groups = [];
  for (const page of pages) {
    const singlePagePackBytes = align(GSP_HEADER_BYTES) + page.rawBytes;
    if (singlePagePackBytes > maxPackBytes) {
      throw new Error(
        `Page ${page.payloadId}:${page.kind}:${page.start} requires ${singlePagePackBytes} bytes, exceeding maxPackBytes ${maxPackBytes}`,
      );
    }
    let group = groups.at(-1);
    const incompatible =
      !group || group.kind !== page.kind || group.layoutId !== page.layoutId;
    const nextBytes = incompatible
      ? singlePagePackBytes
      : align(group.fileBytes) + page.rawBytes;
    if (incompatible || (group.pages.length > 0 && nextBytes > maxPackBytes)) {
      group = {
        kind: page.kind,
        layoutId: page.layoutId,
        pages: [],
        fileBytes: GSP_HEADER_BYTES,
        splatCount: 0,
      };
      groups.push(group);
    }
    group.fileBytes = align(group.fileBytes) + page.rawBytes;
    group.pages.push(page);
    group.splatCount += page.count;
  }
  return groups;
}

export function planPayloadPacking(payloadCounts, shDegree, options = {}) {
  const maxPackBytes = options.maxPackBytes ?? DEFAULT_MAX_PACK_BYTES;
  const pages = pagePlans(payloadCounts, shDegree);
  const groups = groupPages(pages, maxPackBytes);
  return Object.freeze({
    policyId: PAYLOAD_PACKING_POLICY_ID,
    maxPackBytes,
    pageCount: pages.length,
    packCount: groups.length,
    rawPagePayloadBytes: pages.reduce((sum, page) => sum + page.rawBytes, 0),
    completedPackBytes: groups.reduce((sum, group) => sum + group.fileBytes, 0),
    maximumWorkingBufferBytes: Math.max(
      0,
      ...groups.map(
        (group) =>
          group.pages.reduce((sum, page) => sum + page.rawBytes, 0) +
          group.fileBytes,
      ),
    ),
    pages: Object.freeze(pages.map((page) => Object.freeze({ ...page }))),
    packs: Object.freeze(
      groups.map((group, packIndex) =>
        Object.freeze({
          packIndex,
          kind: group.kind,
          layoutId: group.layoutId,
          pageCount: group.pages.length,
          splatCount: group.splatCount,
          fileBytes: group.fileBytes,
        }),
      ),
    ),
  });
}

function packFileName(packIndex, kind) {
  const prefix = kind === PACK_KIND.CORE ? "core" : "sh";
  return `scene.${prefix}.${String(packIndex).padStart(3, "0")}.gsp`;
}

function pageKey(payloadId, kind, start) {
  return `${payloadId}\u0000${kind}\u0000${start}`;
}

export async function writePayloadPacks(
  payloads,
  shDegree,
  directory,
  options,
  encodedPageSpool,
) {
  const payloadCounts = payloads.map((payload) => ({
    payloadId: payload.payloadId,
    count: payload.splatCount ?? payload.data?.count,
  }));
  const plan = planPayloadPacking(payloadCounts, shDegree, options);
  const packsDirectory = path.join(directory, "packs");
  await mkdir(packsDirectory, { recursive: true });
  const encodedPageByKey = new Map();
  for (const payloadRecord of payloads) {
    for (const page of payloadRecord.encodedPages) {
      const key = pageKey(page.payloadId, page.kind, page.start);
      if (encodedPageByKey.has(key)) {
        throw new Error(`Duplicate encoded Page ${key}`);
      }
      encodedPageByKey.set(key, page);
    }
  }
  const encodedPages = plan.pages.map((page, index) => {
    const record = encodedPageByKey.get(
      pageKey(page.payloadId, page.kind, page.start),
    );
    if (
      record === undefined ||
      record.count !== page.count ||
      record.byteLength !== page.rawBytes
    ) {
      throw new Error("Payload order does not match the shared Page plan");
    }
    return { ...page, spoolRecord: record, index };
  });
  const groups = groupPages(encodedPages, plan.maxPackBytes);
  const pages = [];
  const packs = [];
  for (let packIndex = 0; packIndex < groups.length; packIndex++) {
    const group = groups[packIndex];
    const pageBytes = [];
    for (const page of group.pages) {
      pageBytes.push(await encodedPageSpool.read(page.spoolRecord));
    }
    const encoded = encodePack({
      packId: packIndex,
      kind: group.kind,
      layoutId: group.layoutId,
      splatCount: group.splatCount,
      pages: pageBytes,
      gsiChecksum: 0,
    });
    const fileName = packFileName(packIndex, group.kind);
    await writeFile(path.join(packsDirectory, fileName), encoded.bytes);
    const firstPage = pages.length;
    for (let localIndex = 0; localIndex < group.pages.length; localIndex++) {
      const source = group.pages[localIndex];
      const encodedPage = encoded.pages[localIndex];
      pages.push({
        pageIndex: pages.length,
        payloadId: source.payloadId,
        payloadStart: source.start,
        splatCount: source.count,
        kind: source.kind,
        semantic: source.semantic,
        layoutId: source.layoutId,
        packIndex,
        offset: Number(encodedPage.offset),
        storedBytes: Number(encodedPage.storedBytes),
        rawBytes: Number(encodedPage.rawBytes),
        checksum: encodedPage.checksum,
      });
    }
    packs.push({
      packIndex,
      fileName,
      kind: group.kind,
      layoutId: group.layoutId,
      firstPage,
      pageCount: group.pages.length,
      splatCount: group.splatCount,
      fileBytes: encoded.bytes.byteLength,
      checksum: encoded.checksum,
    });
  }
  return { plan, pages, packs };
}

export async function validatePayloadPacks(
  metadata,
  sceneDirectory,
  explicitPacksDirectory,
) {
  const packsDirectory =
    explicitPacksDirectory ?? path.join(sceneDirectory, "packs");
  for (const pack of metadata.packs) {
    const bytes = await readFile(path.join(packsDirectory, pack.fileName));
    const header = decodePackHeader(bytes);
    if (
      header.packId !== pack.packIndex ||
      header.kind !== pack.kind ||
      header.layoutId !== pack.layoutId ||
      Number(header.splatCount) !== pack.splatCount ||
      header.pageCount !== pack.pageCount ||
      Number(header.fileBytes) !== pack.fileBytes ||
      header.checksum !== pack.checksum
    ) {
      throw new Error(`Pack ${pack.packIndex} metadata mismatch`);
    }
    for (const page of metadata.pages.slice(
      pack.firstPage,
      pack.firstPage + pack.pageCount,
    )) {
      validatePackPage(bytes, {
        offset: BigInt(page.offset),
        storedBytes: BigInt(page.storedBytes),
        checksum: page.checksum,
      });
    }
  }
  return true;
}

export async function validateRuntimePayloadPacks(
  runtimeIndex,
  sceneDirectory,
  explicitPacksDirectory,
) {
  const packsDirectory =
    explicitPacksDirectory ?? path.join(sceneDirectory, "packs");
  for (const pack of runtimeIndex.packs) {
    const bytes = await readFile(
      path.join(packsDirectory, path.basename(pack.runtimeFileName)),
    );
    const header = decodePackHeader(bytes);
    if (
      header.packId !== pack.index ||
      header.kind !== pack.kind ||
      header.layoutId !== pack.layoutId ||
      Number(header.splatCount) !== pack.splatCount ||
      header.pageCount !== pack.pageCount ||
      Number(header.fileBytes) !== pack.fileBytes ||
      header.checksum !== pack.checksum
    ) {
      throw new Error(`Pack ${pack.index} runtime index mismatch`);
    }
    for (const page of runtimeIndex.pages.slice(
      pack.firstPageIndex,
      pack.firstPageIndex + pack.pageCount,
    )) {
      validatePackPage(bytes, {
        offset: BigInt(page.offset),
        storedBytes: BigInt(page.storedBytes),
        checksum: page.checksum,
      });
    }
  }
  return true;
}
