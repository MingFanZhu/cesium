import { mkdir, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
const directory = new URL("../../Test/ModelFlatten/data/", import.meta.url);
await mkdir(directory, { recursive: true });
function mesh(minX, maxX, nx, ny) {
  const positions = [],
    normals = [],
    colors = [],
    indices = [];
  const n = Math.hypot(0.1, 1, 0.05);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = minX + ((maxX - minX) * i) / nx;
      const y = -100 + (200 * j) / ny;
      positions.push(x - 32, 30 + 0.1 * x + 0.05 * y, -y - 20);
      normals.push(-0.1 / n, 1 / n, 0.05 / n);
      colors.push(0.3 + (x + 100) / 400, 0.4 + (y + 100) / 500, 0.25);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + nx + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const arrays = [
    new Float32Array(positions),
    new Float32Array(normals),
    new Float32Array(colors),
    new Uint16Array(indices),
  ];
  const bytes = Buffer.concat(arrays.map((a) => Buffer.from(a.buffer)));
  let offset = 0;
  const bufferViews = arrays.map((a) => {
    const v = { buffer: 0, byteOffset: offset, byteLength: a.byteLength };
    offset += a.byteLength;
    return v;
  });
  return {
    asset: {
      version: "2.0",
      generator: "SceneGIS deterministic flatten fixture",
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [7, 0, 5] }],
    buffers: [
      {
        byteLength: bytes.length,
        uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`,
      },
    ],
    bufferViews,
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [minX - 32, 15, -120],
        max: [maxX - 32, 45, 80],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: normals.length / 3,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5126,
        count: colors.length / 3,
        type: "VEC3",
      },
      {
        bufferView: 3,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.9 },
        doubleSided: true,
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
  };
}
const box = (x, radius) => ({
  box: [x - 25, 15, 30, radius, 0, 0, 0, 100, 0, 0, 0, 20],
});
const tileset = {
  asset: { version: "1.1" },
  geometricError: 400,
  root: {
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 25, -15, 0, 1],
    boundingVolume: box(0, 100),
    geometricError: 200,
    refine: "REPLACE",
    content: { uri: "coarse.gltf", boundingVolume: box(0, 100) },
    children: [
      {
        boundingVolume: box(-50, 50),
        geometricError: 0,
        content: { uri: "west.gltf", boundingVolume: box(-50, 50) },
      },
      {
        boundingVolume: box(50, 50),
        geometricError: 0,
        content: { uri: "east.gltf", boundingVolume: box(50, 50) },
      },
    ],
  },
};
for (const [name, content] of [
  ["tileset.json", tileset],
  ["coarse.gltf", mesh(-100, 100, 8, 8)],
  ["west.gltf", mesh(-100, 0, 20, 40)],
  ["east.gltf", mesh(0, 100, 20, 40)],
]) {
  await writeFile(new URL(name, directory), JSON.stringify(content));
}
