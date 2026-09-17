import protobuf from "protobufjs/minimal.js";

// Authored SDF rectangle, with the same metrics convention as a glyph PBF.
export function glyph(code = 65) {
  const bitmap = new Uint8Array(18 * 24);
  for (let y = 3; y < 21; y++) {
    for (let x = 3; x < 15; x++) {
      bitmap[y * 18 + x] = 255;
    }
  }
  return {
    id: code,
    width: 12,
    height: 18,
    left: 0,
    top: -8,
    advance: 16,
    bitmap,
  };
}
export function encodeGlyphs(glyphs = [glyph()]) {
  const stack = protobuf.Writer.create();
  for (const g of glyphs) {
    const w = protobuf.Writer.create().uint32(8).uint32(g.id);
    if (g.bitmap) {
      w.uint32(18).bytes(g.bitmap);
    }
    w.uint32(24)
      .uint32(g.width)
      .uint32(32)
      .uint32(g.height)
      .uint32(40)
      .sint32(g.left)
      .uint32(48)
      .sint32(g.top)
      .uint32(56)
      .uint32(g.advance);
    stack.uint32(26).bytes(w.finish());
  }
  return protobuf.Writer.create().uint32(10).bytes(stack.finish()).finish();
}
