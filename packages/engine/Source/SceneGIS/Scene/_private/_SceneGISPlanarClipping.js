import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Plane from "../../../Core/Plane.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import Texture from "../../../Renderer/Texture.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import SceneGISPlanarPolygonGeometry from "../../Core/SceneGISPlanarPolygonGeometry.js";

const scratchPlane = new Plane(Cartesian3.UNIT_Z, 0.0);
const scratchTransformedPlane = new Plane(Cartesian3.UNIT_Z, 0.0);
// Matches the interpolation/dot roundoff boundary in SceneGISPlanarClippingFS.
const planeRoundoff = 8.0 * 2 ** -23;

function validateCollections(planes, polygons) {
  if (planes?.isDestroyed() || polygons?.isDestroyed()) {
    throw new DeveloperError(
      "Attached clipping collections must not be destroyed.",
    );
  }
}

/** @private */
function SceneGISPlanarClipping(extent) {
  this.origin = new Cartesian3(
    extent.minimumX + extent.width * 0.5,
    extent.minimumY + extent.height * 0.5,
    0.0,
  );
  this._defaultOrigin = Cartesian3.clone(this.origin);
  this._candidateOrigin = new Cartesian3();
  this.counts = new Cartesian2();
  this.union = false;
  this.inverse = false;
  this.edgeStyle = new Cartesian4();
  this.texture = undefined;
  this._data = undefined;
  this._candidate = undefined;
  this._debug = { createdTextures: 0, destroyedTextures: 0, uploads: 0 };
}

SceneGISPlanarClipping.isEnabled = function (planes, polygons) {
  validateCollections(planes, polygons);
  return (
    (planes?.enabled && planes.length > 0) ||
    (polygons?.enabled && polygons.length > 0) ||
    false
  );
};

SceneGISPlanarClipping.prototype.update = function (context, planes, polygons) {
  validateCollections(planes, polygons);
  const planeCount = planes?.enabled ? planes.length : 0;
  const polygonCount = polygons?.enabled ? polygons.length : 0;
  let texels = planeCount + polygonCount;
  for (let i = 0; i < polygonCount; ++i) {
    texels += polygons.get(i).length;
  }
  if (texels === 0) {
    this.counts.x = this.counts.y = 0;
    return;
  }
  if (!context.webgl2 || !context.floatingPointTexture) {
    throw new DeveloperError(
      "Planar terrain clipping requires WebGL 2 and floating point textures.",
    );
  }
  const limit = ContextLimits.maximumTextureSize;
  if (texels > Math.min(limit * limit, 2 ** 24)) {
    throw new DeveloperError(
      "Planar clipping data exceeds texture capacity or exact Float32 index range.",
    );
  }
  if (planeCount > 0) {
    const matrix = planes.modelMatrix;
    for (let i = 0; i < 16; ++i) {
      if (!Number.isFinite(matrix[i])) {
        throw new DeveloperError("clippingPlanes.modelMatrix must be finite.");
      }
    }
    const determinant =
      matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6]) -
      matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2]) +
      matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2]);
    if (
      matrix[3] !== 0 ||
      matrix[7] !== 0 ||
      matrix[11] !== 0 ||
      matrix[15] !== 1 ||
      !Number.isFinite(determinant) ||
      determinant === 0
    ) {
      throw new DeveloperError(
        "clippingPlanes.modelMatrix must be an invertible affine matrix.",
      );
    }
    if (
      !Number.isFinite(planes.edgeWidth) ||
      planes.edgeWidth < 0 ||
      !Number.isFinite(planes.edgeColor.red) ||
      !Number.isFinite(planes.edgeColor.green) ||
      !Number.isFinite(planes.edgeColor.blue)
    ) {
      throw new DeveloperError(
        "Clipping edge style must be finite with a non-negative width.",
      );
    }
  }
  const capacity = (this._data?.length ?? 0) / 4;
  let width = this.texture?.width;
  let height = this.texture?.height;
  if (capacity < texels) {
    const size = 2 ** Math.ceil(Math.log2(texels));
    width = Math.min(size, limit);
    height = Math.ceil(size / width);
  }
  if (this._candidate?.length !== width * height * 4) {
    this._candidate = new Float32Array(width * height * 4);
  }
  const candidate = this._candidate;
  const origin = Cartesian3.clone(this._defaultOrigin, this._candidateOrigin);
  if (polygonCount > 0) {
    const anchor = polygons.get(0).positions[0];
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
      throw new DeveloperError("Clipping polygons require finite positions.");
    }
    origin.x = anchor.x;
    origin.y = anchor.y;
  }
  let offset = 0;
  for (let i = 0; i < planeCount; ++i) {
    const plane = planes.get(i);
    const normal = plane.normal;
    if (
      !Number.isFinite(plane.distance) ||
      !Number.isFinite(normal.x) ||
      !Number.isFinite(normal.y) ||
      !Number.isFinite(normal.z) ||
      Math.abs(Cartesian3.magnitude(normal) - 1.0) > 1.0e-6
    ) {
      throw new DeveloperError(
        "Clipping planes require finite normalized normals and distances.",
      );
    }
    Cartesian3.clone(normal, scratchPlane.normal);
    scratchPlane.distance = plane.distance;
    const transformed = Plane.transform(
      scratchPlane,
      planes.modelMatrix,
      scratchTransformedPlane,
    );
    candidate[offset++] = transformed.normal.x;
    candidate[offset++] = transformed.normal.y;
    candidate[offset++] = transformed.normal.z;
    candidate[offset++] =
      transformed.distance + Cartesian3.dot(transformed.normal, origin);
  }
  let edgeOffset = planeCount + polygonCount;
  for (let i = 0; i < polygonCount; ++i) {
    const positions = polygons.get(i).positions;
    if (!Array.isArray(positions) || positions.length < 3) {
      throw new DeveloperError(
        "Clipping polygons require at least three positions.",
      );
    }
    for (const position of positions) {
      if (
        !(position instanceof Cartesian3) ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y) ||
        !Number.isFinite(position.z)
      ) {
        throw new DeveloperError(
          "Clipping polygons require finite Cartesian3 positions.",
        );
      }
    }
    candidate[offset++] = edgeOffset;
    candidate[offset++] = positions.length;
    candidate[offset++] = 0;
    candidate[offset++] = 0;
    for (let j = 0; j < positions.length; ++j) {
      const a = positions[j];
      const b = positions[(j + 1) % positions.length];
      const edge = edgeOffset++ * 4;
      candidate[edge] = a.x - origin.x;
      candidate[edge + 1] = a.y - origin.y;
      candidate[edge + 2] = b.x - origin.x;
      candidate[edge + 3] = b.y - origin.y;
    }
  }
  let changed = capacity < texels;
  for (let i = 0; i < texels * 4; ++i) {
    if (!Number.isFinite(candidate[i])) {
      throw new DeveloperError(
        "Local clipping coordinates must be representable as finite Float32 values.",
      );
    }
    changed ||= candidate[i] !== this._data?.[i];
  }
  if (changed) {
    for (let i = 0; i < polygonCount; ++i) {
      const header = (planeCount + i) * 4;
      const start = candidate[header] * 4;
      const length = candidate[header + 1];
      const positions = [];
      for (let j = 0; j < length; ++j) {
        const edge = start + j * 4;
        positions.push(
          new Cartesian3(
            candidate[edge] - candidate[start],
            candidate[edge + 1] - candidate[start + 1],
            0.0,
          ),
        );
      }
      // Share the existing planar simple-ring validator in a local frame.
      // Only constructor validation is needed; no geometry buffers are created.
      // eslint-disable-next-line no-new
      new SceneGISPlanarPolygonGeometry({ positions });
    }
  }
  if (capacity < texels) {
    const texture = new Texture({
      context,
      width,
      height,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.NEAREST,
        magnificationFilter: TextureMagnificationFilter.NEAREST,
      }),
      source: { arrayBufferView: candidate },
      flipY: false,
    });
    if (this.texture) {
      this.texture.destroy();
      ++this._debug.destroyedTextures;
    }
    this.texture = texture;
    this._data = new Float32Array(candidate.length);
    ++this._debug.createdTextures;
  } else if (changed) {
    this.texture.copyFrom({
      source: { width, height, arrayBufferView: candidate },
    });
  }
  if (changed) {
    this._data.set(candidate);
    ++this._debug.uploads;
  }
  this.counts.x = planeCount;
  Cartesian3.clone(origin, this.origin);
  this.counts.y = polygonCount;
  this.union = planes?.unionClippingRegions ?? false;
  this.inverse = polygons?.inverse ?? false;
  if (planeCount > 0) {
    Cartesian4.fromElements(
      planes.edgeColor.red,
      planes.edgeColor.green,
      planes.edgeColor.blue,
      planes.edgeWidth,
      this.edgeStyle,
    );
  }
};

