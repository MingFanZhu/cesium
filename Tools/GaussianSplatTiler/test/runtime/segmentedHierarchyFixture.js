import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSegmentedHierarchyProductArtifact } from "../../src/hierarchy/segmentedHierarchyBuilder.js";
import { writeDeterministicGaussianPly } from "../fixtureGenerator.js";

const packageDirectory = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);
const sourceFixture = path.join(
  packageDirectory,
  "fixtures/t1a-tree-product-v1.ply",
);

export async function createRealA4RuntimeFixture() {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "scale-1b-a4-runtime-"),
  );
  const output = path.join(temporaryDirectory, "scene");
  const result = await buildSegmentedHierarchyProductArtifact(
    sourceFixture,
    output,
    {
      fixedGridOrigin: [0, 0, 0],
      maximumChunkSplats: 400000,
      maxPackBytes: 1024 * 1024,
      batchSize: 8,
      workers: 1,
    },
  );
  return Object.freeze({
    bytes: await readFile(path.join(output, "scene.mci")),
    report: result.report,
    async cleanup() {
      await rm(temporaryDirectory, { recursive: true, force: true });
    },
  });
}

export async function createFourWideLeafA4RuntimeFixture() {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "scale-1b-four-wide-runtime-"),
  );
  const input = path.join(temporaryDirectory, "four-wide-160k.ply");
  const output = path.join(temporaryDirectory, "scene");
  await writeDeterministicGaussianPly(input, 160_000, { wideGrid: true });
  const result = await buildSegmentedHierarchyProductArtifact(input, output, {
    fixedGridOrigin: [0, 0],
    maximumChunkSplats: 40_000,
    maxPackBytes: 64 * 1024 * 1024,
    batchSize: 4096,
    workers: 1,
  });
  return Object.freeze({
    bytes: await readFile(path.join(output, "scene.mci")),
    report: result.report,
    async cleanup() {
      await rm(temporaryDirectory, { recursive: true, force: true });
    },
  });
}

export async function createShA4RuntimeFixture() {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "scale-1c-sh-runtime-"),
  );
  const input = path.join(temporaryDirectory, "sh1.ply");
  const output = path.join(temporaryDirectory, "scene");
  await writeDeterministicGaussianPly(input, 64, { maxShDegree: 1 });
  const result = await buildSegmentedHierarchyProductArtifact(input, output, {
    fixedGridOrigin: [0, 0],
    maximumChunkSplats: 64,
    maxPackBytes: 1024 * 1024,
    batchSize: 32,
    workers: 1,
  });
  return Object.freeze({
    bytes: await readFile(path.join(output, "scene.mci")),
    report: result.report,
    async cleanup() {
      await rm(temporaryDirectory, { recursive: true, force: true });
    },
  });
}

export async function createMultiPartLeafA4RuntimeFixture() {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "scale-1c-multipart-runtime-"),
  );
  const input = path.join(temporaryDirectory, "multipart-16.ply");
  const output = path.join(temporaryDirectory, "scene");
  await writeDeterministicGaussianPly(input, 16);
  const result = await buildSegmentedHierarchyProductArtifact(input, output, {
    fixedGridOrigin: [0, 0],
    maximumChunkSplats: 4,
    maxPackBytes: 1024 * 1024,
    batchSize: 8,
    workers: 1,
  });
  return Object.freeze({
    bytes: await readFile(path.join(output, "scene.mci")),
    report: result.report,
    async cleanup() {
      await rm(temporaryDirectory, { recursive: true, force: true });
    },
  });
}

export async function createFourWideShA4RuntimeFixture() {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "scale-1c-four-wide-sh-runtime-"),
  );
  const input = path.join(temporaryDirectory, "four-wide-sh1-160k.ply");
  const output = path.join(temporaryDirectory, "scene");
  await writeDeterministicGaussianPly(input, 160_000, {
    maxShDegree: 1,
    wideGrid: true,
  });
  const result = await buildSegmentedHierarchyProductArtifact(input, output, {
    fixedGridOrigin: [0, 0],
    maximumChunkSplats: 40_000,
    maxPackBytes: 64 * 1024 * 1024,
    batchSize: 4096,
    workers: 1,
  });
  return Object.freeze({
    bytes: await readFile(path.join(output, "scene.mci")),
    report: result.report,
    async cleanup() {
      await rm(temporaryDirectory, { recursive: true, force: true });
    },
  });
}
