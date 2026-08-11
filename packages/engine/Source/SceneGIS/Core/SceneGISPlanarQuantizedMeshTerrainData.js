import Check from "../../Core/Check.js";
import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import SceneGISPlanarExtent from "./SceneGISPlanarExtent.js";

const MAX_SHORT = 32767;

function validateIndexArray(name, value) {
  if (!(value instanceof Uint16Array) && !(value instanceof Uint32Array)) {
    throw new DeveloperError(`${name} must be a Uint16Array or Uint32Array.`);
  }
}

function validateMetadata(options) {
  const childTileMask = options.childTileMask ?? 15;
  if (
    !Number.isInteger(childTileMask) ||
    childTileMask < 0 ||
    childTileMask > 15
  ) {
    throw new DeveloperError(
      "options.childTileMask must be an integer between 0 and 15.",
    );
  }
  if (
    options.waterMask !== undefined &&
    !(options.waterMask instanceof Uint8Array)
  ) {
    throw new DeveloperError("options.waterMask must be a Uint8Array.");
  }
  if (options.credits !== undefined) {
    if (
      !Array.isArray(options.credits) ||
      options.credits.some((credit) => !(credit instanceof Credit))
    ) {
      throw new DeveloperError(
        "options.credits must be an array of Credit objects.",
      );
    }
  }
  const createdByUpsampling = options.createdByUpsampling ?? false;
  Check.typeOf.bool("options.createdByUpsampling", createdByUpsampling);
  return { childTileMask, createdByUpsampling };
}

function decodeHeight(value, minimum, maximum) {
  return minimum + (value / MAX_SHORT) * (maximum - minimum);
}

function validateEdge(name, edge, coordinate, expected, vertexCount) {
  validateIndexArray(name, edge);
  const seen = new Set();
  for (let i = 0; i < edge.length; ++i) {
    const index = edge[i];
    if (
      index >= vertexCount ||
      coordinate[index] !== expected ||
      seen.has(index)
    ) {
      throw new DeveloperError(
        `${name} must contain each matching boundary vertex once.`,
      );
    }
    seen.add(index);
  }
  for (let i = 0; i < vertexCount; ++i) {
    if (coordinate[i] === expected && !seen.has(i)) {
      throw new DeveloperError(
        `${name} must cover every matching boundary vertex.`,
      );
    }
  }
}

function validateAddress(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`${name} must be a non-negative safe integer.`);
  }
}

/**
 * Immutable CPU terrain data backed by planar quantized-mesh triangles.
 *
 * @alias SceneGISPlanarQuantizedMeshTerrainData
 * @constructor
 *
 * @param {SceneGISPlanarQuantizedMeshTerrainData.ConstructorOptions} options The construction options.
 *
 * @exception {DeveloperError} The quantized vertices, indices, height interval, topology, edges, or metadata are invalid.
 */
