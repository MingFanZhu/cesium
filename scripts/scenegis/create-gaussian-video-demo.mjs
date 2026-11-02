import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Buffer } from "node:buffer";
import process from "node:process";
import { buildSegmentedGaussianScene } from "../../Tools/GaussianSplatTiler/src/segmentedBuilder.js";

// Deterministic fixture only. Products remain ignored under Build.
const rows = [];
function surface(minU, maxU, minV, maxV, position, scale, color) {
  for (let u = minU; u <= maxU; u += 0.22) {
    for (let v = minV; v <= maxV; v += 0.22) {
      rows.push([
        ...position(u, v),
        ...color.map((c) => (c - 0.5) / 0.28209479177387814),
        3,
        ...scale.map(Math.log),
        1,
        0,
        0,
        0,
      ]);
    }
  }
}
surface(
  -8,
  8,
  0,
  10,
  (x, z) => [x, 0, z],
  [0.18, 0.025, 0.18],
  [0.58, 0.6, 0.62],
);
surface(
  -4,
  -1,
  2,
  8,
  (x, z) => [x, -4, z],
  [0.18, 0.025, 0.18],
  [0.58, 0.6, 0.62],
);
surface(
  0,
  5,
  0,
  10,
  (y, z) => [8, y, z],
  [0.025, 0.18, 0.18],
  [0.5, 0.52, 0.54],
);
surface(
  -8,
  8,
  -6,
  5,
  (x, y) => [x, y, 0],
  [0.18, 0.18, 0.025],
  [0.34, 0.36, 0.38],
);
const fields = [
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
    ...fields.map((name) => `property float ${name}`),
    "end_header",
    "",
  ].join("\n"),
);
const bytes = Buffer.alloc(rows.length * fields.length * 4);
rows.forEach((row, index) =>
  row.forEach((value, column) =>
    bytes.writeFloatLE(value, (index * fields.length + column) * 4),
  ),
);
await mkdir("Build", { recursive: true });
const input = path.resolve("Build/gaussian-video-walls.ply");
await writeFile(input, Buffer.concat([header, bytes]));
await buildSegmentedGaussianScene(
  input,
  path.resolve("Build/SceneGISGaussianVideoDemo"),
  { fixedGridOrigin: [0, 0, 0], cellSizeMeters: [4, 4, 4], workers: 1 },
);
process.stdout.write(
  `Created ${rows.length} Gaussian samples: Build/SceneGISGaussianVideoDemo\n`,
);
