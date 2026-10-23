import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  SEGMENTED_GAUSSIAN_ROUTE,
  buildSegmentedGaussianScene,
  inspectSegmentedGaussianScene,
  validateSegmentedGaussianScene,
} from "../src/segmentedBuilder.js";
import { decodeSegmentedHierarchyRuntimeIndex } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(directory, "fixtures/t1a-tree-product-v1.ply");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("segmented facade publishes only the regular XYZ route authority", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "d4-segmented-builder-"));
  const output = path.join(parent, "scene");
  try {
    const built = await buildSegmentedGaussianScene(fixture, output, {
      fixedGridOrigin: [0, 0, 0],
      maximumChunkSplats: 400000,
      maxPackBytes: 1024 * 1024,
      batchSize: 8,
      workers: 1,
    });
    assert.equal(built.route, SEGMENTED_GAUSSIAN_ROUTE);
    assert.equal(built.report.stage, "T3B-SCALE-1F-G2");
    assert.deepEqual(built.report.cellSizeMeters, [10, 10, 20]);
    assert.equal(built.report.coverageHoleCount, 0);
    assert.equal(built.report.coverageOverlapCount, 0);
    assert.ok(Object.isFrozen(built));
    const mciBytes = await readFile(path.join(output, "scene.mci"));
    const mciSha256 = sha256(mciBytes);
    const inspected = await inspectSegmentedGaussianScene(output);
    assert.equal(inspected.route, SEGMENTED_GAUSSIAN_ROUTE);
    assert.equal(inspected.hierarchyDimension, 3);
    assert.deepEqual(inspected.cellSizeMeters, [10, 10, 20]);
    const index = decodeSegmentedHierarchyRuntimeIndex(mciBytes);
    const leaf = new Float64Array(5);
    const cell = new Float64Array(6);
    const identities = new Set();
    for (let leafOrdinal = 0; leafOrdinal < index.leafCount; leafOrdinal++) {
      index.readLeafTopology(leafOrdinal, leaf);
      identities.add(`${leaf[0]},${leaf[1]},${leaf[2]}`);
      index.readNodeCellBounds(leaf[3], cell);
      assert.deepEqual(
        [...cell],
        [
          leaf[0] * 10,
          leaf[1] * 10,
          leaf[2] * 20,
          leaf[0] * 10 + 10,
          leaf[1] * 10 + 10,
          leaf[2] * 20 + 20,
        ],
      );
      assert.ok(leaf[4] > 0);
    }
    assert.equal(identities.size, index.leafCount);
    assert.equal(inspected.coordinateSystem, "local");
    assert.ok(Object.isFrozen(inspected.localOrigin));
    assert.ok(Object.isFrozen(inspected.localToFixed));
    assert.ok(Object.isFrozen(inspected.sourceBounds));
    const validated = await validateSegmentedGaussianScene(output);
    assert.equal(validated.route, SEGMENTED_GAUSSIAN_ROUTE);
    assert.equal(validated.mciSha256, mciSha256);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("real proxy error regression publishes monotonic LOD metadata and valid packs", async () => {
  // Extracted, in original record order, from formal meta_0 cell [3,-6,-1].
  // The former v3 fit made L5's bound smaller than L4's P99. Keep the
  // publication invariants without freezing one reducer's measured values.
  const parent = await mkdtemp(path.join(tmpdir(), "proxy-error-envelope-"));
  const output = path.join(parent, "scene");
  try {
    const built = await buildSegmentedGaussianScene(
      path.join(directory, "fixtures/proxy-independent-fit-cell-967.ply"),
      output,
      { fixedGridOrigin: [0, 0, 0], workers: 1, temporaryDirectory: parent },
    );
    assert.equal(built.report.source.retainedSplatCount, 967);
    const index = decodeSegmentedHierarchyRuntimeIndex(
      await readFile(path.join(output, "scene.mci")),
    );
    assert.equal(index.leafCount, 1);
    assert.equal(index.representationCount, 7);
    const maximum = [],
      p99 = [];
    for (let level = 0; level < 7; level++) {
      maximum.push(index.readRepresentationConservativeError(level));
      p99.push(index.readRepresentationVisualError(level, "COVERAGE_P99"));
      assert.ok(p99[level] <= maximum[level]);
      if (level > 0) {
        assert.ok(maximum[level] >= maximum[level - 1]);
        assert.ok(p99[level] >= p99[level - 1]);
      }
    }
    assert.equal(
      built.report.proxyComputeBackend,
      "proxy-v2-morton-tangent-javascript-cpu",
    );
    assert.ok(maximum[6] > maximum[0]);
    await validateSegmentedGaussianScene(output);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
