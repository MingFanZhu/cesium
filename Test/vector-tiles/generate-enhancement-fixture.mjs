import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { Buffer } from "node:buffer";
import protobuf from "protobufjs/minimal.js";

// Authored coincident POIs exercise anchor choice independently of remote data.
const layer = protobuf.Writer.create()
  .uint32(120)
  .uint32(2)
  .uint32(10)
  .string("labels")
  .uint32(40)
  .uint32(4096)
  .uint32(26)
  .string("name");
for (const [index, name] of ["Cafe", "Museum", "Park"].entries()) {
  layer
    .uint32(34)
    .bytes(protobuf.Writer.create().uint32(10).string(name).finish());
  const feature = protobuf.Writer.create()
    .uint32(8)
    .uint32(701 + index)
    .uint32(18)
    .fork()
    .uint32(0)
    .uint32(index)
    .ldelim()
    .uint32(24)
    .uint32(1)
    .uint32(34)
    .fork()
    .uint32(9)
    .sint32(2450)
    .sint32(2450)
    .ldelim();
  layer.uint32(18).bytes(feature.finish());
}
const extra = protobuf.Writer.create()
  .uint32(26)
  .bytes(layer.finish())
  .finish();
await writeFile(
  new URL("./enhancements.pbf", import.meta.url),
  Buffer.concat([
    await readFile(new URL("./public-fixture.pbf", import.meta.url)),
    extra,
  ]),
);
