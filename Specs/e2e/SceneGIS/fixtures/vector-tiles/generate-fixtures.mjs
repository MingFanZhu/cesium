import { mkdir, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import console from "node:console";
import protobuf from "protobufjs/minimal.js";

// Deterministic synthetic city in normalized, top-left-origin root coordinates.
// This authoring tool writes MVT 2.1 fixtures; it is not a runtime encoder.
const layers = { land: [], water: [], buildings: [], roads: [], places: [] };
let nextId = 1;
function ring(x, y, w, h) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}
function add(layer, type, parts, name, kind) {
  layers[layer].push({ id: nextId++, type, parts, name, kind });
}
for (let row = 0; row < 8; row++) {
  for (let column = 0; column < 8; column++) {
    const x = 0.17 + column * 0.083;
    const y = 0.17 + row * 0.083;
    const park = (row * 3 + column) % 9 === 0;
    add(
      "land",
      3,
      [ring(x, y, 0.07, 0.07)],
      `街区 ${row}-${column}`,
      park ? "park" : "block",
    );
    if (!park) {
      for (let building = 0; building < 4; building++) {
        add(
          "buildings",
          3,
          [
            ring(
              x + 0.008 + (building % 2) * 0.03,
              y + 0.008 + Math.floor(building / 2) * 0.03,
              0.022,
              0.021,
            ),
          ],
          `建筑 ${nextId}`,
          "building",
        );
      }
    } else {
      add(
        "places",
        1,
        [[[x + 0.035, y + 0.035]]],
        `公园入口 ${nextId}`,
        "park",
      );
    }
  }
}
const riverLeft = [];
const riverRight = [];
for (let i = 0; i <= 32; i++) {
  const y = 0.11 + i * 0.025;
  const x = 0.5 + Math.sin(y * 9) * 0.055;
  riverLeft.push([x - 0.022, y]);
  riverRight.push([x + 0.022, y]);
}
add("water", 3, [[...riverRight, ...riverLeft.reverse()]], "蜿蜒河", "river");
add(
  "water",
  3,
  [ring(0.61, 0.235, 0.145, 0.17), ring(0.66, 0.285, 0.045, 0.07).reverse()],
  "环岛湖（中部孔洞）",
  "lake",
);
for (let i = 0; i < 9; i++) {
  const coordinate = 0.1635 + i * 0.083;
  add(
    "roads",
    2,
    [
      [
        [0.12, coordinate],
        [0.88, coordinate],
      ],
    ],
    `东西路 ${i}`,
    i === 4 ? "primary" : "street",
  );
  add(
    "roads",
    2,
    [
      [
        [coordinate, 0.12],
        [coordinate, 0.88],
      ],
    ],
    `南北路 ${i}`,
    i === 4 ? "primary" : "street",
  );
}
add(
  "roads",
  2,
  [
    [
      [0.13, 0.86],
      [0.24, 0.77],
      [0.37, 0.69],
      [0.52, 0.64],
      [0.7, 0.56],
      [0.87, 0.45],
    ],
  ],
  "斜向大道",
  "primary",
);
for (const [x, y, name] of [
  [0.5, 0.5, "中央广场"],
  [0.68, 0.32, "湖心岛"],
  [0.38, 0.69, "换乘点"],
]) {
  add("places", 1, [[[x, y]]], name, "landmark");
}

function orient(part, exterior) {
  let area = 0;
  for (let i = 0; i < part.length; i++) {
    const a = part[i];
    const b = part[(i + 1) % part.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area > 0 === exterior ? part : part.toReversed();
}
function commands(feature, x, y, n) {
  let cursorX = 0;
  let cursorY = 0;
  const result = [];
  const delta = ([u, v]) => {
    const px = Math.round((u * n - x) * 4096);
    const py = Math.round((v * n - y) * 4096);
    const dx = px - cursorX;
    const dy = py - cursorY;
    result.push((dx << 1) ^ (dx >> 31), (dy << 1) ^ (dy >> 31));
    cursorX = px;
    cursorY = py;
  };
  feature.parts.forEach((input, index) => {
    const part = feature.type === 3 ? orient(input, index === 0) : input;
    result.push(feature.type === 1 ? (part.length << 3) | 1 : 9);
    delta(part[0]);
    if (part.length > 1) {
      if (feature.type !== 1) {
        result.push(((part.length - 1) << 3) | 2);
      }
      part.slice(1).forEach(delta);
    }
    if (feature.type === 3) {
      result.push(15);
    }
  });
  return result;
}
function intersects(feature, x, y, n) {
  const points = feature.parts.flat();
  const xs = points.map((point) => point[0] * n - x);
  const ys = points.map((point) => point[1] * n - y);
  return (
    Math.max(...xs) >= -0.05 &&
    Math.min(...xs) <= 1.05 &&
    Math.max(...ys) >= -0.05 &&
    Math.min(...ys) <= 1.05
  );
}
function encode(x, y, z) {
  const tile = protobuf.Writer.create();
  for (const [name, features] of Object.entries(layers)) {
    const selected = features.filter((feature) =>
      intersects(feature, x, y, 2 ** z),
    );
    const layer = protobuf.Writer.create()
      .uint32(120)
      .uint32(2)
      .uint32(10)
      .string(name)
      .uint32(40)
      .uint32(4096);
    const values = [];
    for (const feature of selected) {
      const base = values.length;
      values.push(feature.name, feature.kind);
      const message = protobuf.Writer.create().uint32(8).uint64(feature.id);
      message
        .uint32(18)
        .fork()
        .uint32(0)
        .uint32(base)
        .uint32(1)
        .uint32(base + 1)
        .ldelim();
      message.uint32(24).uint32(feature.type).uint32(34).fork();
      commands(feature, x, y, 2 ** z).forEach((value) => message.uint32(value));
      message.ldelim();
      layer.uint32(18).bytes(message.finish());
    }
    layer.uint32(26).string("name").uint32(26).string("kind");
    values.forEach((value) =>
      layer
        .uint32(34)
        .bytes(protobuf.Writer.create().uint32(10).string(value).finish()),
    );
    tile.uint32(26).bytes(layer.finish());
  }
  return tile.finish();
}
let bytes = 0;
for (let z = 0; z <= 2; z++) {
  for (let x = 0; x < 2 ** z; x++) {
    const directory = new URL(`tiles/${z}/${x}/`, import.meta.url);
    await mkdir(directory, { recursive: true });
    for (let y = 0; y < 2 ** z; y++) {
      const encoded = encode(x, y, z);
      bytes += encoded.byteLength;
      await writeFile(new URL(`${y}.pbf`, directory), encoded);
    }
  }
}
console.log(
  JSON.stringify({
    tiles: 21,
    bytes,
    features: Object.values(layers).reduce(
      (sum, features) => sum + features.length,
      0,
    ),
  }),
);
