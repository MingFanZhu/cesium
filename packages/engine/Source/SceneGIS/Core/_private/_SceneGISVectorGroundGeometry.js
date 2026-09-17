/** Packs existing vector triangles into numeric GPU tables, without terrain data. @private */
function packVectorGroundGeometry(geometry, kind, allowPicking) {
  const attributes = geometry.attributes;
  const high = attributes.position3DHigh.values;
  const low = attributes.position3DLow.values;
  const count = high.length / 3;
  const baseStride = kind === "line" ? 7 : 3;
  const stride = baseStride + (attributes.patternRect ? 2 : 0);
  const vertices = new Float32Array(count * stride * 4);
  const pick = attributes.pickColor?.values;
  const tokens = allowPicking
    ? new Uint32Array(pick.buffer, pick.byteOffset, pick.length / 4)
    : undefined;
  const copy = (name, vertex, offset) => {
    const attribute = attributes[name];
    if (!attribute) {
      return;
    }
    const n = attribute.componentsPerAttribute;
    for (let j = 0; j < n; j++) {
      vertices[offset + j] = attribute.values[vertex * n + j];
    }
  };
  for (let i = 0; i < count; i++) {
    const offset = i * stride * 4;
    vertices[offset] = high[i * 3] + low[i * 3];
    vertices[offset + 1] = high[i * 3 + 1] + low[i * 3 + 1];
    vertices[offset + 2] = tokens?.[i] ?? 0;
    vertices[offset + 3] = attributes.fringe?.values[i * 3 + 2] ?? 1;
    for (let j = 0; j < 4; j++) {
      vertices[offset + 4 + j] = attributes.color.values[i * 4 + j] / 255;
    }
    if (kind === "line") {
      copy("lineExtrude", i, offset + 8);
      copy("lineOffset", i, offset + 10);
      copy("lineMetrics", i, offset + 12);
      copy("linePaint", i, offset + 16);
      copy("lineDash", i, offset + 20);
      copy("lineEnds", i, offset + 24);
    } else if (attributes.fringe) {
      vertices[offset + 8] = attributes.fringe.values[i * 3];
      vertices[offset + 9] = attributes.fringe.values[i * 3 + 1];
    }
    if (attributes.patternRect) {
      copy("patternRect", i, offset + baseStride * 4);
      copy("patternSize", i, offset + baseStride * 4 + 4);
    }
  }
  const triangles = new Float32Array((geometry.indices.length / 3) * 4);
  for (let i = 0; i < geometry.indices.length / 3; i++) {
    triangles.set(geometry.indices.subarray(i * 3, i * 3 + 3), i * 4);
  }
  return { vertices, triangles, stride };
}
export default packVectorGroundGeometry;