function SceneGISPlanarQuantizedMeshTerrainData(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  const vertices = options.quantizedVertices;
  if (
    !(vertices instanceof Uint16Array) ||
    vertices.length === 0 ||
    vertices.length % 3 !== 0
  ) {
    throw new DeveloperError(
      "options.quantizedVertices must be a non-empty Uint16Array containing equal U, V, and height blocks.",
    );
  }
  const vertexCount = vertices.length / 3;
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 3) {
    throw new DeveloperError(
      "The quantized vertex count must be a safe integer of at least three.",
    );
  }
  const indices = options.indices;
  validateIndexArray("options.indices", indices);
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new DeveloperError(
      "options.indices must contain complete surface triangles.",
    );
  }
  if (vertexCount > 65536 && !(indices instanceof Uint32Array)) {
    throw new DeveloperError(
      "Meshes with more than 65536 vertices require Uint32 indices.",
    );
  }
  const quantizedMinimumHeight = options.quantizedMinimumHeight;
  const quantizedMaximumHeight = options.quantizedMaximumHeight;
  if (
    !Number.isFinite(quantizedMinimumHeight) ||
    !Number.isFinite(quantizedMaximumHeight) ||
    !Number.isFinite(quantizedMaximumHeight - quantizedMinimumHeight) ||
    quantizedMaximumHeight < quantizedMinimumHeight
  ) {
    throw new DeveloperError(
      "The quantized height interval must be finite and ordered.",
    );
  }

  const u = vertices.subarray(0, vertexCount);
  const v = vertices.subarray(vertexCount, vertexCount * 2);
  const h = vertices.subarray(vertexCount * 2);
  for (let i = 0; i < vertices.length; ++i) {
    if (vertices[i] > MAX_SHORT) {
      throw new DeveloperError(
        "Every quantized vertex component must be between 0 and 32767.",
      );
    }
  }
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) {
      throw new DeveloperError(
        "Every surface index must identify a quantized vertex.",
      );
    }
    const area =
      (u[i1] - u[i0]) * (v[i2] - v[i0]) - (v[i1] - v[i0]) * (u[i2] - u[i0]);
    if (!Number.isFinite(area) || area <= 0) {
      throw new DeveloperError(
        "Every surface triangle must be nondegenerate and counter-clockwise.",
      );
    }
  }
  validateEdge("options.westIndices", options.westIndices, u, 0, vertexCount);
  validateEdge("options.southIndices", options.southIndices, v, 0, vertexCount);
  validateEdge(
    "options.eastIndices",
    options.eastIndices,
    u,
    MAX_SHORT,
    vertexCount,
  );
  validateEdge(
    "options.northIndices",
    options.northIndices,
    v,
    MAX_SHORT,
    vertexCount,
  );
  const metadata = validateMetadata(options);

  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < vertexCount; ++i) {
    const height = decodeHeight(
      h[i],
      quantizedMinimumHeight,
      quantizedMaximumHeight,
    );
    if (!Number.isFinite(height)) {
      throw new DeveloperError(
        "Every decoded quantized height must be finite.",
      );
    }
    minimumHeight = Math.min(minimumHeight, height);
    maximumHeight = Math.max(maximumHeight, height);
  }

  this._quantizedVertices = vertices;
  this._indices = indices;
  this._westIndices = options.westIndices;
  this._southIndices = options.southIndices;
  this._eastIndices = options.eastIndices;
  this._northIndices = options.northIndices;
  this._quantizedMinimumHeight = quantizedMinimumHeight;
  this._quantizedMaximumHeight = quantizedMaximumHeight;
  this._minimumHeight = minimumHeight;
  this._maximumHeight = maximumHeight;
  this._childTileMask = metadata.childTileMask;
  this._waterMask = options.waterMask;
  this._credits = options.credits;
  this._createdByUpsampling = metadata.createdByUpsampling;
}

Object.defineProperties(SceneGISPlanarQuantizedMeshTerrainData.prototype, {
  /**
   * Gets the minimum decoded surface vertex height in meters.
   * @memberof SceneGISPlanarQuantizedMeshTerrainData.prototype
   * @type {number}
   * @readonly
   */
  minimumHeight: {
    get: function () {
      return this._minimumHeight;
    },
  },
  /**
   * Gets the maximum decoded surface vertex height in meters.
   * @memberof SceneGISPlanarQuantizedMeshTerrainData.prototype
   * @type {number}
   * @readonly
   */
  maximumHeight: {
    get: function () {
      return this._maximumHeight;
    },
  },
  /**
   * Gets the tile-specific credits.
   * @memberof SceneGISPlanarQuantizedMeshTerrainData.prototype
   * @type {Credit[]|undefined}
   * @readonly
   */
  credits: {
    get: function () {
      return this._credits;
    },
  },
  /**
   * Gets the water mask owned by this tile.
   * @memberof SceneGISPlanarQuantizedMeshTerrainData.prototype
   * @type {Uint8Array|undefined}
   * @readonly
   */
  waterMask: {
    get: function () {
      return this._waterMask;
    },
  },
  /**
   * Gets whether this data was created by upsampling.
   * @memberof SceneGISPlanarQuantizedMeshTerrainData.prototype
   * @type {boolean}
   * @readonly
   */
  wasCreatedByUpsampling: {
    get: function () {
      return this._createdByUpsampling;
    },
  },
});

