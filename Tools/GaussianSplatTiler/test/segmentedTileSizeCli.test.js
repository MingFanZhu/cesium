import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { streamPlyVertexBatches } from "../src/io/ply/PlyStreamReader.js";
import { decodeSegmentedHierarchyRuntimeIndex } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../src/segmentedCli.js", import.meta.url));
const fixture = fileURLToPath(
  new URL("./fixtures/t1a-tree-product-v1.ply", import.meta.url),
);

async function runCli(args) {
  const { stdout } = await execute(process.execPath, [cli, ...args], {
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function expectedCells(origin, sizes) {
  const cells = new Map();
  for await (const batch of streamPlyVertexBatches(fixture, {
    properties: ["x", "y", "z"],
  })) {
    for (let row = 0; row < batch.count; row++) {
      const key = ["x", "y", "z"]
        .map((axis, index) =>
          Math.floor((batch.columns[axis][row] - origin[index]) / sizes[index]),
        )
        .join(",");
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }
  }
  return cells;
}

async function verifyProduct({ sizes, origin = [0, 0, 0], tileSize }) {
  const root = await mkdtemp(path.join(tmpdir(), "segmented-tile-cli-"));
  const output = path.join(root, "scene");
  try {
    const args = [
      "build",
      fixture,
      "--output",
      output,
      "--fixed-grid-origin",
      origin.join(","),
      "--workers",
      "1",
      "--batch-size",
      "8",
      "--max-pack-bytes",
      "1MiB",
    ];
    if (tileSize !== undefined) {
      args.push("--tile-size", tileSize);
    }
    const built = await runCli(args);
    assert.deepEqual(built.cellSizeMeters, sizes);
    assert.equal(built.source.retainedSplatCount, 16);
    assert.equal(built.coverageHoleCount, 0);
    assert.equal(built.coverageOverlapCount, 0);

    const inspected = await runCli(["inspect", output]);
    assert.deepEqual(inspected.cellSizeMeters, sizes);
    assert.equal(inspected.hierarchyDimension, 3);
    const mciBytes = await readFile(path.join(output, "scene.mci"));
    const index = decodeSegmentedHierarchyRuntimeIndex(mciBytes);
    assert.deepEqual(index.cellSizeMeters, sizes);
    const expected = await expectedCells(origin, sizes);
    assert.equal(index.leafCount, expected.size);
    const leaf = new Float64Array(5);
    const cell = new Float64Array(6);
    const representation = new Float64Array(12);
    const actual = new Map();
    for (let ordinal = 0; ordinal < index.leafCount; ordinal++) {
      index.readLeafTopology(ordinal, leaf);
      const key = [...leaf.slice(0, 3)].join(",");
      assert.ok(!actual.has(key), `duplicate cell ${key}`);
      index.readRepresentation(
        index.leafRepresentationId(ordinal, 0),
        representation,
      );
      actual.set(key, representation[6]);
      index.readNodeCellBounds(leaf[3], cell);
      const minimum = sizes.map(
        (size, axis) => origin[axis] + leaf[axis] * size,
      );
      assert.deepEqual(
        [...cell],
        [...minimum, ...minimum.map((value, axis) => value + sizes[axis])],
      );
    }
    assert.deepEqual(actual, expected);

    const validated = await runCli(["validate", output]);
    assert.equal(
      validated.mciSha256,
      createHash("sha256").update(mciBytes).digest("hex"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("segmented CLI builds, inspects and validates 5x5x10 metre cells", async () => {
  await verifyProduct({ sizes: [5, 5, 10], tileSize: "5,5,10" });
});

test("segmented CLI retains the default 10x10x20 metre grid", async () => {
  await verifyProduct({ sizes: [10, 10, 20] });
});

test("segmented CLI supports fractional anisotropic cells and a nonzero origin", async () => {
  await verifyProduct({
    sizes: [2.5, 7.5, 12.5],
    origin: [3, 3, 3],
    tileSize: "2.5, 7.5,12.5",
  });
});

test("segmented CLI rejects invalid tile sizes before reading or creating products", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "segmented-tile-invalid-"));
  try {
    for (const value of [
      "0,5,10",
      "-1,5,10",
      "NaN,5,10",
      "Infinity,5,10",
      "5,10",
      "5,5,10,10",
      "5,,10",
      "5, ,10",
      "",
    ]) {
      const output = path.join(root, "output");
      await assert.rejects(
        execute(
          process.execPath,
          [
            cli,
            "build",
            path.join(root, "missing.ply"),
            "--output",
            output,
            "--fixed-grid-origin",
            "0,0,0",
            "--tile-size",
            value,
          ],
          { timeout: 15000 },
        ),
        (error) => {
          assert.equal(error.code, 1);
          assert.match(error.stderr, /tile-size/i);
          assert.doesNotMatch(error.stderr, /Unknown option|ENOENT/);
          return true;
        },
      );
      await assert.rejects(access(output), { code: "ENOENT" });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
