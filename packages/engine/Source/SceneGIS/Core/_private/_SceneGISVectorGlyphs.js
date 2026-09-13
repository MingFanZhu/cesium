import protobuf from "protobufjs/minimal.js";
import RuntimeError from "../../../Core/RuntimeError.js";

/** Glyph PBF decoding and deterministic, single-channel atlas packing. @private */
const SceneGISVectorGlyphs = {
  decode(bytes) {
    try {
      const reader = protobuf.Reader.create(
        bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      );
      const glyphs = new Map();
      function read(end, depth) {
        if (end > reader.len) {
          throw new Error("Truncated glyph message.");
        }
        let glyph;
        if (depth === 2) {
          glyph = { bitmap: new Uint8Array() };
        }
        while (reader.pos < end) {
          const tag = reader.uint32();
          const field = tag >>> 3;
          const wire = tag & 7;
          if ((depth === 0 && field === 1) || (depth === 1 && field === 3)) {
            if (wire !== 2) {
              throw new Error("Invalid glyph message wire type.");
            }
            const length = reader.uint32();
            read(reader.pos + length, depth + 1);
          } else if (depth === 2 && field >= 1 && field <= 7) {
            if (wire !== (field === 2 ? 2 : 0)) {
              throw new Error("Invalid glyph field wire type.");
            }
            const names = [
              "",
              "id",
              "bitmap",
              "width",
              "height",
              "left",
              "top",
              "advance",
            ];
            glyph[names[field]] =
              field === 2
                ? reader.bytes().slice()
                : field === 5 || field === 6
                  ? reader.sint32()
                  : reader.uint32();
          } else {
            reader.skipType(wire);
          }
        }
        if (reader.pos !== end) {
          throw new Error("Glyph message exceeds its boundary.");
        }
        if (glyph) {
          for (const name of [
            "id",
            "width",
            "height",
            "left",
            "top",
            "advance",
          ]) {
            if (!Number.isInteger(glyph[name])) {
              throw new Error(`Missing glyph metric: ${name}`);
            }
          }
          if (
            glyph.id > 0x10ffff ||
            glyph.width > 256 ||
            glyph.height > 256 ||
            glyph.advance > 512 ||
            Math.abs(glyph.left) > 512 ||
            Math.abs(glyph.top) > 512 ||
            !(glyph.bitmap instanceof Uint8Array) ||
            glyphs.has(glyph.id)
          ) {
            throw new Error("Invalid or duplicate glyph.");
          }
          const bitmapSize = (glyph.width + 6) * (glyph.height + 6);
          if (
            glyph.bitmap.length !== bitmapSize &&
            !(
              glyph.bitmap.length === 0 &&
              (glyph.width === 0 || glyph.height === 0)
            )
          ) {
            throw new Error("Glyph bitmap dimensions do not match.");
          }
          glyphs.set(glyph.id, glyph);
          if (glyphs.size > 256) {
            throw new Error("Glyph range exceeds 256 entries.");
          }
        }
      }
      read(reader.len, 0);
      return glyphs;
    } catch (error) {
      throw new RuntimeError(`Invalid glyph PBF: ${error.message}`);
    }
  },
  pack(glyphs) {
    const width = 512;
    let x = 1,
      y = 1,
      row = 0;
    const positions = new Map();
    for (const [id, glyph] of glyphs) {
      if (!glyph.bitmap.length) {
        continue;
      }
      const w = glyph.width + 6,
        h = glyph.height + 6;
      if (x + w + 1 > width) {
        x = 1;
        y += row + 2;
        row = 0;
      }
      positions.set(id, { x, y, width: w, height: h });
      x += w + 2;
      row = Math.max(row, h);
    }
    const height = 2 ** Math.ceil(Math.log2(y + row + 1));
    if (height > 2048) {
      throw new RuntimeError("Glyph atlas exceeds the 512x2048 page limit.");
    }
    const data = new Uint8Array(width * height);
    for (const [id, rect] of positions) {
      const glyph = glyphs.get(id);
      for (let row = 0; row < rect.height; row++) {
        data.set(
          glyph.bitmap.subarray(row * rect.width, (row + 1) * rect.width),
          (rect.y + row) * width + rect.x,
        );
      }
    }
    return { width, height, arrayBufferView: data, positions };
  },
};
export default SceneGISVectorGlyphs;
