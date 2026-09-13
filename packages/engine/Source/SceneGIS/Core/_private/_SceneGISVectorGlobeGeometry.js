import EncodedCartesian3 from "../../../Core/EncodedCartesian3.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import GlobeCoordinates from "./_SceneGISVectorGlobeCoordinates.js";

/** Subdivides long source triangles and packs stable local ellipsoid frames in the Worker. @private */
function prepareGlobeGeometry(batch, bounds) {
  if (!batch.ground) {
    for (const geometry of batch.geometries) {
      const high = geometry.attributes.position3DHigh.values;
      const low = geometry.attributes.position3DLow.values;
      const values = new Float32Array((high.length / 3) * 2);
      for (let i = 0; i < high.length / 3; i++) {
        values[i * 2] = high[i * 3] + low[i * 3];
        values[i * 2 + 1] = high[i * 3 + 1] + low[i * 3 + 1];
      }
      geometry.attributes.vectorAnchor = {
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values,
      };
      batch.byteLength += values.byteLength;
    }
    return batch;
  }
  const packed = batch.ground;
  const stride = packed.stride * 4;
  const vertices = Array.from(packed.vertices);
  const triangles = [];
  const frames = [];
  const radius = GlobeCoordinates.radius;
  const maximumEdgeSquared = (radius * 0.06) ** 2;
  function split(a, b, c) {
    const indices = [a, b, c];
    let edge = 0,
      longest = -1;
    for (let i = 0; i < 3; i++) {
      const p = indices[i] * stride,
        q = indices[(i + 1) % 3] * stride;
      const length =
        (vertices[p] - vertices[q]) ** 2 +
        (vertices[p + 1] - vertices[q + 1]) ** 2;
      if (length > longest) {
        longest = length;
        edge = i;
      }
    }
    if (longest > maximumEdgeSquared) {
      const first = indices[edge],
        second = indices[(edge + 1) % 3],
        third = indices[(edge + 2) % 3];
      const middle = vertices.length / stride;
      for (let i = 0; i < stride; i++) {
        vertices.push(
          (vertices[first * stride + i] + vertices[second * stride + i]) * 0.5,
        );
      }
      split(first, middle, third);
      split(middle, second, third);
      return;
    }
    const x =
      (vertices[a * stride] + vertices[b * stride] + vertices[c * stride]) / 3;
    const y =
      (vertices[a * stride + 1] +
        vertices[b * stride + 1] +
        vertices[c * stride + 1]) /
      3;
    // Round the projected reference first, so CPU and GPU share the same origin.
    const cx = Math.fround(x),
      cy = Math.fround(y);
    const longitude = (bounds.minimumX + cx) / radius;
    const latitude = GlobeCoordinates.latitude(bounds.maximumY + cy);
    const sin = Math.sin(latitude),
      cos = Math.cos(latitude);
    const den = 1 - GlobeCoordinates.eccentricitySquared * sin * sin;
    const n = radius / Math.sqrt(den);
    const m =
      (radius * (1 - GlobeCoordinates.eccentricitySquared)) / den ** 1.5;
    const origin = EncodedCartesian3.fromCartesian(
      GlobeCoordinates.position(bounds.minimumX + cx, bounds.maximumY + cy),
    );
    triangles.push(a, b, c, frames.length / 16);
    frames.push(
      cx,
      cy,
      sin,
      cos,
      origin.high.x,
      origin.high.y,
      origin.high.z,
      n,
      origin.low.x,
      origin.low.y,
      origin.low.z,
      m,
      Math.sin(longitude),
      Math.cos(longitude),
      (n * cos) / radius,
      (m * cos) / radius,
    );
  }
  for (let i = 0; i < packed.triangles.length; i += 4) {
    split(
      packed.triangles[i],
      packed.triangles[i + 1],
      packed.triangles[i + 2],
    );
  }
  batch.byteLength -= packed.vertices.byteLength + packed.triangles.byteLength;
  packed.vertices = new Float32Array(vertices);
  packed.triangles = new Float32Array(triangles);
  packed.frames = new Float32Array(frames);
  batch.byteLength +=
    packed.vertices.byteLength +
    packed.triangles.byteLength +
    packed.frames.byteLength;
  return batch;
}
export default prepareGlobeGeometry;
