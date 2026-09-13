import { writeFile } from "node:fs/promises";
import { URL } from "node:url";
import protobuf from "protobufjs/minimal.js";
import cases from "./style-cases.mjs";

const layer = protobuf.Writer.create()
  .uint32(120)
  .uint32(2)
  .uint32(10)
  .string("styles")
  .uint32(40)
  .uint32(4096);
const keys = [];
const values = [];
let id = 0;
for (const sample of cases) {
  for (const input of sample.features) {
    const type = { line: 2, fill: 3, circle: 1 }[sample.type];
    const message = protobuf.Writer.create()
      .uint32(8)
      .uint32(++id)
      .uint32(18)
      .fork();
    for (const [key, value] of Object.entries({
      case: sample.id,
      name: sample.title,
      ...input.properties,
    })) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
      message.uint32(keys.indexOf(key)).uint32(values.length);
      values.push(value);
    }
    message.ldelim().uint32(24).uint32(type).uint32(34).fork();
    let cursorX = 0;
    let cursorY = 0;
    input.parts.forEach((part, index) => {
      let points = part.map(([x, y]) => [
        2048 + sample.x + x,
        2048 - sample.y - y,
      ]);
      if (type === 3) {
        const area = points.reduce((sum, p, i) => {
          const q = points[(i + 1) % points.length];
          return sum + p[0] * q[1] - q[0] * p[1];
        }, 0);
        if (area > 0 !== (index === 0)) {
          points = points.reverse();
        }
      }
      message.uint32(type === 1 ? (points.length << 3) | 1 : 9);
      points.forEach(([x, y], i) => {
        if (i === 1 && type !== 1) {
          message.uint32(((points.length - 1) << 3) | 2);
        }
        const dx = x - cursorX;
        const dy = y - cursorY;
        message.uint32((dx << 1) ^ (dx >> 31)).uint32((dy << 1) ^ (dy >> 31));
        cursorX = x;
        cursorY = y;
      });
      if (type === 3) {
        message.uint32(15);
      }
    });
    message.ldelim();
    layer.uint32(18).bytes(message.finish());
  }
}
keys.forEach((key) => layer.uint32(26).string(key));
for (const value of values) {
  const writer = protobuf.Writer.create();
  if (typeof value === "string") {
    writer.uint32(10).string(value);
  } else if (typeof value === "boolean") {
    writer.uint32(56).bool(value);
  } else {
    writer.uint32(25).double(value);
  }
  layer.uint32(34).bytes(writer.finish());
}
await writeFile(
  new URL("./styles.pbf", import.meta.url),
  protobuf.Writer.create().uint32(26).bytes(layer.finish()).finish(),
);