/** @private */
SceneGISPlanarQuantizedMeshTerrainData.prototype._clonePayload = function () {
  const quantizedVertices = new Uint16Array(this._quantizedVertices);
  const indices = new this._indices.constructor(this._indices);
  const westIndices = new this._westIndices.constructor(this._westIndices);
  const southIndices = new this._southIndices.constructor(this._southIndices);
  const eastIndices = new this._eastIndices.constructor(this._eastIndices);
  const northIndices = new this._northIndices.constructor(this._northIndices);
  return {
    quantizedVertices,
    indices,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
    quantizedMinimumHeight: this._quantizedMinimumHeight,
    quantizedMaximumHeight: this._quantizedMaximumHeight,
    transferableObjects: [
      quantizedVertices.buffer,
      indices.buffer,
      westIndices.buffer,
      southIndices.buffer,
      eastIndices.buffer,
      northIndices.buffer,
    ],
  };
};

/** @private */
SceneGISPlanarQuantizedMeshTerrainData.prototype._getMeshMetadata =
  function () {
    return {
      vertexCount: this._quantizedVertices.length / 3,
      surfaceIndexCount: this._indices.length,
      skirtVertexCount:
        this._westIndices.length +
        this._southIndices.length +
        this._eastIndices.length +
        this._northIndices.length,
      skirtIndexCount:
        (Math.max(0, this._westIndices.length - 1) +
          Math.max(0, this._southIndices.length - 1) +
          Math.max(0, this._eastIndices.length - 1) +
          Math.max(0, this._northIndices.length - 1)) *
        6,
    };
  };

/** @private */
SceneGISPlanarQuantizedMeshTerrainData.prototype._createMeshTaskPayload =
  function (extent, effectiveGeometricError, providerMinimumHeight) {
    if (!(extent instanceof SceneGISPlanarExtent)) {
      throw new DeveloperError("extent must be a SceneGISPlanarExtent.");
    }
    if (
      !Number.isFinite(effectiveGeometricError) ||
      effectiveGeometricError < 0 ||
      !Number.isFinite(providerMinimumHeight) ||
      providerMinimumHeight > this._minimumHeight
    ) {
      throw new DeveloperError(
        "Quantized mesh task metadata must be finite and valid.",
      );
    }
    const clone = this._clonePayload();
    return {
      parameters: {
        kind: "createQuantizedMeshMesh",
        ...clone,
        transferableObjects: undefined,
        effectiveGeometricError,
        providerMinimumHeight,
        minimumHeight: this._minimumHeight,
        maximumHeight: this._maximumHeight,
        extent: {
          minimumX: extent.minimumX,
          minimumY: extent.minimumY,
          maximumX: extent.maximumX,
          maximumY: extent.maximumY,
        },
      },
      transferableObjects: clone.transferableObjects,
    };
  };

/** @private */
SceneGISPlanarQuantizedMeshTerrainData.prototype._createUpsampleTaskPayload =
  function (sourceAddress, childAddress) {
    const clone = this._clonePayload();
    return {
      parameters: {
        kind: "upsampleQuantizedMesh",
        ...clone,
        transferableObjects: undefined,
        sourceAddress: {
          x: sourceAddress.x,
          y: sourceAddress.y,
          level: sourceAddress.level,
        },
        childAddress: {
          x: childAddress.x,
          y: childAddress.y,
          level: childAddress.level,
        },
      },
      transferableObjects: clone.transferableObjects,
    };
  };

/**
 * Interpolates the decoded height on the actual quantized surface triangle.
 *
 * @param {SceneGISPlanarExtent} extent The tile extent.
 * @param {number} x The planar X coordinate in meters.
 * @param {number} y The planar Y coordinate in meters.
 * @returns {number|undefined} The interpolated height, or undefined outside the extent or surface.
 * @exception {DeveloperError} The extent or coordinates are invalid.
 */
