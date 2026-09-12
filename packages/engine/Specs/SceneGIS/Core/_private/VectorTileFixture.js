import protobuf from "protobufjs/minimal.js";

// Independent protobuf fixture authoring. Geometry command streams are supplied
// by each test, rather than produced by the decoder under test.
function vectorTileFixture(layers = [{}]) {
  const tile = protobuf.Writer.create();
  for (const definition of layers) {
    const layer = protobuf.Writer.create();
    // Features precede dictionaries and version to exercise field-order independence.
    if (definition.name !== null) {
      layer.uint32(10).string(definition.name ?? "data");
    }
    for (const feature of definition.features ?? [
      { type: 1, geometry: [9, 20, 40] },
    ]) {
      const writer = protobuf.Writer.create();
      if (feature.id !== undefined) {
        writer.uint32(8).uint64(feature.id);
      }
      if (feature.type !== undefined) {
        writer.uint32(24).uint32(feature.type);
      }
      for (const [field, values] of [
        [2, feature.tags],
        [4, feature.geometry],
      ]) {
        if (values !== undefined) {
          if (feature.unpacked) {
            values.forEach((value) => writer.uint32(field * 8).uint32(value));
          } else {
            writer.uint32(field * 8 + 2).fork();
            values.forEach((value) => writer.uint32(value));
            writer.ldelim();
          }
        }
      }
      layer.uint32(18).bytes(writer.finish());
    }
    for (const key of definition.keys ?? []) {
      layer.uint32(26).string(key);
    }
    for (const value of definition.values ?? []) {
      const writer = protobuf.Writer.create();
      for (const [type, field, wire] of [
        ["string", 1, 2],
        ["float", 2, 5],
        ["double", 3, 1],
        ["int64", 4, 0],
        ["uint64", 5, 0],
        ["sint64", 6, 0],
        ["bool", 7, 0],
      ]) {
        if (Object.hasOwn(value, type)) {
          writer.uint32(field * 8 + wire)[type](value[type]);
        }
      }
      layer.uint32(34).bytes(writer.finish());
    }
    if (definition.extent !== null) {
      layer.uint32(40).uint32(definition.extent ?? 4096);
    }
    if (definition.version !== null) {
      layer.uint32(120).uint32(definition.version ?? 2);
    }
    tile.uint32(26).bytes(layer.finish());
  }
  return new Uint8Array(tile.finish());
}

export default vectorTileFixture;
