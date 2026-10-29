import DeveloperError from "../../../Core/DeveloperError.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import Texture from "../../../Renderer/Texture.js";

function prepare(polygons) {
  const triangles = [];
  for (const polygon of polygons) {
    for (let i = 1; i + 1 < polygon.length; ++i) {
      const a = polygon[0];
      let [b, c] = [polygon[i], polygon[i + 1]];
      let area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) <= 1e-8) {
        continue;
      }
      if (area < 0) {
        [b, c] = [c, b];
        area = -area;
      }
      const gx =
        ((b[2] - a[2]) * (c[1] - a[1]) - (c[2] - a[2]) * (b[1] - a[1])) / area;
      const gy =
        ((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / area;
      triangles.push({
        a: a.slice(0, 3),
        b: b.slice(0, 3),
        c: c.slice(0, 3),
        gx,
        gy,
        bounds: [
          Math.min(a[0], b[0], c[0]),
          Math.min(a[1], b[1], c[1]),
          Math.max(a[0], b[0], c[0]),
          Math.max(a[1], b[1], c[1]),
        ],
      });
    }
  }
  if (!triangles.length || triangles.length > 1024) {
    throw new DeveloperError(
      "Water profiles require between 1 and 1024 prepared triangles.",
    );
  }
  return triangles;
}

function cross(a, b, x, y) {
  return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
}

/** Immutable original water profile with stackless CPU/GPU BVH queries. Surface-owned. @private */
class SceneGISWaterDomain {
  constructor(mesh) {
    this.reference = mesh.root.minHeight;
    this.minimum = mesh.root.minHeight;
    this.maximum = mesh.root.maxHeight;
    this.triangles = prepare(mesh.root.polygons);
    this.nodes = [];
    const build = (triangles) => {
      const b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const t of triangles) {
        b[0] = Math.min(b[0], t.bounds[0]);
        b[1] = Math.min(b[1], t.bounds[1]);
        b[2] = Math.max(b[2], t.bounds[2]);
        b[3] = Math.max(b[3], t.bounds[3]);
      }
      const node = { bounds: b };
      this.nodes.push(node);
      if (triangles.length === 1) {
        node.triangle = triangles[0];
      } else {
        const axis = b[2] - b[0] >= b[3] - b[1] ? 0 : 1;
        triangles.sort(
          (a, c) =>
            a.bounds[axis] +
            a.bounds[axis + 2] -
            (c.bounds[axis] + c.bounds[axis + 2]),
        );
        const middle = Math.floor(triangles.length / 2);
        build(triangles.slice(0, middle));
        build(triangles.slice(middle));
      }
      node.escape = this.nodes.length;
    };
    build(this.triangles.slice());
    this.data = new Float32Array(this.nodes.length * 16);
    this.nodes.forEach((node, index) => {
      const offset = index * 16,
        t = node.triangle;
      this.data.set(node.bounds, offset);
      this.data[offset + 13] = node.escape;
      if (t) {
        this.data.set(
          [
            t.a[0],
            t.a[1],
            t.b[0],
            t.b[1],
            t.c[0],
            t.c[1],
            t.gx,
            t.gy,
            t.a[2] - this.reference,
            node.escape,
            1,
            0,
          ],
          offset + 4,
        );
      }
    });
  }

  sample(x, y, result) {
    for (let i = 0; i < this.nodes.length;) {
      const node = this.nodes[i],
        b = node.bounds;
      if (x < b[0] || y < b[1] || x > b[2] || y > b[3]) {
        i = node.escape;
        continue;
      }
      const t = node.triangle;
      if (t) {
        if (
          cross(t.a, t.b, x, y) >= -1e-9 &&
          cross(t.b, t.c, x, y) >= -1e-9 &&
          cross(t.c, t.a, x, y) >= -1e-9
        ) {
          result.x = t.a[2] + t.gx * (x - t.a[0]) + t.gy * (y - t.a[1]);
          result.y = t.gx;
          result.z = t.gy;
          return true;
        }
      }
      ++i;
    }
    return false;
  }

  create(context) {
    this.texture ??= new Texture({
      context,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      sampler: Sampler.NEAREST,
      flipY: false,
      source: {
        width: 4,
        height: this.nodes.length,
        arrayBufferView: this.data,
      },
    });
  }

  destroy() {
    this.texture?.destroy();
  }
}
export default SceneGISWaterDomain;
