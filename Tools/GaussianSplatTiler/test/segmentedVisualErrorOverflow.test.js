import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGaussianSet } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianColumns.js";
import { covarianceFromScaleRotation } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianMath.js";
import { decodeCorePage } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianEncodingExt.js";
import { PACK_KIND } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import {
  CHUNK_REDUCTION_TASK_KIND,
  dispatchChunkReductionTask,
  reduceChunkV2,
} from "../src/chunkReduction.js";
import {
  DYADIC_VISUAL_ERROR_METHOD,
  visualErrorHistogramUpperBound,
} from "../src/hierarchy/visualErrorHistogram.js";
import {
  buildSegmentedGaussianScene,
  validateSegmentedGaussianScene,
} from "../src/segmentedBuilder.js";
import { decodeSegmentedHierarchyRuntimeIndex } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";

const CELL_BOUNDS = [0, 0, 0, 10, 10, 20];

function wideCovariancePair() {
  const data = createGaussianSet(2, 9);
  for (let index = 0; index < data.count; index++) {
    data.position.set([5, 5, 10], index * 3);
    data.scale.set(index === 0 ? [50, 0.1, 0.1] : [0.1, 50, 0.1], index * 3);
    data.rotation.set([0, 0, 0, 1], index * 4);
    data.covariance.set(
      covarianceFromScaleRotation(
        data.scale,
        index * 3,
        data.rotation,
        index * 4,
      ),
      index * 6,
    );
    data.opacity[index] = 0.5;
    data.color.set([0.25, 0.5, 0.75], index * 3);
    for (let coefficient = 0; coefficient < data.shCount; coefficient++) {
      data.sh[index * data.shCount + coefficient] =
        (index + 1) * (coefficient - 4) * 0.01;
    }
    data.stableId[index] = index;
    data.sourceCount[index] = 1;
  }
  return data;
}

test("finite source covariance may exceed the cell domain without changing proxy Core, SH, or counts", async () => {
  const sourceChunk = { chunkId: "wide-covariance", cellBounds: CELL_BOUNDS };
  // This reference takes the established reducer and ordinary encoding path,
  // which has no segmented visual-error histogram or owner-domain adjustment.
  const reference = await reduceChunkV2({
    sourceChunk,
    data: wideCovariancePair(),
  });
  const result = await dispatchChunkReductionTask({
    kind: CHUNK_REDUCTION_TASK_KIND.SEGMENTED_LEAF_V1,
    sourceChunk,
    data: wideCovariancePair(),
  });
  assert.deepEqual(
    result.levels.map((level) => level.actualCount),
    [2, 1, 1, 1, 1, 1, 1],
  );
  assert.deepEqual(result.levels, reference.levels);
  assert.equal(result.chunkPayloads.length, reference.chunkPayloads.length);
  const baseDomain = visualErrorHistogramUpperBound(CELL_BOUNDS);
  assert.equal(result.chunkPayloads[0].visualErrorHistogram.maximum, 0);
  const coarseHistogram = result.chunkPayloads[1].visualErrorHistogram;
  assert.equal(coarseHistogram.method, DYADIC_VISUAL_ERROR_METHOD);
  assert.ok(coarseHistogram.maximum > baseDomain);
  assert.ok(Number.isFinite(coarseHistogram.maximum));
  assert.equal(coarseHistogram.upperBound, 2 * baseDomain);
  assert.ok(coarseHistogram.p95 >= coarseHistogram.maximum);
  assert.ok(coarseHistogram.p99 <= coarseHistogram.upperBound);

  for (let index = 0; index < reference.chunkPayloads.length; index++) {
    const expected = reference.chunkPayloads[index];
    const actual = result.chunkPayloads[index];
    assert.equal(actual.splatCount, expected.splatCount);
    assert.equal(
      actual.representedSourceCount,
      expected.representedSourceCount,
    );
    assert.deepEqual(actual.error, expected.error);
    assert.deepEqual(actual.coverage, expected.coverage);
    assert.equal(actual.encodedPages.length, expected.encodedPages.length);
    for (const expectedPage of expected.encodedPages) {
      const actualPage = actual.encodedPages.find(
        (page) =>
          page.kind === expectedPage.kind && page.start === expectedPage.start,
      );
      assert.ok(actualPage);
      assert.equal(actualPage.count, expectedPage.count);
      if (expectedPage.kind === PACK_KIND.CORE) {
        const restored = decodeCorePage(actualPage.bytes).map((record) => ({
          ...record,
          position: record.position.map(
            (value, component) => value + result.origin[component],
          ),
        }));
        assert.deepEqual(restored, decodeCorePage(expectedPage.bytes));
      } else {
        assert.equal(expectedPage.kind, PACK_KIND.SH);
        assert.deepEqual(actualPage.bytes, expectedPage.bytes);
      }
    }
  }
});

