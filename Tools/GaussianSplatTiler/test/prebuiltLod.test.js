import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { appendFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildPrebuiltLodProduct,
  validatePrebuiltLodProduct,
} from "../src/prebuiltLodBuilder.js";
import { PREBUILT_LOD_SCHEMA } from "../src/prebuiltLodPolicy.js";
import { decodeSegmentedHierarchyRuntimeIndex } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";
import { decodeSegmentedHierarchyIndex } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyIndex.js";
import {
  decodeCorePage,
  decodeShPage,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianEncodingExt.js";
import { validateSegmentedProductStructure } from "../src/hierarchy/segmentedProductValidator.js";
import { g2ProductPolicySha256 } from "../src/hierarchy/segmentedHierarchyProductArtifact.js";
import {
  createSegmentedActiveCut,
  planSegmentedConvergedActiveCut,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedActiveCut.js";

async function fixture(
  t,
  counts,
  { shCount = 0, positions = [1, 21], extra = {} } = {},
) {
  const directory = await mkdtemp(path.join(tmpdir(), "prebuilt-lod-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const levels = [];
  for (let level = 0; level < counts.length; level++) {
    const props = [
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
      ...Array.from({ length: shCount }, (_, i) => "f_rest_" + i),
    ];
    const count = counts[level].reduce((sum, value) => sum + value, 0);
    const header = Buffer.from(
      [
        "ply",
        "format binary_little_endian 1.0",
        "element vertex " + count,
        ...props.map((p) => "property float " + p),
        "end_header",
        "",
      ].join("\n"),
    );
    const body = Buffer.alloc(count * props.length * 4);
    let row = 0;
    for (let cell = 0; cell < counts[level].length; cell++) {
      for (let i = 0; i < counts[level][cell]; i++, row++) {
        const values = [
          positions[cell] + (i / Math.max(1, counts[level][cell])) * 0.2,
          1,
          1,
          -4 - level * 0.1,
          -4,
          -4,
          1,
          0,
          0,
          0,
          2,
          0.1 + level / 10,
          0.2,
          0.3,
          ...Array.from({ length: shCount }, (_, j) => (j + 1) / 100),
        ];
        values.forEach((value, p) =>
          body.writeFloatLE(value, (row * props.length + p) * 4),
        );
      }
    }
    const file = "level-" + level + ".ply";
    await writeFile(path.join(directory, file), Buffer.concat([header, body]));
    levels.push(file);
  }
  const manifest = path.join(directory, "levels.json"),
    output = path.join(directory, "product");
  await writeFile(
    manifest,
    JSON.stringify({
      schema: PREBUILT_LOD_SCHEMA,
      levels,
      batchSize: 7,
      ...extra,
    }),
  );
  return { directory, manifest, output };
}

test("imports authored LODs into the unmodified runtime; missing cells alias real finer data", async (t) => {
  const f = await fixture(t, [
    [8, 8],
    [4, 4],
    [2, 0],
  ]);
  const { report } = await buildPrebuiltLodProduct(f.manifest, f.output);
  assert.equal(report.leafCount, 2);
  assert.equal(report.rootSplatCount, 6);
  assert.equal(report.exceptions.length, 1);
  assert.equal(report.exceptions[0].reason, "empty-coarse-cell");
  assert.deepEqual(
    report.leaves[0].levels.map((v) => v.count),
    [8, 4, 2, 2, 2, 2, 2],
  );
  assert.deepEqual(
    report.leaves[1].levels.map((v) => v.count),
    [8, 4, 4, 4, 4, 4, 4],
  );
  const bytes = await readFile(path.join(f.output, "scene.mci"));
  const runtime = decodeSegmentedHierarchyRuntimeIndex(bytes);
  assert.equal(runtime.leafCount, 2);
  assert.equal(
    (await validatePrebuiltLodProduct(f.output)).mciSha256,
    report.mciSha256,
  );
  // The original CPU policy cannot accept this producer.
  await assert.rejects(
    validateSegmentedProductStructure(f.output, {
      expectedPolicySha256: g2ProductPolicySha256([10, 10, 20]),
    }),
    /policy/i,
  );
  // Read actual stored coarse bytes, including its authored color/scale.
  const decoded = decodeSegmentedHierarchyIndex(bytes);
  const reps = decoded.sectionByKind[7].data,
    pages = decoded.sectionByKind[11].data;
  const coarseId = decoded.sectionByKind[6].data[2];
  const assetId = reps[coarseId * 24 + 4];
  let page;
  for (let i = 0; i < pages.length; i += 15) {
    if (pages[i] === assetId && pages[i + 3] === 1) {
      page = pages.subarray(i, i + 15);
      break;
    }
  }
  const pack = await readFile(
    path.join(
      f.output,
      "packs",
      "scene.core." + String(page[6]).padStart(3, "0") + ".gsp",
    ),
  );
  const rows = decodeCorePage(pack.subarray(page[7], page[7] + page[9]));
  assert.equal(rows.length, 2);
  assert.ok(
    Math.abs(rows[0].color[0] - (0.5 + 0.3 * 0.28209479177387814)) < 0.001,
  );
  assert.ok(Math.abs(rows[0].scale[0] - Math.exp(-4.2)) < 0.0001);
});

test("eight levels use L7 in parent segments, retaining all seven leaf slots", async (t) => {
  const counts = Array.from({ length: 8 }, (_, level) => [
    128 >> level,
    128 >> level,
  ]);
  const f = await fixture(t, counts);
  const { report } = await buildPrebuiltLodProduct(f.manifest, f.output);
  assert.equal(report.rootSplatCount, 2);
  assert.equal(report.exceptions.length, 0);
  assert.ok(report.leaves.every((leaf) => leaf.eighthImported));
  assert.deepEqual(
    report.leaves[0].levels.map((l) => l.sourceLevel),
    [0, 1, 2, 3, 4, 5, 6],
  );
});

test("unmodified active-cut planner refines one tile while another retains its authored coarse level", async (t) => {
  const f = await fixture(
    t,
    [
      [16, 16, 16],
      [8, 8, 8],
      [4, 4, 4],
    ],
    { positions: [1, 21, 81] },
  );
  await buildPrebuiltLodProduct(f.manifest, f.output);
  const index = decodeSegmentedHierarchyRuntimeIndex(
    await readFile(path.join(f.output, "scene.mci")),
  );
  const policy = {
    maximumSelectedSplats: 48,
    maximumCoverageSlots: 10,
    minimumLeafLogicalLevel: 0,
    refineErrorPixels: 0.01,
    coarsenErrorPixels: 0.005,
  };
  const view = Object.freeze({
    viewIdentity: "near-first-tile",
    cameraPositionScene: [1, 1, 3],
    frustumPlanesScene: [
      [1, 0, 0, 5],
      [-1, 0, 0, 5],
      [0, 1, 0, 5],
      [0, -1, 0, 5],
      [0, 0, 1, 5],
      [0, 0, -1, 5],
    ],
    sceneToClipMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -1, -1, -3, 1],
    drawingBufferWidth: 1000,
    drawingBufferHeight: 1000,
    projectionKind: "orthographic",
  });
  const cut = planSegmentedConvergedActiveCut(
    index,
    createSegmentedActiveCut(index, policy),
    view,
    policy,
  ).finalCut;
  assert.equal(cut.metrics.coverageHoleCount, 0);
  assert.equal(cut.metrics.coverageOverlapCount, 0);
  const nearLeaf = index.readLeafTopology(0, new Float64Array(5))[3];
  const slot = [...cut.coverageNodeIndices].indexOf(nearLeaf);
  assert.ok(slot >= 0, "passthrough parents must not block descent");
  assert.equal(
    cut.providerRepresentationIds[slot],
    index.leafRepresentationId(0, 0),
  );
  assert.equal(cut.providerRangeCounts[slot], 16);
  assert.ok(cut.selectedSplatCount < 48, "hidden tiles must remain coarse");
});

test("SH pages preserve coefficient order and the public runtime accepts SH1", async (t) => {
  const f = await fixture(
    t,
    [
      [8, 8],
      [4, 4],
    ],
    { shCount: 9 },
  );
  await buildPrebuiltLodProduct(f.manifest, f.output);
  const index = decodeSegmentedHierarchyIndex(
    await readFile(path.join(f.output, "scene.mci")),
  );
  assert.equal(index.header.maxShDegree, 1);
  const words = index.sectionByKind[11].data;
  for (let i = 0; i < words.length; i += 15) {
    if (words[i + 3] !== 2) {
      continue;
    }
    const pack = await readFile(
      path.join(
        f.output,
        "packs",
        "scene.sh." + String(words[i + 6]).padStart(3, "0") + ".gsp",
      ),
    );
    const sh = decodeShPage(
      pack.subarray(words[i + 7], words[i + 7] + words[i + 9]),
      1,
    );
    [0.01, 0.04, 0.07, 0.02, 0.05, 0.08, 0.03, 0.06, 0.09].forEach((v, c) =>
      assert.ok(Math.abs(sh[c] - v) < 0.002),
    );
    break;
  }
});

test("new coarse cells fail atomically and an existing output is never overwritten", async (t) => {
  const f = await fixture(t, [
    [8, 0],
    [2, 2],
  ]);
  await assert.rejects(
    buildPrebuiltLodProduct(f.manifest, f.output),
    /absent from finest/,
  );
  assert.deepEqual((await readdir(f.directory)).sort(), [
    "level-0.ply",
    "level-1.ply",
    "levels.json",
  ]);
  await writeFile(f.output, "keep");
  await assert.rejects(
    buildPrebuiltLodProduct(f.manifest, f.output),
    /already exists/,
  );
  assert.equal(await readFile(f.output, "utf8"), "keep");
});

test("coarse count increases alias; incompatible eighth-level counts pass through", async (t) => {
  const f = await fixture(t, [
    [128, 128],
    [64, 64],
    [32, 32],
    [16, 16],
    [8, 8],
    [4, 4],
    [2, 3],
    [1, 1],
  ]);
  const { report } = await buildPrebuiltLodProduct(f.manifest, f.output);
  assert.equal(report.rootSplatCount, 2);
  const second = await fixture(t, [
    [5, 7],
    [6, 3],
  ]);
  const built = await buildPrebuiltLodProduct(second.manifest, second.output);
  assert.equal(built.report.exceptions[0].reason, "coarse-count-increases");
  const third = await fixture(t, [
    [128, 128],
    [64, 64],
    [32, 32],
    [16, 16],
    [8, 8],
    [4, 4],
    [4, 4],
    [1, 1],
  ]);
  const retained = await buildPrebuiltLodProduct(third.manifest, third.output);
  assert.equal(retained.report.rootSplatCount, 8);
  assert.equal(retained.report.exceptions.length, 2);
});

test("rejects unsorted inputs, duplicate sources and unknown manifest options", async (t) => {
  const f = await fixture(t, [
    [2, 2],
    [4, 4],
  ]);
  await assert.rejects(
    buildPrebuiltLodProduct(f.manifest, f.output),
    /non-increasing/,
  );
  await writeFile(
    f.manifest,
    JSON.stringify({
      schema: PREBUILT_LOD_SCHEMA,
      levels: ["level-0.ply", "level-0.ply"],
    }),
  );
  await assert.rejects(
    buildPrebuiltLodProduct(f.manifest, f.output),
    /Duplicate/,
  );
  await writeFile(
    f.manifest,
    JSON.stringify({
      schema: PREBUILT_LOD_SCHEMA,
      levels: ["level-0.ply", "level-1.ply"],
      tileSize: 10,
    }),
  );
  await assert.rejects(
    buildPrebuiltLodProduct(f.manifest, f.output),
    /Unknown/,
  );
});

test("source changes and invalid Gaussian filtering abort without publishing", async (t) => {
  const f = await fixture(t, [
    [8, 8],
    [4, 4],
  ]);
  let changed = false;
  await assert.rejects(
    buildPrebuiltLodProduct(f.manifest, f.output, {
      onProgress(event) {
        if (!changed && event.stage === "partition") {
          changed = true;
          appendFileSync(
            path.join(f.directory, "level-0.ply"),
            Buffer.from([0]),
          );
        }
      },
    }),
    /Source changed/,
  );
  assert.ok(
    !(await readdir(f.directory)).some((name) =>
      name.startsWith(".product-import-"),
    ),
  );
  const invalid = await fixture(t, [
    [8, 8],
    [4, 4],
  ]);
  const file = path.join(invalid.directory, "level-1.ply");
  const bytes = await readFile(file);
  const offset = bytes.indexOf("end_header\n") + "end_header\n".length;
  bytes.writeFloatLE(NaN, offset);
  await writeFile(file, bytes);
  await assert.rejects(
    buildPrebuiltLodProduct(invalid.manifest, invalid.output),
    /does not silently filter/,
  );
});

test("coarse positions may extend finest bounds and pack tampering is rejected", async (t) => {
  const f = await fixture(t, [
    [8, 8],
    [4, 4],
  ]);
  const file = path.join(f.directory, "level-1.ply");
  const bytes = await readFile(file);
  const offset = bytes.indexOf("end_header\n") + "end_header\n".length;
  bytes.writeFloatLE(9, offset);
  await writeFile(file, bytes);
  await buildPrebuiltLodProduct(f.manifest, f.output);
  const pack = path.join(f.output, "packs", "scene.core.000.gsp");
  const encoded = await readFile(pack);
  encoded[256] ^= 1;
  await writeFile(pack, encoded);
  await assert.rejects(validatePrebuiltLodProduct(f.output), /checksum|CRC/i);
});

test("one leaf cannot silently discard an eighth input level", async (t) => {
  const f = await fixture(
    t,
    Array.from({ length: 8 }, (_, level) => [128 >> level]),
    { positions: [1] },
  );
  await assert.rejects(
    buildPrebuiltLodProduct(f.manifest, f.output),
    /seven leaf slots/,
  );
});

test("coordinate comments remain provenance and conflicting metadata is rejected", async (t) => {
  const f = await fixture(t, [
    [8, 8],
    [4, 4],
  ]);
  async function addComment(level, value) {
    const file = path.join(f.directory, "level-" + level + ".ply");
    const bytes = await readFile(file);
    await writeFile(
      file,
      Buffer.concat([
        bytes.subarray(0, 4),
        Buffer.from("comment epsg " + value + "\ncomment offsetx 385019.5\n"),
        bytes.subarray(4),
      ]),
    );
  }
  await addComment(0, 4549);
  const { report } = await buildPrebuiltLodProduct(f.manifest, f.output);
  assert.equal(report.coordinates.sourceComments.epsg, 4549);
  assert.equal(report.coordinates.sourceComments.offsetx, 385019.5);
  assert.equal(report.coordinates.localToFixed[12], 0);
  await addComment(1, 4548);
  await assert.rejects(
    buildPrebuiltLodProduct(f.manifest, path.join(f.directory, "second")),
    /Conflicting/,
  );
});

test("double projected coordinates are rebased before float32 encoding on a custom grid", async (t) => {
  const f = await fixture(t, [[2], [1]], {
    positions: [385019],
    extra: { fixedGridOrigin: [0, 0, -10], cellSizeMeters: [10, 10, 40] },
  });
  for (let level = 0; level < 2; level++) {
    const file = path.join(f.directory, "level-" + level + ".ply");
    const old = await readFile(file);
    const offset = old.indexOf("end_header\n") + "end_header\n".length;
    const header = Buffer.from(
      old
        .subarray(0, offset)
        .toString()
        .replace("property float x", "property double x"),
    );
    const count = 2 - level,
      body = Buffer.alloc(count * 60);
    for (let row = 0; row < count; row++) {
      body.writeDoubleLE(385019.5249 + row * 0.0002, row * 60);
      old.copy(
        body,
        row * 60 + 8,
        offset + row * 56 + 4,
        offset + (row + 1) * 56,
      );
    }
    await writeFile(file, Buffer.concat([header, body]));
  }
  await buildPrebuiltLodProduct(f.manifest, f.output);
  const { header } = await validatePrebuiltLodProduct(f.output);
  assert.deepEqual([...header.cellSizeMeters], [10, 10, 40]);
  assert.ok(Math.abs(header.sourceBounds[0] - 385019.5249) < 0.000001);
  assert.ok(header.sourceBounds[3] - header.sourceBounds[0] > 0.00019);
});
