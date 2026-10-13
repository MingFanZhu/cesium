import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import destroyObject from "../../../Core/destroyObject.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import Texture from "../../../Renderer/Texture.js";

const maximumLights = 256;
const tileSize = 32;
const tableWidth = 256;
const indicesPerRow = tableWidth * 4;
const parameterRows = (maximumLights * 4) / tableWidth;

function texture(context, height) {
  return new Texture({
    context,
    width: tableWidth,
    height,
    pixelFormat: PixelFormat.RGBA_INTEGER,
    pixelDatatype: PixelDatatype.UNSIGNED_INT,
    sampler: Sampler.NEAREST,
    flipY: false,
  });
}

function upload(target, array, yOffset, height) {
  target.copyFrom({
    yOffset,
    source: { width: tableWidth, height, arrayBufferView: array },
  });
}

// Project an enclosing range box clipped to the eye-space near plane. Clipping
// before division keeps near intersections and camera-inside lights conservative.
function bounds(tiles, parameters, index, camera, width, height) {
  const p = index * 16;
  const radius = Math.sqrt(parameters[p + 3]);
  const x = parameters[p];
  const y = parameters[p + 1];
  const z = parameters[p + 2];
  const nearZ = -camera.frustum.near;
  const back = z - radius;
  if (back > nearZ) {
    return false;
  }
  const front = Math.min(z + radius, nearZ);
  const projection = camera.frustum.projectionMatrix;
  const corner = tiles._corner;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    Cartesian4.fromElements(
      x + (i & 1 ? radius : -radius),
      y + (i & 2 ? radius : -radius),
      i & 4 ? front : back,
      1,
      corner,
    );
    Matrix4.multiplyByVector(projection, corner, corner);
    const projectedX = corner.x / corner.w;
    const projectedY = corner.y / corner.w;
    minX = Math.min(minX, projectedX);
    minY = Math.min(minY, projectedY);
    maxX = Math.max(maxX, projectedX);
    maxY = Math.max(maxY, projectedY);
  }
  // The existing TAA sequence moves the projection by less than half a pixel.
  minX -= 2 / width;
  maxX += 2 / width;
  minY -= 2 / height;
  maxY += 2 / height;
  if (maxX < -1 || maxY < -1 || minX > 1 || minY > 1) {
    return false;
  }
  const columns = tiles.grid.x;
  const rows = tiles.grid.y;
  const b = index * 4;
  const box = tiles._bounds;
  box[b] = Math.max(0, Math.floor((minX * 0.5 + 0.5) * columns));
  box[b + 1] = Math.max(0, Math.floor((minY * 0.5 + 0.5) * rows));
  box[b + 2] = Math.min(columns - 1, Math.floor((maxX * 0.5 + 0.5) * columns));
  box[b + 3] = Math.min(rows - 1, Math.floor((maxY * 0.5 + 0.5) * rows));
  return true;
}

/**
 * Scene-owned local-light tables. Camera preparation and all receivers share
 * these textures; no geometry or depth readback is required.
 * @private
 */
function SceneGISLightTiles(context) {
  if (!context.webgl2) {
    throw new DeveloperError("Tiled local lighting requires WebGL2.");
  }
  this._context = context;
  this.grid = new Cartesian2();
  this.parameters = new Float32Array(maximumLights * 16);
  this._parameterBits = new Uint32Array(this.parameters.buffer);
  this._bounds = new Int32Array(maximumLights * 4);
  this._visible = new Uint8Array(maximumLights);
  this._corner = new Cartesian4();
  this._headers = undefined;
  this._cursor = undefined;
  this._indices = undefined;
  this.texture = undefined;
  this.indexRow = 0;
  this.referenceCount = 0;
  this.maximumTileCount = 0;
  this.byteLength = 0;
}

SceneGISLightTiles.maximumLights = maximumLights;

SceneGISLightTiles.prototype.update = function (count, camera, width, height) {
  const columns = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const context = this._context;
  if (columns !== this.grid.x || rows !== this.grid.y) {
    this.grid.x = columns;
    this.grid.y = rows;
    this._headers = new Uint32Array(
      Math.ceil((columns * rows) / tableWidth) * tableWidth * 4,
    );
    this._cursor = new Uint32Array(columns * rows);
  }
  const headers = this._headers;
  headers.fill(0);
  const box = this._bounds;
  for (let i = 0; i < count; i++) {
    this._visible[i] = bounds(this, this.parameters, i, camera, width, height);
    if (!this._visible[i]) {
      continue;
    }
    const b = i * 4;
    for (let y = box[b + 1]; y <= box[b + 3]; y++) {
      for (let x = box[b]; x <= box[b + 2]; x++) {
        headers[(y * columns + x) * 4 + 1]++;
      }
    }
  }
  let total = 0;
  let maximum = 0;
  let references = 0;
  for (let i = 0; i < columns * rows; i++) {
    const length = headers[i * 4 + 1];
    headers[i * 4] = length === count ? 0 : total;
    this._cursor[i] = total;
    // A complete tile is the ordered global table; no index indirection is needed.
    if (length !== count) {
      total += length;
    }
    references += length;
    maximum = Math.max(maximum, length);
  }
  const indexRows = Math.max(1, Math.ceil(total / indicesPerRow));
  if (!this._indices || this._indices.length < indexRows * indicesPerRow) {
    this._indices = new Uint32Array(
      indicesPerRow * 2 ** Math.ceil(Math.log2(indexRows)),
    );
  }
  const headerRows = headers.length / indicesPerRow;
  this.indexRow = parameterRows + headerRows;
  const capacityRows = this.indexRow + this._indices.length / indicesPerRow;
  if (!this.texture || this.texture.height < capacityRows) {
    this.texture?.destroy();
    this.texture = texture(context, capacityRows);
  }
  // Ascending descriptor order preserves accumulation order relative to the
  // global-list reference, including all lights in a fully overlapping tile.
  for (let i = 0; i < count; i++) {
    if (!this._visible[i]) {
      continue;
    }
    const b = i * 4;
    for (let y = box[b + 1]; y <= box[b + 3]; y++) {
      for (let x = box[b]; x <= box[b + 2]; x++) {
        const tile = y * columns + x;
        if (headers[tile * 4 + 1] !== count) {
          this._indices[this._cursor[tile]++] = i;
        }
      }
    }
  }
  // One integer texture preserves parameter float bits and exact integer indices,
  // leaving sampler slots available for native materials and reflection probes.
  upload(this.texture, this._parameterBits, 0, parameterRows);
  upload(this.texture, headers, parameterRows, headerRows);
  upload(this.texture, this._indices, this.indexRow, indexRows);
  this.referenceCount = references;
  this.maximumTileCount = maximum;
  this.byteLength = this.texture.width * this.texture.height * 16;
};

SceneGISLightTiles.prototype.isDestroyed = function () {
  return false;
};

SceneGISLightTiles.prototype.destroy = function () {
  this.texture?.destroy();
  return destroyObject(this);
};

export default SceneGISLightTiles;