SceneGISPlanarQuantizedMeshTerrainData.prototype.interpolateHeight = function (
  extent,
  x,
  y,
) {
  if (!(extent instanceof SceneGISPlanarExtent)) {
    throw new DeveloperError("extent must be a SceneGISPlanarExtent.");
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new DeveloperError("x and y must be finite.");
  }
  if (
    x < extent.minimumX ||
    x > extent.maximumX ||
    y < extent.minimumY ||
    y > extent.maximumY
  ) {
    return undefined;
  }
  const queryU = ((x - extent.minimumX) / extent.width) * MAX_SHORT;
  const queryV = ((y - extent.minimumY) / extent.height) * MAX_SHORT;
  const count = this._quantizedVertices.length / 3;
  const u = this._quantizedVertices;
  const v = this._quantizedVertices.subarray(count, count * 2);
  const h = this._quantizedVertices.subarray(count * 2);
  for (let i = 0; i < this._indices.length; i += 3) {
    const i0 = this._indices[i];
    const i1 = this._indices[i + 1];
    const i2 = this._indices[i + 2];
    const denominator =
      (v[i1] - v[i2]) * (u[i0] - u[i2]) + (u[i2] - u[i1]) * (v[i0] - v[i2]);
    const a =
      ((v[i1] - v[i2]) * (queryU - u[i2]) +
        (u[i2] - u[i1]) * (queryV - v[i2])) /
      denominator;
    const b =
      ((v[i2] - v[i0]) * (queryU - u[i2]) +
        (u[i0] - u[i2]) * (queryV - v[i2])) /
      denominator;
    const c = 1.0 - a - b;
    if (a >= -Number.EPSILON && b >= -Number.EPSILON && c >= -Number.EPSILON) {
      const q = a * h[i0] + b * h[i1] + c * h[i2];
      return decodeHeight(
        q,
        this._quantizedMinimumHeight,
        this._quantizedMaximumHeight,
      );
    }
  }
  return undefined;
};

/**
 * Tests direct-child availability using SW=1, SE=2, NW=4, and NE=8.
 *
 * @param {number} thisX This tile's X coordinate.
 * @param {number} thisY This tile's Y coordinate.
 * @param {number} childX The direct child's X coordinate.
 * @param {number} childY The direct child's Y coordinate.
 * @returns {boolean} Whether the direct child is available.
 * @exception {DeveloperError} The addresses do not identify a direct child.
 */
SceneGISPlanarQuantizedMeshTerrainData.prototype.isChildAvailable = function (
  thisX,
  thisY,
  childX,
  childY,
) {
  validateAddress("thisX", thisX);
  validateAddress("thisY", thisY);
  validateAddress("childX", childX);
  validateAddress("childY", childY);
  const west = thisX * 2;
  const north = thisY * 2;
  if (
    !Number.isSafeInteger(west) ||
    !Number.isSafeInteger(north) ||
    (childX !== west && childX !== west + 1) ||
    (childY !== north && childY !== north + 1)
  ) {
    throw new DeveloperError("childX and childY must identify a direct child.");
  }
  const bit =
    childY === north + 1
      ? childX === west + 1
        ? 2
        : 1
      : childX === west + 1
        ? 8
        : 4;
  return (this._childTileMask & bit) !== 0;
};

/**
 * Initialization options for SceneGISPlanarQuantizedMeshTerrainData.
 *
 * @typedef {object} SceneGISPlanarQuantizedMeshTerrainData.ConstructorOptions
 * @property {Uint16Array} quantizedVertices Owned absolute U, V, and height blocks in the range 0 through 32767.
 * @property {Uint16Array|Uint32Array} indices Owned counter-clockwise surface triangle indices.
 * @property {Uint16Array|Uint32Array} westIndices Owned west edge indices.
 * @property {Uint16Array|Uint32Array} southIndices Owned south edge indices.
 * @property {Uint16Array|Uint32Array} eastIndices Owned east edge indices.
 * @property {Uint16Array|Uint32Array} northIndices Owned north edge indices.
 * @property {number} quantizedMinimumHeight Quantized interval minimum in meters.
 * @property {number} quantizedMaximumHeight Quantized interval maximum in meters.
 * @property {number} [childTileMask=15] Direct child availability bits.
 * @property {Uint8Array} [waterMask] Owned water mask metadata.
 * @property {boolean} [createdByUpsampling=false] Whether this data was upsampled.
 * @property {Credit[]} [credits] Tile-specific credits.
 */

export default SceneGISPlanarQuantizedMeshTerrainData;
