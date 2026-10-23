import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  decodeSegmentedHierarchyRuntimeIndex,
  parseMacroChunkRuntimeManifest,
  validateSegmentedHierarchyRuntimeIndex,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedProtocol.js";
import {
  buildSegmentedHierarchyProductArtifact,
  validateSegmentedHierarchyProductArtifact,
} from "./hierarchy/segmentedHierarchyBuilder.js";
import { validateCanonicalProductManifest } from "./hierarchy/segmentedHierarchyProductArtifact.js";

export const SEGMENTED_GAUSSIAN_ROUTE = "segmented-active-cut-v3";

function publicBuildResult(result) {
  return Object.freeze({
    route: SEGMENTED_GAUSSIAN_ROUTE,
    directory: result.directory,
    report: result.report,
    readback: result.readback,
  });
}

export async function buildSegmentedGaussianScene(
  inputPly,
  outputDirectory,
  options = {},
) {
  return publicBuildResult(
    await buildSegmentedHierarchyProductArtifact(
      inputPly,
      outputDirectory,
      options,
    ),
  );
}

export async function inspectSegmentedGaussianScene(outputDirectory) {
  const directory = path.resolve(outputDirectory);
  const manifestBytes = await readFile(path.join(directory, "scene.mcl.json"));
  const manifest = parseMacroChunkRuntimeManifest(manifestBytes);
  const mciBytes = await readFile(path.join(directory, "scene.mci"));
  await validateCanonicalProductManifest(directory, mciBytes);
  const index = validateSegmentedHierarchyRuntimeIndex(
    decodeSegmentedHierarchyRuntimeIndex(mciBytes, manifest.index),
  );
  return Object.freeze({
    route: SEGMENTED_GAUSSIAN_ROUTE,
    directory,
    artifactIdentity: index.artifactIdentityHex,
    mciVersion: index.mciVersion,
    rowSchema: index.rowSchema,
    selectionErrorMetric: index.selectionErrorMetric,
    mciChecksum: index.mciChecksum,
    mciBytes: index.byteLength,
    hierarchyDimension: index.hierarchyDimension,
    cellSizeMeters: index.cellSizeMeters,
    nodeCount: index.nodeCount,
    leafCount: index.leafCount,
    representationCount: index.representationCount,
    segmentCount: index.segmentCount,
    assetCount: index.assetCount,
    pageCount: index.pageCount,
    packCount: index.packCount,
    maxShDegree: index.maxShDegree,
    coordinateSystem: index.coordinateSystem,
    metersPerUnit: index.metersPerUnit,
    localOrigin: index.localOrigin,
    localToFixed: index.localToFixed,
    sourceBounds: index.sourceBounds,
  });
}

export async function validateSegmentedGaussianScene(
  outputDirectory,
  options = {},
) {
  const validated = await validateSegmentedHierarchyProductArtifact(
    path.resolve(outputDirectory),
    options,
  );
  return Object.freeze({
    route: SEGMENTED_GAUSSIAN_ROUTE,
    ...validated,
  });
}
