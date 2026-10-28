import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  partitionPlyToDisk,
  streamDiskPartition,
} from "../src/segmentedDiskPartition.js";
import { partitionPlyIntoSegmentedXyzCells } from "../src/segmentedPartition.js";
import { streamFixedRangeRawGaussianBlocks } from "../src/fixedRangeRawGaussianSpool.js";
import { readPlyHeader } from "../src/io/ply/PlyStreamReader.js";

const fixture = new URL("./fixtures/t1a-tree-product-v1.ply", import.meta.url);

async function context(t) {
  const root = await mkdtemp(path.join(tmpdir(), "segmented-disk-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    options: {
      fixedGridOrigin: [0, 0, 0],
      temporaryDirectory: root,
      workers: 1,
    },
  };
}

test("multi-round disk sorting preserves legacy raw order, ties and attributes", async (t) => {
  const { root, options } = await context(t);
  const header = await readPlyHeader(fixture);
  const original = await readFile(fixture);
  const stride = 56;
  const body = original.subarray(
    header.dataOffset,
    header.dataOffset + 16 * stride,
  );
  const input = path.join(root, "ties.ply");
  await writeFile(
    input,
    Buffer.concat([
      Buffer.from(
        header.headerText.replace("element vertex 16", "element vertex 32"),
      ),
      body,
      body,
    ]),
  );
  const legacy = await partitionPlyIntoSegmentedXyzCells(input, options);
  const expected = [];
  for await (const raw of streamFixedRangeRawGaussianBlocks(
    input,
    legacy,
    options,
  )) {
    expected.push(raw);
  }
  const disk = await partitionPlyToDisk(input, options, {
    runSplats: 3,
    fanIn: 2,
  });
  assert.equal(disk.plan.mergeRounds, 4);
  assert.deepEqual(disk.bounds, legacy.bounds);
  assert.deepEqual(disk.chunks, legacy.chunks);
  const actual = [];
  for await (const raw of streamDiskPartition(disk)) {
    actual.push(raw);
  }
  assert.deepEqual(actual, expected);
  assert.deepEqual(await readdir(root), ["ties.ply"]);
});

test("disk partition owns cleanup after sort failure and early iterator exit", async (t) => {
  const { root, options } = await context(t);
  for (const stage of ["partition-runs", "partition-merge"]) {
    await assert.rejects(
      partitionPlyToDisk(
        fixture,
        {
          ...options,
          onProgress(event) {
            if (event.stage === stage) {
              throw new Error(`injected ${stage}`);
            }
          },
        },
        { runSplats: 3, fanIn: 2 },
      ),
      new RegExp(`injected ${stage}`),
    );
    assert.deepEqual(await readdir(root), []);
  }
  const early = await partitionPlyToDisk(fixture, options);
  for await (const raw of streamDiskPartition(early)) {
    assert.ok(raw.count > 0);
    break;
  }
  assert.deepEqual(await readdir(root), []);
  const rejected = await partitionPlyToDisk(fixture, options);
  await assert.rejects(async () => {
    for await (const raw of streamDiskPartition(rejected, {
      onSpoolCreated() {
        throw new Error("consumer failed");
      },
    })) {
      assert.fail(String(raw.count));
    }
  }, /consumer failed/);
  assert.deepEqual(await readdir(root), []);
});

test("disk runs preserve SH3 rows and big-endian source decoding", async (t) => {
  const { root, options } = await context(t);
  const header = await readPlyHeader(fixture);
  const original = await readFile(fixture);
  const stride = 56 + 45 * 4;
  const body = Buffer.alloc(16 * stride);
  for (let i = 0; i < 16; i++) {
    original.copy(
      body,
      i * stride,
      header.dataOffset + i * 56,
      header.dataOffset + (i + 1) * 56,
    );
    for (let j = 0; j < 45; j++) {
      body.writeFloatLE((i * 45 + j) / 100, i * stride + 56 + j * 4);
    }
  }
  body.swap32();
  const input = path.join(root, "sh3-big.ply");
  await writeFile(
    input,
    Buffer.concat([
      Buffer.from(
        header.headerText
          .replace("binary_little_endian", "binary_big_endian")
          .replace(
            "end_header",
            `${Array.from(
              { length: 45 },
              (_, i) => `property float f_rest_${i}\n`,
            ).join("")}end_header`,
          ),
      ),
      body,
    ]),
  );
  const legacy = await partitionPlyIntoSegmentedXyzCells(input, options);
  const expected = [];
  for await (const raw of streamFixedRangeRawGaussianBlocks(
    input,
    legacy,
    options,
  )) {
    expected.push(raw);
  }
  const disk = await partitionPlyToDisk(input, options, {
    runSplats: 3,
    fanIn: 2,
  });
  const actual = [];
  for await (const raw of streamDiskPartition(disk)) {
    actual.push(raw);
  }
  assert.deepEqual(actual, expected);
});

test("sparse occupied cells do not allocate the enclosing dense grid", async (t) => {
  const { root, options } = await context(t);
  const header = await readPlyHeader(fixture);
  const original = await readFile(fixture);
  const body = Buffer.from(
    original.subarray(header.dataOffset, header.dataOffset + 2 * 56),
  );
  for (let axis = 0; axis < 3; axis++) {
    body.writeFloatLE(-10000, axis * 4);
    body.writeFloatLE(10000, 56 + axis * 4);
  }
  const input = path.join(root, "sparse.ply");
  await writeFile(
    input,
    Buffer.concat([
      Buffer.from(
        header.headerText.replace("element vertex 16", "element vertex 2"),
      ),
      body,
    ]),
  );
  const disk = await partitionPlyToDisk(input, options);
  assert.equal(disk.chunks.length, 2);
  const ids = [];
  for await (const raw of streamDiskPartition(disk)) {
    ids.push(...raw.stableId);
  }
  assert.deepEqual(ids, [0, 1]);
});
