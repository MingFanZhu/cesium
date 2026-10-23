#!/usr/bin/env node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSegmentedGaussianScene } from "../src/segmentedBuilder.js";

// Deterministic synthetic capture: two colored Gaussian toruses, no external data.
// Generated products belong in Build and are not source-controlled.
const output = path.resolve(
  process.argv[2] ??
    fileURLToPath(
      new URL("../../../Build/SceneGISGaussianDemo", import.meta.url),
    ),
);
const rows = [];
for (let ring = 0; ring < 2; ring++) {
  for (let u = 0; u < 160; u++) {
    const angle = (u / 160) * 2 * Math.PI;
    for (let v = 0; v < 24; v++) {
      const phi = (v / 24) * 2 * Math.PI;
      const radial = 3 + 0.7 * Math.cos(phi);
      const x = radial * Math.cos(angle);
      const y = radial * Math.sin(angle);
      const z = 0.7 * Math.sin(phi);
      const position = ring === 0 ? [x - 1.5, y, z + 4] : [x + 1.5, z, y + 4];
      const rgb = [0, 2, 4].map(
        (phase) => 0.5 + 0.4 * Math.cos(angle + phase + ring),
      );
      rows.push([
        ...position,
        ...rgb.map((c) => (c - 0.5) / 0.28209479177387814),
        2.2,
        Math.log(0.105),
        Math.log(0.105),
        Math.log(0.105),
        1,
        0,
        0,
        0,
      ]);
    }
  }
}
const properties = [
  "x",
  "y",
  "z",
  "f_dc_0",
  "f_dc_1",
  "f_dc_2",
  "opacity",
  "scale_0",
  "scale_1",
  "scale_2",
  "rot_0",
  "rot_1",
  "rot_2",
  "rot_3",
];
const header = Buffer.from(
  [
    "ply",
    "format binary_little_endian 1.0",
    `element vertex ${rows.length}`,
    ...properties.map((name) => `property float ${name}`),
    "end_header",
    "",
  ].join("\n"),
);
const data = Buffer.alloc(rows.length * properties.length * 4);
rows.forEach((row, index) =>
  row.forEach((value, column) => {
    data.writeFloatLE(value, (index * properties.length + column) * 4);
  }),
);
const temporary = await mkdtemp(path.join(tmpdir(), "scenegis-gaussian-demo-"));
try {
  const input = path.join(temporary, "rings.ply");
  await writeFile(input, Buffer.concat([header, data]));
  await mkdir(path.dirname(output), { recursive: true });
  await buildSegmentedGaussianScene(input, output, {
    fixedGridOrigin: [0, 0, 0],
    cellSizeMeters: [2, 2, 2],
    workers: 1,
  });
  console.log(`Created ${rows.length} source splats: ${output}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
