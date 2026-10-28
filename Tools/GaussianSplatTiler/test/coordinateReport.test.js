import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { collectPlyCoordinateComments } from "../src/io/ply/coordinateComments.js";
import { readPlyHeader } from "../src/io/ply/PlyStreamReader.js";
import {
  buildSegmentedGaussianScene,
  inspectSegmentedGaussianScene,
} from "../src/segmentedBuilder.js";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../src/segmentedCli.js", import.meta.url));
const fixture = fileURLToPath(
  new URL("./fixtures/t1a-tree-product-v1.ply", import.meta.url),
);

test("PLY coordinate comments keep optional fields and finite double precision", () => {
  assert.deepEqual(collectPlyCoordinateComments([{}]), {});
  assert.deepEqual(
    collectPlyCoordinateComments([
      { comments: ["EPSG\t4549", "offsetx 391690.1400747459847480"] },
      { comments: ["epsg 4549", "OFFSETZ -1.32914010000000005e1"] },
    ]),
    { epsg: 4549, offsetx: 391690.140074746, offsetz: -13.291401 },
  );
  assert.deepEqual(
    collectPlyCoordinateComments([
      { comments: ["epsg=4549", "shiftx 1", "scalex 2", "source L2"] },
    ]),
    {},
  );
});

test("PLY coordinate comments reject invalid numbers and conflicting declarations", () => {
  for (const comments of [
    ["epsg NaN"],
    ["offsetx Infinity"],
    ["offsety -Infinity"],
    ["offsetz 13 metres"],
    ["epsg 4549", "EPSG 4548"],
    ["offsetx 391690.140074746", "offsetx 391690.140074747"],
  ]) {
    assert.throws(
      () => collectPlyCoordinateComments([{ comments }]),
      /Conflicting or invalid PLY coordinate metadata/,
    );
  }
});

async function sourceWithComments(root, comments) {
  const bytes = await readFile(fixture);
  const input = path.join(root, "input.ply");
  await writeFile(
    input,
    Buffer.concat([
      bytes.subarray(0, 4),
      Buffer.from(comments.map((comment) => `comment ${comment}\n`).join("")),
      bytes.subarray(4),
    ]),
  );
  return input;
}

test("ordinary CLI persists source coordinates and original decimals without moving geometry", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "gsp-coordinate-report-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const comments = [
    "EPSG 4549",
    "offsetx 391690.1400747459847480",
    "offsety 3467367.6624134462326765",
    "offsetz 13.2914010000000005",
    "shiftx 0.0000000000000000",
    "scalex 1.0000000000000000",
    "source L2",
  ];
  const input = await sourceWithComments(root, comments);
  const output = path.join(root, "scene");
  const options = {
    fixedGridOrigin: [0, 0, 0],
    workers: 1,
    localOrigin: [1, 2, 3],
    localToFixed: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1],
  };
  const { stdout } = await execute(
    process.execPath,
    [
      cli,
      "build",
      input,
      "--output",
      output,
      "--fixed-grid-origin",
      options.fixedGridOrigin.join(","),
      "--workers",
      "1",
      "--local-origin",
      options.localOrigin.join(","),
      "--local-to-fixed",
      options.localToFixed.join(","),
    ],
    { timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  const report = JSON.parse(
    await readFile(path.join(output, "scene.report.json"), "utf8"),
  );
  assert.deepEqual(report, JSON.parse(stdout));
  assert.deepEqual(report.coordinate.sourceComments, {
    epsg: 4549,
    offsetx: 391690.140074746,
    offsety: 3467367.662413446,
    offsetz: 13.291401,
  });
  assert.deepEqual(report.source.comments, [
    ...comments,
    ...(await readPlyHeader(fixture)).comments,
  ]);
  assert.deepEqual(report.coordinate.localOrigin, options.localOrigin);
  assert.deepEqual(report.coordinate.localToFixed, options.localToFixed);
  const baseline = path.join(root, "baseline");
  const plain = await buildSegmentedGaussianScene(fixture, baseline, options);
  assert.deepEqual(plain.report.coordinate.sourceComments, {});
  const actualIndex = await inspectSegmentedGaussianScene(output);
  const baselineIndex = await inspectSegmentedGaussianScene(baseline);
  for (const field of ["sourceBounds", "localOrigin", "localToFixed"]) {
    assert.deepEqual(actualIndex[field], baselineIndex[field]);
  }
  const packs = await readdir(path.join(baseline, "packs"));
  assert.deepEqual(await readdir(path.join(output, "packs")), packs);
  for (const pack of packs) {
    assert.deepEqual(
      await readFile(path.join(output, "packs", pack)),
      await readFile(path.join(baseline, "packs", pack)),
    );
  }
});

test("ordinary build rejects ambiguous coordinates before disk sorting", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "gsp-coordinate-error-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = await sourceWithComments(root, ["epsg 4549", "EPSG 4548"]);
  const progress = [];
  await assert.rejects(
    buildSegmentedGaussianScene(input, path.join(root, "scene"), {
      fixedGridOrigin: [0, 0, 0],
      onProgress: (event) => progress.push(event),
    }),
    /Conflicting or invalid PLY coordinate metadata: epsg/,
  );
  assert.deepEqual(progress, []);
  assert.deepEqual(await readdir(root), ["input.ply"]);
});
