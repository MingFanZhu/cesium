import DeveloperError from "../../../Core/DeveloperError.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import Texture from "../../../Renderer/Texture.js";

/** Immutable original shoreline with stackless CPU/GPU queries. @private */
class SceneGISWaterBoundary {
  constructor(edges, maximumBytes = 8388608) {
    const count = edges.length / 4;
    if (count * 16 > maximumBytes) {
      throw new DeveloperError(
        "Shoreline exceeds maximumUnderwaterBoundaryBytes.",
      );
    }
    const records = Array.from({ length: count }, (_, i) => {
      const a = Array.from(edges.slice(i * 4, i * 4 + 4));
      return {
        edge: a,
        bounds: [
          Math.min(a[0], a[2]),
          Math.min(a[1], a[3]),
          Math.max(a[0], a[2]),
          Math.max(a[1], a[3]),
        ],
      };
    });
    this.nodes = [];
    const ordered = [];
    const build = (items) => {
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const item of items) {
        for (let k = 0; k < 2; k++) {
          bounds[k] = Math.min(bounds[k], item.bounds[k]);
          bounds[k + 2] = Math.max(bounds[k + 2], item.bounds[k + 2]);
        }
      }
      const node = { bounds, first: ordered.length / 4, count: 0 };
      this.nodes.push(node);
      if (items.length <= 4) {
        node.count = items.length;
        for (const item of items) {
          ordered.push(...item.edge);
        }
      } else {
        const axis = bounds[2] - bounds[0] >= bounds[3] - bounds[1] ? 0 : 1;
        items.sort(
          (a, b) =>
            a.bounds[axis] +
            a.bounds[axis + 2] -
            b.bounds[axis] -
            b.bounds[axis + 2],
        );
        const middle = Math.floor(items.length / 2);
        build(items.slice(0, middle));
        build(items.slice(middle));
      }
      node.escape = this.nodes.length;
    };
    build(records);
    this.edges = new Float64Array(ordered);
    const edgeOffset = this.nodes.length * 2;
    const texels = edgeOffset + count;
    this.width = Math.ceil(Math.sqrt(texels));
    this.height = Math.ceil(texels / this.width);
    this.byteLength = this.width * this.height * 16;
    if (this.byteLength > maximumBytes) {
      throw new DeveloperError(
        `Shoreline index requires ${this.byteLength} bytes, exceeding maximumUnderwaterBoundaryBytes=${maximumBytes}.`,
      );
    }
    this.data = new Float32Array(this.width * this.height * 4);
    this.nodes.forEach((node, i) => {
      const b = node.bounds;
      // Bound expansion covers FP32 chart/slab rounding only; leaf geometry is unchanged.
      const x = Math.max(1, Math.abs(b[0]), Math.abs(b[2])) * 2 ** -21;
      const y = Math.max(1, Math.abs(b[1]), Math.abs(b[3])) * 2 ** -21;
      this.data.set(
        [
          b[0] - x,
          b[1] - y,
          b[2] + x,
          b[3] + y,
          node.escape,
          edgeOffset + node.first,
          node.count,
          0,
        ],
        i * 8,
      );
    });
    this.data.set(this.edges, edgeOffset * 4);
  }

  contains(x, y) {
    let inside = false;
    for (let i = 0; i < this.nodes.length;) {
      const node = this.nodes[i],
        b = node.bounds;
      if (y < b[1] || y > b[3] || x >= b[2]) {
        i = node.escape;
        continue;
      }
      for (let j = node.first * 4; j < (node.first + node.count) * 4; j += 4) {
        const e = this.edges,
          ax = e[j],
          ay = e[j + 1],
          bx = e[j + 2],
          by = e[j + 3];
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
          inside = !inside;
        }
      }
      i++;
    }
    return inside;
  }

  createTexture(context) {
    if (Math.max(this.width, this.height) > ContextLimits.maximumTextureSize) {
      throw new RuntimeError(
        "Underwater boundary index exceeds this context's texture size limit.",
      );
    }
    return new Texture({
      context,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      sampler: Sampler.NEAREST,
      flipY: false,
      source: {
        width: this.width,
        height: this.height,
        arrayBufferView: this.data,
      },
    });
  }
}
export default SceneGISWaterBoundary;
