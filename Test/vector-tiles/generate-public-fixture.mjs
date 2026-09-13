import { writeFile } from "node:fs/promises";
import { URL } from "node:url";
import protobuf from "protobufjs/minimal.js";

// Authored schema fixture for isolated HTTP/E2E tests; contains no downloaded map data.
const definitions = [
  {
    name: "water",
    type: 3,
    id: 101,
    properties: { name: "SceneGIS test water", class: "lake" },
    points: [
      [0, 0],
      [4096, 0],
      [4096, 4096],
      [0, 4096],
    ],
  },
  {
    name: "transportation",
    type: 2,
    id: 203,
    properties: {
      name: "SceneGIS test road",
      class: "primary",
      brunnel: "none",
    },
    points: [
      [0, 2048],
      [4096, 2048],
    ],
  },
  {
    name: "building",
    type: 3,
    id: 304,
    properties: {
      name: "SceneGIS test building",
      type: "building",
      underground: "false",
      hide_3d: false,
      render_height: 10,
    },
    points: [
      [1200, 600],
      [1700, 600],
      [1700, 1100],
      [1200, 1100],
    ],
  },
];
const tile = protobuf.Writer.create();
for (const definition of definitions) {
  const layer = protobuf.Writer.create()
    .uint32(120)
    .uint32(2)
    .uint32(10)
    .string(definition.name)
    .uint32(40)
    .uint32(4096);
  const feature = protobuf.Writer.create()
    .uint32(8)
    .uint32(definition.id)
    .uint32(18)
    .fork();
  const entries = Object.entries(definition.properties);
  for (const index of entries.keys()) {
    feature.uint32(index).uint32(index);
  }
  feature
    .ldelim()
    .uint32(24)
    .uint32(definition.type)
    .uint32(34)
    .fork()
    .uint32(9);
  let x = 0;
  let y = 0;
  definition.points.forEach((point, index) => {
    if (index === 1) {
      feature.uint32(((definition.points.length - 1) << 3) | 2);
    }
    const dx = point[0] - x;
    const dy = point[1] - y;
    feature.uint32((dx << 1) ^ (dx >> 31)).uint32((dy << 1) ^ (dy >> 31));
    [x, y] = point;
  });
  if (definition.type === 3) {
    feature.uint32(15);
  }
  feature.ldelim();
  layer.uint32(18).bytes(feature.finish());
  for (const [key, value] of entries) {
    layer.uint32(26).string(key);
    const encoded = protobuf.Writer.create();
    if (typeof value === "boolean") {
      encoded.uint32(56).bool(value);
    } else if (typeof value === "number") {
      encoded.uint32(25).double(value);
    } else {
      encoded.uint32(10).string(value);
    }
    layer.uint32(34).bytes(encoded.finish());
  }
  tile.uint32(26).bytes(layer.finish());
}
await writeFile(
  new URL("./public-fixture.pbf", import.meta.url),
  tile.finish(),
);
