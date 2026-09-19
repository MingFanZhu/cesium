/* global process, Buffer, fetch, URL, console */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

// Conversion is offline after downloading the source archive. No runtime network dependency.
const requireTools = createRequire(resolve(process.argv[2], "package.json"));
const obj2gltf = requireTools("obj2gltf");
if (requireTools("obj2gltf/package.json").version !== "3.2.0") {
  throw new Error("Use obj2gltf 3.2.0 for this fixed reference asset.");
}
const source = "https://cesium.com/public/learn/AGI_HQ.zip";
const archive = process.argv[3]
  ? await readFile(process.argv[3])
  : await (async () => {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Source download failed: ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    })();
const sourceSha256 = createHash("sha256").update(archive).digest("hex");
if (
  sourceSha256 !==
  "254ac95ccef0db6288979a3f43c0861ee1f9abc62ae87f3ddf821572bfbc7e87"
) {
  throw new Error(
    "The public source changed; review it before replacing the reference asset.",
  );
}
const directory = await mkdtemp(join(tmpdir(), "scenegis-agi-reference-"));
const zip = new AdmZip(archive);
for (const name of ["AGI_HQ.obj", "AGI_HQ.mtl", "Model_0.jpg", "Model_1.jpg"]) {
  await writeFile(join(directory, name), zip.readFile(`AGI_HQ/${name}`));
}
const obj = await readFile(join(directory, "AGI_HQ.obj"), "utf8");
const minimum = [Infinity, Infinity, Infinity];
const maximum = [-Infinity, -Infinity, -Infinity];
const vertices = [];
const faces = [];
let triangles = 0;
for (const line of obj.split(/\r?\n/)) {
  if (line.startsWith("v ")) {
    const v = line.trim().split(/\s+/).slice(1).map(Number);
    vertices.push(v);
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], v[axis]);
      maximum[axis] = Math.max(maximum[axis], v[axis]);
    }
  } else if (line.startsWith("f ")) {
    const face = line.trim().split(/\s+/).slice(1);
    if (face.length !== 3) {
      throw new Error("The pinned source must contain only triangular faces.");
    }
    faces.push(face.map((index) => Number(index.split("/")[0]) - 1));
    triangles++;
  }
}
// The scan has no normals and includes coincident opposite-facing triangles.
// Smooth only incident faces in the current face's hemisphere, preserving both
// sides instead of canceling their normals. Original positions and UVs stay intact.
const incidentNormals = vertices.map(() => []);
const faceNormals = [];
for (const face of faces) {
  const [a, b, c] = face.map((index) => vertices[index]);
  const ab = b.map((v, i) => v - a[i]);
  const ac = c.map((v, i) => v - a[i]);
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  faceNormals.push(normal);
  face.forEach((index) => incidentNormals[index].push(normal));
}
const normalLines = [];
const normalIndex = new Map();
const cornerNormals = faces.map((face, i) =>
  face.map((vertex) => {
    const current = faceNormals[i];
    const sum = [0, 0, 0];
    for (const adjacent of incidentNormals[vertex]) {
      if (
        adjacent.reduce((dot, value, axis) => dot + value * current[axis], 0) >
        0
      ) {
        adjacent.forEach((value, axis) => (sum[axis] += value));
      }
    }
    const length = Math.hypot(...sum);
    if (length === 0) {
      throw new Error("The pinned source contains a degenerate face.");
    }
    const key = sum.map((value) => value / length).join(" ");
    if (!normalIndex.has(key)) {
      normalLines.push(`vn ${key}`);
      normalIndex.set(key, normalLines.length);
    }
    return normalIndex.get(key);
  }),
);
let faceIndex = 0;
const withNormals = obj.split(/\r?\n/).map((line) => {
  if (!line.startsWith("f ")) {
    return line;
  }
  const normals = cornerNormals[faceIndex++];
  return `f ${line
    .trim()
    .split(/\s+/)
    .slice(1)
    .map((index, corner) => `${index}/${normals[corner]}`)
    .join(" ")}`;
});
const firstFace = withNormals.findIndex((line) => line.startsWith("f "));
withNormals.splice(firstFace, 0, normalLines.join("\n"));
await writeFile(join(directory, "AGI_HQ.obj"), withNormals.join("\n"));
const center = minimum.map((v, i) => (v + maximum[i]) / 2);
const halfSize = minimum.map((v, i) => (maximum[i] - v) / 2);
const glb = await obj2gltf(join(directory, "AGI_HQ.obj"), {
  binary: true,
  inputUpAxis: "Z",
  outputUpAxis: "Y",
  secure: true,
});
const output = fileURLToPath(
  new URL("../../Test/Rendering/data/", import.meta.url),
);
await mkdir(output, { recursive: true });
await writeFile(join(output, "agi-hq.glb"), glb);
const tileset = {
  asset: {
    version: "1.1",
    copyright: "AGI / Cesium public photogrammetry sample",
  },
  // The tileset error describes omitting the whole campus; the leaf is full detail.
  geometricError: 2 * Math.hypot(...halfSize),
  root: {
    boundingVolume: {
      box: [...center, halfSize[0], 0, 0, 0, halfSize[1], 0, 0, 0, halfSize[2]],
    },
    transform: [
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      -center[0],
      -center[1],
      -minimum[2],
      1,
    ],
    geometricError: 0,
    content: { uri: "agi-hq.glb" },
  },
};
const manifest = {
  id: "agi-hq-reference-v1",
  source,
  sourcePage: "https://cesium.com/learn/3d-tiling/ion-tile-photogrammetry/",
  sourceSha256,
  converter: "obj2gltf@3.2.0",
  normals:
    "Hemisphere-separated, area-weighted corner normals from original triangles",
  triangles,
  originalBounds: { minimum, maximum },
  localBounds: {
    minimum: [-halfSize[0], -halfSize[1], 0],
    maximum: [halfSize[0], halfSize[1], halfSize[2] * 2],
  },
  glbBytes: glb.length,
  glbSha256: createHash("sha256").update(glb).digest("hex"),
};
await writeFile(
  join(output, "tileset.json"),
  `${JSON.stringify(tileset, null, 2)}\n`,
);
await writeFile(
  join(output, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(JSON.stringify(manifest, null, 2));
