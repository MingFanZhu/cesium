import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  lstat,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { normalizeSegmentedGridOptions } from "./segmentedPartition.js";
import { createEncodedPageSpool } from "./encodedPageSpool.js";
import { emptyBounds, unionBounds } from "./bounds.js";
import { writePayloadPacks } from "./packing.js";
import { planSparseFixedGrid3dHierarchy } from "./hierarchy/sparseHierarchy.js";
import {
  createSegmentedHierarchyProductSections,
  encodeSegmentedHierarchyProductInventory,
} from "./hierarchy/segmentedHierarchyInventory.js";
import {
  boundsFromEncodedCorePages,
  deterministicSum,
  writeCanonicalProductManifest,
} from "./hierarchy/segmentedHierarchyProductArtifact.js";
import { validateSegmentedProductStructure } from "./hierarchy/segmentedProductValidator.js";
import { decodeSegmentedHierarchyIndex } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyIndex.js";
import { decodeSegmentedHierarchyRuntimeIndex } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";
import { validateMacroChunkRigidTransform } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianManifest.js";
import {
  PREBUILT_LOD_POLICY,
  prebuiltLodPolicySha256,
} from "./prebuiltLodPolicy.js";
import {
  readPrebuiltLodManifest,
  partitionPrebuiltLevels,
  readCellRange,
  assertSourcesUnchanged,
} from "./prebuiltLodSource.js";
import {
  createReferenceBins,
  measureImportedError,
  maximumErrors,
  ZERO_ERROR,
} from "./prebuiltLodError.js";

const INVALID = 0xffffffff;
const MAX_ASSET = 400000;
const MAX_PAGE = 65536;
const sumCount = (cells) => cells.reduce((sum, cell) => sum + cell.count, 0);
const mergeBounds = (bounds) =>
  bounds.reduce((result, item) => unionBounds(result, item), emptyBounds());

function children(hierarchy, node) {
  const count = hierarchy.nodeChildMask[node]
    .toString(2)
    .replaceAll("0", "").length;
  return Array.from(
    { length: count },
    (_, i) => hierarchy.nodeFirstChild[node] + i,
  );
}