async function writeMultipartFixture(input) {
  // The first leaf has 400002 source rows, hence two real physical parts.
  // NaN scale filters all but two rows per part before proxy reduction. A
  // second leaf supplies a parent range with an even larger inherited error.
  const count = 400004;
  const fields = [
    "x",
    "y",
    "z",
    "scale_0",
    "scale_1",
    "scale_2",
    "rot_0",
    "rot_1",
    "rot_2",
    "rot_3",
    "opacity",
    "f_dc_0",
    "f_dc_1",
    "f_dc_2",
    ...Array.from({ length: 9 }, (_, index) => `f_rest_${index}`),
  ];
  const stride = fields.length * 4;
  const body = Buffer.alloc(count * stride);
  for (let index = 0; index < count; index++) {
    const offset = index * stride;
    body.writeFloatLE(index >= 400002 ? 11 : 1, offset);
    body.writeFloatLE(1, offset + 4);
    body.writeFloatLE(1, offset + 8);
    body.writeFloatLE(Number.NaN, offset + 12);
    body.writeFloatLE(1, offset + 24);
    if (index < 2 || index >= 400000) {
      const wide = index < 2 ? 50 : index < 400002 ? 125 : 200;
      const scale = index % 2 === 0 ? [wide, 0.1, 0.1] : [0.1, wide, 0.1];
      for (let component = 0; component < 3; component++) {
        body.writeFloatLE(
          Math.log(scale[component]),
          offset + 12 + component * 4,
        );
      }
      for (let coefficient = 0; coefficient < 9; coefficient++) {
        body.writeFloatLE(
          (coefficient - 4) * 0.01,
          offset + 56 + coefficient * 4,
        );
      }
    }
  }
  const header = Buffer.from(
    `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${fields.map((field) => `property float ${field}\n`).join("")}end_header\n`,
  );
  await writeFile(input, Buffer.concat([header, body]));
}

function assertPublishedErrorBounds(index) {
  const leaf = new Float64Array(5);
  const representation = new Float64Array(12);
  for (let ordinal = 0; ordinal < index.leafCount; ordinal++) {
    index.readLeafTopology(ordinal, leaf);
    assert.equal(leaf[4], leaf[0] === 0 ? 2 : 1);
    let previous = [0, 0, 0];
    for (let level = 0; level < 7; level++) {
      const id = index.leafRepresentationId(ordinal, level);
      index.readRepresentation(id, representation);
      assert.equal(
        representation[6],
        (leaf[0] === 0 ? 4 : 2) / (level ? 2 : 1),
      );
      const current = [
        index.readRepresentationConservativeError(id),
        index.readRepresentationVisualError(id, "COVERAGE_P95"),
        index.readRepresentationVisualError(id, "COVERAGE_P99"),
      ];
      assert.ok(current.every(Number.isFinite));
      assert.ok(0 <= current[1] && current[1] <= current[2]);
      assert.ok(current[2] <= current[0]);
      for (let component = 0; component < current.length; component++) {
        assert.ok(current[component] >= previous[component]);
      }
      if (level === 0) {
        assert.deepEqual(current, [0, 0, 0]);
      } else {
        assert.ok(current[0] > visualErrorHistogramUpperBound(CELL_BOUNDS));
      }
      previous = current;
    }
  }
  const root = index.readNodeProxy(0, new Float64Array(4));
  const rootBounds = index.readNodeCellBounds(0, new Float64Array(6));
  assert.ok(root[2] > visualErrorHistogramUpperBound(rootBounds));
  const segment = new Float64Array(7);
  const child = new Float64Array(4);
  for (let id = 0; id < index.segmentCount; id++) {
    index.readSegment(id, segment);
    index.readNodeProxy(segment[1], child);
    const p95 = index.readSegmentVisualError(id, "COVERAGE_P95");
    const p99 = index.readSegmentVisualError(id, "COVERAGE_P99");
    assert.ok(0 <= p95 && p95 <= p99 && p99 <= segment[5]);
    assert.ok(segment[5] >= child[2]);
    assert.ok(root[2] >= segment[5]);
  }
}

test("public builds merge different overflowing physical parts and parent ranges identically across workers", async () => {
  const parent = await mkdtemp(
    path.join(tmpdir(), "segmented-error-overflow-"),
  );
  try {
    const input = path.join(parent, "parts.ply");
    await writeMultipartFixture(input);
    const options = { fixedGridOrigin: [0, 0, 0], temporaryDirectory: parent };
    const serial = path.join(parent, "serial");
    const parallel = path.join(parent, "parallel");
    for (const [output, workers] of [
      [serial, 1],
      [parallel, 2],
    ]) {
      const built = await buildSegmentedGaussianScene(input, output, {
        ...options,
        workers,
      });
      assert.equal(built.report.source.retainedSplatCount, 6);
      assert.equal(built.report.source.vertexCount, 400004);
      assert.equal(built.report.physicalLeafPartCount, 3);
      assert.equal(built.report.visualErrorMethod, DYADIC_VISUAL_ERROR_METHOD);
      const index = decodeSegmentedHierarchyRuntimeIndex(
        await readFile(path.join(output, "scene.mci")),
      );
      assert.equal(index.maxShDegree, 1);
      assert.equal(index.leafCount, 2);
      assert.equal(index.nodeCount, 3);
      assert.equal(index.segmentCount, 2);
      assertPublishedErrorBounds(index);
      await validateSegmentedGaussianScene(output);
    }
    const packs = (await readdir(path.join(serial, "packs"))).sort();
    assert.deepEqual(
      (await readdir(path.join(parallel, "packs"))).sort(),
      packs,
    );
    for (const file of [
      "scene.mci",
      "scene.mcl.json",
      ...packs.map((name) => `packs/${name}`),
    ]) {
      assert.deepEqual(
        await readFile(path.join(parallel, file)),
        await readFile(path.join(serial, file)),
        file,
      );
    }
    assert.deepEqual((await readdir(parent)).sort(), [
      "parallel",
      "parts.ply",
      "serial",
    ]);
  } finally {
    assert.equal(path.dirname(path.resolve(parent)), path.resolve(tmpdir()));
    assert.ok(path.basename(parent).startsWith("segmented-error-overflow-"));
    await rm(parent, { recursive: true, force: true });
  }
});