SceneGISPlanarClipping.prototype.isClipped = function (position) {
  const x = position.x - this.origin.x;
  const y = position.y - this.origin.y;
  const z = position.z - this.origin.z;
  const data = this._data;
  let planeClipped = !this.union;
  for (let i = 0; i < this.counts.x; ++i) {
    const p = i * 4;
    const nx = data[p] * x;
    const ny = data[p + 1] * y;
    const nz = data[p + 2] * z;
    const distance = nx + ny + nz + data[p + 3];
    const tolerance =
      planeRoundoff *
      (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) + Math.abs(data[p + 3]));
    const outside = distance <= tolerance;
    planeClipped = this.union
      ? planeClipped || outside
      : planeClipped && outside;
  }
  if (this.counts.x > 0 && planeClipped) {
    return true;
  }
  let insideAny = false;
  for (let i = 0; i < this.counts.y; ++i) {
    const header = (this.counts.x + i) * 4;
    const start = data[header];
    const length = data[header + 1];
    let inside = false;
    for (let j = 0; j < length; ++j) {
      const p = (start + j) * 4;
      const ax = data[p],
        ay = data[p + 1],
        bx = data[p + 2],
        by = data[p + 3];
      const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (
        cross === 0 &&
        x >= Math.min(ax, bx) &&
        x <= Math.max(ax, bx) &&
        y >= Math.min(ay, by) &&
        y <= Math.max(ay, by)
      ) {
        inside = true;
        break;
      }
      if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) {
        inside = !inside;
      }
    }
    insideAny ||= inside;
  }
  return this.counts.y > 0 && (this.inverse ? !insideAny : insideAny);
};

SceneGISPlanarClipping.prototype.destroy = function () {
  if (this.texture) {
    this.texture.destroy();
    this.texture = undefined;
    ++this._debug.destroyedTextures;
  }
  this._data = this._candidate = undefined;
};

export default SceneGISPlanarClipping;