async function assertAbsent(target) {
  try {
    await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error("Output already exists: " + target);
}

export async function validatePrebuiltLodProduct(directory) {
  const bytes = await readFile(path.join(directory, "scene.mci"));
  const decoded = decodeSegmentedHierarchyIndex(bytes);
  const result = await validateSegmentedProductStructure(directory, {
    expectedPolicySha256: prebuiltLodPolicySha256(
      decoded.header.cellSizeMeters,
    ),
  });
  // Exercise the unmodified public runtime's complete reader as a publication gate.
  const runtime = decodeSegmentedHierarchyRuntimeIndex(bytes);
  return {
    mciSha256: result.mciSha256,
    header: decoded.header,
    nodeCount: runtime.nodeCount,
    leafCount: runtime.leafCount,
    packs: result.packs,
    validator: result.validator,
  };
}

/** Import authored scene LODs into the existing segmented per-tile runtime ABI. */
export async function buildPrebuiltLodProduct(
  manifestFile,
  output,
  { onProgress } = {},
) {
  const started = Date.now();
  const { manifest, inputs, coordinateComments } =
    await readPrebuiltLodManifest(manifestFile);
  const options = normalizeSegmentedGridOptions({
    fixedGridOrigin: [0, 0, 0],
    maxPackBytes: 64 * 1024 * 1024,
    ...manifest,
  });
  validateMacroChunkRigidTransform(options.localToFixed);
  if (
    options.metersPerUnit !== 1 ||
    options.batchSize > MAX_PAGE ||
    options.maxPackBytes > 512 * 1024 * 1024
  ) {
    throw new Error(
      "Prebuilt import requires metre coordinates, batchSize <= 65536 and maxPackBytes <= 512 MiB",
    );
  }
  const target = path.resolve(output),
    parent = path.dirname(target);
  await assertAbsent(target);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(
    path.join(parent, "." + path.basename(target) + "-import-"),
  );
  let sourceSpool,
    pageSpool,
    published = false;
  try {
    sourceSpool = await createEncodedPageSpool({ temporaryDirectory: staging });
    pageSpool = await createEncodedPageSpool({ temporaryDirectory: staging });
    const { levels, origin, shStride } = await partitionPrebuiltLevels(
      inputs,
      options,
      sourceSpool,
      onProgress,
    );
    const finestCells = [...levels[0].values()];
    const hierarchy = planSparseFixedGrid3dHierarchy({
      tileX: Int32Array.from(finestCells, (cell) => cell.xyz[0]),
      tileY: Int32Array.from(finestCells, (cell) => cell.xyz[1]),
      tileZ: Int32Array.from(finestCells, (cell) => cell.xyz[2]),
      physicalPartCount: Uint32Array.from(finestCells, (cell) =>
        Math.ceil(cell.count / MAX_ASSET),
      ),
    });
    if (inputs.length === 8 && hierarchy.nodeCount === 1) {
      throw new Error(
        "Eight input levels need at least two leaf tiles: MCI4 has seven leaf slots",
      );
    }
    const representations = [],
      segments = [],
      assets = [];
    const nodeProxies = new Array(hierarchy.nodeCount);
    const nodeSources = new Array(hierarchy.nodeCount);
    const nodeBounds = new Array(hierarchy.nodeCount);
    const nodeRadius = new Float64Array(hierarchy.nodeCount);
    const leafBounds = new Array(hierarchy.leafCount);
    const leafLevelRepresentations = new Uint32Array(hierarchy.leafCount * 7);
    const eighthSources = new Map(),
      exceptions = [],
      leafReport = [];
    const sourceBounds = emptyBounds();

    async function addRepresentation({
      ownerNodeIndex,
      logicalLevel,
      cells,
      metrics,
      representedSourceCount,
      coverageMass,
      firstSegment = INVALID,
      segmentCount = 0,
      partCount = Math.ceil(sumCount(cells) / MAX_ASSET),
    }) {
      const splatCount = sumCount(cells);
      if (
        !Number.isSafeInteger(splatCount) ||
        splatCount < partCount ||
        splatCount > INVALID
      ) {
        throw new Error(
          "Representation exceeds the existing MCI4 count/part limits",
        );
      }
      const id = representations.length;
      const representation = {
        ownerNodeIndex,
        logicalLevel,
        firstSegment,
        segmentCount,
        firstAsset: assets.length,
        assetCount: partCount,
        splatCount,
        mode: segmentCount ? "INTERNAL_SEGMENTED" : "CONSTANT_LEAF",
        representedSourceCount,
        coverageMass,
        ...metrics,
        origin,
      };
      representations.push(representation);
      let representationStart = 0;
      for (let part = 0; part < partCount; part++) {
        const count =
          Math.floor(splatCount / partCount) +
          (part < splatCount % partCount ? 1 : 0);
        const assetId = assets.length,
          payloadId = String(assetId);
        const asset = {
          assetId,
          payloadId,
          representationId: id,
          representationStart,
          splatCount: count,
          partIndex: segmentCount ? INVALID : part,
          contentBounds: emptyBounds(),
          positionBounds: emptyBounds(),
          encodedPages: [],
          // Source ancestry is unknown: apportion reference-domain coverage by
          // the physical range length, never substitute proxy opacity mass.
          coverageMass: coverageMass * (count / splatCount),
        };
        for (let start = 0; start < count; start += MAX_PAGE) {
          const pageCount = Math.min(MAX_PAGE, count - start);
          const bytes = await readCellRange(
            cells,
            1,
            representationStart + start,
            pageCount,
            32,
            sourceSpool,
          );
          const page = { payloadId, kind: 1, start, count: pageCount, bytes };
          const bounds = boundsFromEncodedCorePages([page], origin);
          unionBounds(asset.contentBounds, bounds.strictBounds);
          unionBounds(asset.positionBounds, bounds.positionBounds);
          asset.encodedPages.push(await pageSpool.append(page));
          if (shStride) {
            asset.encodedPages.push(
              await pageSpool.append({
                payloadId,
                kind: 2,
                start,
                count: pageCount,
                bytes: await readCellRange(
                  cells,
                  2,
                  representationStart + start,
                  pageCount,
                  shStride,
                  sourceSpool,
                ),
              }),
            );
          }
        }
        assets.push(asset);
        representationStart += count;
      }
      return id;
    }

    function proxy(id) {
      const r = representations[id];
      return {
        representationId: id,
        representedSourceCount: r.representedSourceCount,
        coverageMass: r.coverageMass,
        ...maximumErrors([r]),
      };
    }
    function representationBounds(id, field) {
      const r = representations[id];
      return mergeBounds(
        assets
          .slice(r.firstAsset, r.firstAsset + r.assetCount)
          .map((a) => a[field]),
      );
    }

    for (let leaf = 0; leaf < hierarchy.leafCount; leaf++) {
      const finest = finestCells[hierarchy.sourceLeafIndex[leaf]];
      const node = hierarchy.leafNodeIndex[leaf];
      const partCount = hierarchy.leafPhysicalPartCount[leaf];
      const reference = await createReferenceBins(
        finest,
        sourceSpool,
        origin,
        options,
      );
      let previous = finest,
        metrics = ZERO_ERROR,
        id;
      const selected = [],
        strict = [];
      let maximumRadius = finest.maxSupportRadius;
      for (let level = 0; level < 7; level++) {
        let candidate = levels[level]?.get(finest.key);
        let reason;
        if (level >= inputs.length) {
          reason = "unused-slot";
        } else if (!candidate) {
          reason = "empty-coarse-cell";
        } else if (candidate.count < partCount) {
          reason = "fewer-points-than-physical-parts";
        } else if (candidate.count > previous.count) {
          reason = "coarse-count-increases";
        }
        if (level === 0 || !reason) {
          if (level > 0) {
            metrics = await measureImportedError(
              reference,
              candidate,
              sourceSpool,
              origin,
              options,
              metrics,
            );
          }
          id = await addRepresentation({
            ownerNodeIndex: node,
            logicalLevel: level,
            cells: [candidate],
            metrics,
            representedSourceCount: finest.count,
            coverageMass: reference.coverageMass,
            partCount,
          });
          strict.push(representationBounds(id, "contentBounds"));
          previous = candidate;
          maximumRadius = Math.max(maximumRadius, candidate.maxSupportRadius);
        } else if (reason !== "unused-slot") {
          exceptions.push({
            cell: finest.key,
            inputLevel: level,
            retainedLevel: previous.sourceLevel,
            reason,
          });
        }
        leafLevelRepresentations[leaf * 7 + level] = id;
        selected.push({
          slot: level,
          sourceLevel: previous.sourceLevel,
          count: previous.count,
        });
      }
      const eighth = levels[7]?.get(finest.key);
      if (
        eighth &&
        eighth.count <= previous.count &&
        previous.count <= 2 * eighth.count + 1
      ) {
        eighthSources.set(node, {
          cell: eighth,
          metrics: await measureImportedError(
            reference,
            eighth,
            sourceSpool,
            origin,
            options,
            metrics,
          ),
        });
      } else if (inputs.length === 8) {
        exceptions.push({
          cell: finest.key,
          inputLevel: 7,
          retainedLevel: previous.sourceLevel,
          reason: !eighth
            ? "empty-coarse-cell"
            : "internal-refinement-count-bound",
        });
      }
      nodeSources[node] = [previous];
      nodeRadius[node] = maximumRadius;
      nodeProxies[node] = proxy(id);
      const selectionBounds = representationBounds(
        leafLevelRepresentations[leaf * 7],
        "positionBounds",
      );
      unionBounds(sourceBounds, selectionBounds);
      leafBounds[leaf] = { selectionBounds, strictBounds: mergeBounds(strict) };
      nodeBounds[node] = leafBounds[leaf].strictBounds;
      leafReport.push({
        cell: finest.key,
        partCount,
        levels: selected,
        eighthImported: eighthSources.has(node),
      });
      onProgress?.({
        stage: "leaf",
        completed: leaf + 1,
        total: hierarchy.leafCount,
      });
    }

    for (let node = hierarchy.nodeCount - 1; node >= 0; node--) {
      if (!hierarchy.nodeChildMask[node]) {
        continue;
      }
      const childNodes = children(hierarchy, node),
        cells = [],
        firstSegment = segments.length;
      const id = representations.length;
      let rangeStart = 0;
      for (const child of childNodes) {
        const eighth = eighthSources.get(child);
        const selected = eighth ? [eighth.cell] : nodeSources[child];
        const radius = Math.max(
          nodeRadius[child],
          eighth?.cell.maxSupportRadius ?? 0,
        );
        // All centers belong to this child's logical spatial cell. Its diagonal
        // plus the two maximum 3-sigma support radii bounds transport to ANY
        // authored proxy in that domain. This deliberately coarser estimator
        // tightens as the active cut descends; identical passthrough payloads
        // must not receive copied leaf-bin estimates that stall that descent.
        const cellSpan =
          2 ** (hierarchy.root.depth - hierarchy.nodeDepth[child]);
        const domainBound =
          cellSpan * Math.hypot(...options.cellSizeMeters) + 2 * radius;
        const metrics = maximumErrors([
          nodeProxies[child],
          {
            geometricError: domainBound,
            coverageWeightedP95Error: domainBound,
            coverageWeightedP99Error: domainBound,
          },
        ]);
        nodeRadius[node] = Math.max(nodeRadius[node], radius);
        const rangeCount = sumCount(selected);
        segments.push({
          representationId: id,
          childNodeIndex: child,
          rangeStart,
          rangeCount,
          representedSourceCount: nodeProxies[child].representedSourceCount,
          coverageMass: nodeProxies[child].coverageMass,
          ...metrics,
        });
        cells.push(...selected);
        rangeStart += rangeCount;
      }
      const ownSegments = segments.slice(firstSegment);
      await addRepresentation({
        ownerNodeIndex: node,
        logicalLevel: INVALID,
        cells,
        firstSegment,
        segmentCount: ownSegments.length,
        metrics: maximumErrors(ownSegments),
        representedSourceCount: ownSegments.reduce(
          (sum, s) => sum + s.representedSourceCount,
          0,
        ),
        coverageMass: deterministicSum(ownSegments.map((s) => s.coverageMass)),
      });
      nodeSources[node] = cells;
      nodeProxies[node] = proxy(id);
      nodeBounds[node] = mergeBounds([
        ...childNodes.map((child) => nodeBounds[child]),
        representationBounds(id, "contentBounds"),
      ]);
      onProgress?.({ stage: "parent", node, total: hierarchy.nodeCount });
    }

    onProgress?.({ stage: "packs", assets: assets.length });
    const packing = await writePayloadPacks(
      assets,
      inputs[0].schema.maxShDegree,
      staging,
      options,
      pageSpool,
    );
    const coreLists = assets.map(() => []),
      shLists = assets.map(() => []);
    const pages = packing.pages.map((page) => {
      const assetId = Number(page.payloadId);
      (page.kind === 1 ? coreLists : shLists)[assetId].push(page.pageIndex);
      return { ...page, assetId, assetStart: page.payloadStart };
    });
    const assetPageIndices = [];
    for (const asset of assets) {
      asset.corePageListFirst = assetPageIndices.length;
      asset.corePageListCount = coreLists[asset.assetId].length;
      assetPageIndices.push(...coreLists[asset.assetId]);
      asset.shPageListFirst = assetPageIndices.length;
      asset.shPageListCount = shLists[asset.assetId].length;
      assetPageIndices.push(...shLists[asset.assetId]);
    }
    const sourceSha256 = createHash("sha256")
      .update(
        JSON.stringify({
          levels: inputs.map((item) => item.sha256),
          fixedGridOrigin: options.fixedGridOrigin,
          cellSizeMeters: options.cellSizeMeters,
          coordinateSystem: options.coordinateSystem,
          localOrigin: options.localOrigin,
          localToFixed: options.localToFixed,
          metersPerUnit: options.metersPerUnit,
        }),
      )
      .digest();
    const sourceCoverageMass = deterministicSum(
      leafReport.map(
        (_, leaf) =>
          representations[leafLevelRepresentations[leaf * 7]].coverageMass,
      ),
    );
    const header = {
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
      fixedGridOrigin: options.fixedGridOrigin,
      cellSizeMeters: options.cellSizeMeters,
      sourceSha256,
      policySha256: prebuiltLodPolicySha256(options.cellSizeMeters),
      coordinateSystem: options.coordinateSystem,
      maxShDegree: inputs[0].schema.maxShDegree,
      maximumAssetSplats: MAX_ASSET,
      maximumPackBytes: options.maxPackBytes,
      sourceVertexCount: inputs[0].schema.vertexCount,
      retainedSplatCount: inputs[0].schema.vertexCount,
      sourceCoverageMass,
      metersPerUnit: options.metersPerUnit,
      localOrigin: options.localOrigin,
      localToFixed: options.localToFixed,
      sourceBounds,
    };
    // Authored coarse centers need not be contained by the finest input bounds.
    for (const asset of assets) {
      unionBounds(sourceBounds, asset.positionBounds);
    }
    const bytes = encodeSegmentedHierarchyProductInventory({
      header,
      sections: createSegmentedHierarchyProductSections({
        hierarchy,
        rootOrigin: origin,
        nodeBounds,
        nodeProxies,
        leafBounds,
        leafLevelRepresentations,
        representations,
        segments,
        assets,
        assetPageIndices: Uint32Array.from(assetPageIndices),
        pages,
        packs: packing.packs,
      }),
    });
    await writeFile(path.join(staging, "scene.mci"), bytes);
    const decoded = decodeSegmentedHierarchyIndex(bytes);
    await writeCanonicalProductManifest(staging, bytes, decoded.checksum);
    await sourceSpool.cleanup();
    await pageSpool.cleanup();
    onProgress?.({ stage: "validate" });
    const readback = await validatePrebuiltLodProduct(staging);
    await assertSourcesUnchanged(inputs);
    const report = {
      producer: PREBUILT_LOD_POLICY,
      inputManifest: path.resolve(manifestFile),
      inputs: inputs.map((item, level) => ({
        level,
        path: item.input,
        count: item.schema.vertexCount,
        sha256: item.sha256,
        comments: item.header.comments,
      })),
      grid: {
        origin: options.fixedGridOrigin,
        cellSizeMeters: options.cellSizeMeters,
      },
      coordinates: {
        coordinateSystem: options.coordinateSystem,
        localOrigin: options.localOrigin,
        localToFixed: options.localToFixed,
        sourceComments: coordinateComments,
        note: "PLY CRS comments are provenance only; no projection conversion or datum inference.",
      },
      mapping:
        "First seven inputs occupy leaf slots; missing slots alias. Input eight supplies eligible direct-leaf segments. Higher parents concatenate child proxies.",
      errorMetric:
        "Leaf errors: conservative encoded-finest 3-sigma support-distance bounds, coverage weighted in 32^3 bins. Parent segment errors: logical child-cell diagonal plus two maximum support radii, an upper bound for all reference mass; parent quantiles use maximum segment bounds. No image comparison.",
      coverageMetric:
        "Encoded finest-domain opacity times ellipsoid area; physical asset coverage apportioned by range length. No per-splat training ancestry is inferred.",
      leafCount: hierarchy.leafCount,
      nodeCount: hierarchy.nodeCount,
      representationCount: representations.length,
      assetCount: assets.length,
      rootSplatCount:
        representations[nodeProxies[0].representationId].splatCount,
      internalProxySplats: representations
        .filter((r) => r.segmentCount)
        .reduce((n, r) => n + r.splatCount, 0),
      totalStoredSplats: assets.reduce((n, a) => n + a.splatCount, 0),
      packBytes: packing.packs.reduce((n, p) => n + p.fileBytes, 0),
      leaves: leafReport,
      exceptions,
      mciSha256: readback.mciSha256,
      elapsedSeconds: (Date.now() - started) / 1000,
    };
    await writeFile(
      path.join(staging, "scene.report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    await assertAbsent(target);
    await rename(staging, target);
    published = true;
    return { directory: target, report };
  } finally {
    await sourceSpool?.cleanup();
    await pageSpool?.cleanup();
    if (!published) {
      // Only this invocation's mkdtemp-owned sibling can be removed.
      if (
        path.dirname(staging) !== parent ||
        !path
          .basename(staging)
          .startsWith("." + path.basename(target) + "-import-")
      ) {
        throw new Error("Unsafe import staging cleanup path");
      }
      await rm(staging, { recursive: true, force: true });
    }
  }
}
