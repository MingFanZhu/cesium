import Check from "../../Core/Check.js";
import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import SceneGISPlanarExtent from "./SceneGISPlanarExtent.js";

const defaultStructure = Object.freeze({
  heightScale: 1.0,
  heightOffset: 0.0,
  elementsPerHeight: 1,
  stride: 1,
  elementMultiplier: 256.0,
  isBigEndian: false,
});

function checkFiniteNumber(name, value) {
  Check.typeOf.number(name, value);
  if (!Number.isFinite(value)) {
    throw new DeveloperError(`${name} must be a finite number.`);
  }
}

function checkIntegerAtLeast(name, value, minimum) {
  Check.typeOf.number(name, value);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new DeveloperError(
      `${name} must be a safe integer greater than or equal to ${minimum}.`,
    );
  }
}

function isNumericTypedArray(value) {
  return (
    ArrayBuffer.isView(value) &&
    !(value instanceof DataView) &&
    !(value instanceof BigInt64Array) &&
    !(value instanceof BigUint64Array)
  );
}

function normalizeStructure(structure) {
  structure = structure ?? Frozen.EMPTY_OBJECT;
  Check.typeOf.object("options.structure", structure);

  const result = {
    heightScale: structure.heightScale ?? defaultStructure.heightScale,
    heightOffset: structure.heightOffset ?? defaultStructure.heightOffset,
    elementsPerHeight:
      structure.elementsPerHeight ?? defaultStructure.elementsPerHeight,
    stride: structure.stride ?? defaultStructure.stride,
    elementMultiplier:
      structure.elementMultiplier ?? defaultStructure.elementMultiplier,
    isBigEndian: structure.isBigEndian ?? defaultStructure.isBigEndian,
  };

  checkFiniteNumber("options.structure.heightScale", result.heightScale);
  checkFiniteNumber("options.structure.heightOffset", result.heightOffset);
  checkIntegerAtLeast(
    "options.structure.elementsPerHeight",
    result.elementsPerHeight,
    1,
  );
  checkIntegerAtLeast("options.structure.stride", result.stride, 1);
  if (result.stride < result.elementsPerHeight) {
    throw new DeveloperError(
      "options.structure.stride must cover all elements of a height.",
    );
  }
  checkFiniteNumber(
    "options.structure.elementMultiplier",
    result.elementMultiplier,
  );
  if (result.elementMultiplier <= 0.0) {
    throw new DeveloperError(
      "options.structure.elementMultiplier must be greater than zero.",
    );
  }
  Check.typeOf.bool("options.structure.isBigEndian", result.isBigEndian);

  return Object.freeze(result);
}

function decodeHeight(buffer, structure, sampleIndex) {
  const offset = sampleIndex * structure.stride;
  let encodedHeight = 0.0;

  if (structure.isBigEndian) {
    for (let i = 0; i < structure.elementsPerHeight; ++i) {
      encodedHeight =
        encodedHeight * structure.elementMultiplier + buffer[offset + i];
    }
  } else {
    for (let i = structure.elementsPerHeight - 1; i >= 0; --i) {
      encodedHeight =
        encodedHeight * structure.elementMultiplier + buffer[offset + i];
    }
  }

  return encodedHeight * structure.heightScale + structure.heightOffset;
}

function checkAddress(name, value) {
  checkIntegerAtLeast(name, value, 0);
}

/**
 * Terrain data for one planar tile represented by a rectangular heightmap.
 * Samples are stored row-major from north to south and west to east, including
 * all tile edges. The constructor takes ownership of the input buffer and
 * water mask; callers must not mutate them after successful construction.
 *
 * @alias SceneGISPlanarHeightmapTerrainData
 * @constructor
 *
 * @param {SceneGISPlanarHeightmapTerrainData.ConstructorOptions} options The construction options.
 *
 * @exception {DeveloperError} The buffer is not a non-BigInt numeric TypedArray.
 * @exception {DeveloperError} Width or height is not a safe integer of at least two.
 * @exception {DeveloperError} The structure is invalid or does not fit the buffer.
 * @exception {DeveloperError} A decoded height is not finite.
 * @exception {DeveloperError} The child tile mask or metadata is invalid.
 */
function SceneGISPlanarHeightmapTerrainData(options) {
  options = options ?? Frozen.EMPTY_OBJECT;

  if (!isNumericTypedArray(options.buffer)) {
    throw new DeveloperError(
      "options.buffer must be a non-BigInt numeric TypedArray.",
    );
  }
  checkIntegerAtLeast("options.width", options.width, 2);
  checkIntegerAtLeast("options.height", options.height, 2);

  const structure = normalizeStructure(options.structure);
  const expectedLength = options.width * options.height * structure.stride;
  if (
    !Number.isSafeInteger(expectedLength) ||
    options.buffer.length !== expectedLength
  ) {
    throw new DeveloperError(
      "options.buffer length must equal width * height * structure.stride.",
    );
  }

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
    if (!Array.isArray(options.credits)) {
      throw new DeveloperError(
        "options.credits must be an array of Credit objects.",
      );
    }
    for (let i = 0; i < options.credits.length; ++i) {
      if (!(options.credits[i] instanceof Credit)) {
        throw new DeveloperError(
          "options.credits must be an array of Credit objects.",
        );
      }
    }
  }
  const createdByUpsampling = options.createdByUpsampling ?? false;
  Check.typeOf.bool("options.createdByUpsampling", createdByUpsampling);

  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  const sampleCount = options.width * options.height;
  for (let i = 0; i < sampleCount; ++i) {
    const height = decodeHeight(options.buffer, structure, i);
    if (!Number.isFinite(height)) {
      throw new DeveloperError("Every decoded height must be finite.");
    }
    minimumHeight = Math.min(minimumHeight, height);
    maximumHeight = Math.max(maximumHeight, height);
  }

  this._buffer = options.buffer;
  this._width = options.width;
  this._height = options.height;
  this._structure = structure;
  this._childTileMask = childTileMask;
  this._waterMask = options.waterMask;
  this._credits = options.credits;
  this._createdByUpsampling = createdByUpsampling;
  this._minimumHeight = minimumHeight;
  this._maximumHeight = maximumHeight;
}

Object.defineProperties(SceneGISPlanarHeightmapTerrainData.prototype, {
  /**
   * Gets the sample width.
   * @memberof SceneGISPlanarHeightmapTerrainData.prototype
   * @type {number}
   * @readonly
   */
  width: {
    get: function () {
      return this._width;
    },
  },

  /**
   * Gets the sample height.
   * @memberof SceneGISPlanarHeightmapTerrainData.prototype
   * @type {number}
   * @readonly
   */
  height: {
    get: function () {
      return this._height;
    },
  },

  /**
   * Gets the minimum decoded height in meters.
   * @memberof SceneGISPlanarHeightmapTerrainData.prototype
   * @type {number}
   * @readonly
   */
  minimumHeight: {
    get: function () {
      return this._minimumHeight;
    },
  },

  /**
   * Gets the maximum decoded height in meters.
   * @memberof SceneGISPlanarHeightmapTerrainData.prototype
   * @type {number}
   * @readonly
   */
  maximumHeight: {
    get: function () {
      return this._maximumHeight;
    },
  },

  /**
   * Gets the credits associated with this tile.
   * @memberof SceneGISPlanarHeightmapTerrainData.prototype
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
   * @memberof SceneGISPlanarHeightmapTerrainData.prototype
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
   * @memberof SceneGISPlanarHeightmapTerrainData.prototype
   * @type {boolean}
   * @readonly
   */
  wasCreatedByUpsampling: {
    get: function () {
      return this._createdByUpsampling;
    },
  },
});

/**
 * Gets an exact decoded sample for the SceneGIS planar terrain mesh adapter.
 * This is a private integration seam and does not expose the owned buffer.
 *
 * @param {number} row The validated north-to-south sample row.
 * @param {number} column The validated west-to-east sample column.
 * @returns {number} The decoded height in meters.
 * @private
 */
SceneGISPlanarHeightmapTerrainData.prototype._getSample = function (
  row,
  column,
) {
  if (
    !Number.isInteger(row) ||
    row < 0 ||
    row >= this._height ||
    !Number.isInteger(column) ||
    column < 0 ||
    column >= this._width
  ) {
    throw new DeveloperError("row and column must identify a height sample.");
  }
  return decodeHeight(
    this._buffer,
    this._structure,
    row * this._width + column,
  );
};

/**
 * Creates an owned transferable clone for one planar terrain mesh task.
 * The TerrainData-owned source buffer remains available for query and upsample.
 *
 * @param {SceneGISPlanarExtent} extent The represented tile extent.
 * @param {number} effectiveGeometricError The effective tile error in meters.
 * @param {number} providerMinimumHeight The provider minimum height in meters.
 * @returns {{parameters: object, transferableObjects: ArrayBuffer[]}} The private Worker payload.
 * @private
 */
SceneGISPlanarHeightmapTerrainData.prototype._createMeshTaskPayload = function (
  extent,
  effectiveGeometricError,
  providerMinimumHeight,
) {
  if (!(extent instanceof SceneGISPlanarExtent)) {
    throw new DeveloperError("extent must be a SceneGISPlanarExtent.");
  }
  checkFiniteNumber("effectiveGeometricError", effectiveGeometricError);
  if (effectiveGeometricError < 0.0) {
    throw new DeveloperError("effectiveGeometricError must be non-negative.");
  }
  checkFiniteNumber("providerMinimumHeight", providerMinimumHeight);

  const buffer = new this._buffer.constructor(this._buffer);
  return {
    parameters: {
      kind: "createHeightmapMesh",
      buffer,
      structure: {
        heightScale: this._structure.heightScale,
        heightOffset: this._structure.heightOffset,
        elementsPerHeight: this._structure.elementsPerHeight,
        stride: this._structure.stride,
        elementMultiplier: this._structure.elementMultiplier,
        isBigEndian: this._structure.isBigEndian,
      },
      width: this._width,
      height: this._height,
      minimumHeight: this._minimumHeight,
      maximumHeight: this._maximumHeight,
      effectiveGeometricError,
      providerMinimumHeight,
      extent: {
        minimumX: extent.minimumX,
        minimumY: extent.minimumY,
        maximumX: extent.maximumX,
        maximumY: extent.maximumY,
      },
    },
    transferableObjects: [buffer.buffer],
  };
};

/**
 * Interpolates height on the heightmap's fixed southwest-to-northeast
 * triangle split.
 *
 * @param {SceneGISPlanarExtent} extent The tile extent represented by this data.
 * @param {number} x The X coordinate in meters.
 * @param {number} y The Y coordinate in meters.
 * @returns {number|undefined} The interpolated height in meters, or undefined when the finite position is outside the extent.
 *
 * @exception {DeveloperError} The extent is invalid or X/Y is not finite.
 */
SceneGISPlanarHeightmapTerrainData.prototype.interpolateHeight = function (
  extent,
  x,
  y,
) {
  if (!(extent instanceof SceneGISPlanarExtent)) {
    throw new DeveloperError("extent must be a SceneGISPlanarExtent.");
  }
  checkFiniteNumber("x", x);
  checkFiniteNumber("y", y);
  if (
    x < extent.minimumX ||
    x > extent.maximumX ||
    y < extent.minimumY ||
    y > extent.maximumY
  ) {
    return undefined;
  }

  const fromWest = ((x - extent.minimumX) * (this._width - 1)) / extent.width;
  const fromNorth =
    ((extent.maximumY - y) * (this._height - 1)) / extent.height;
  const west = Math.min(Math.floor(fromWest), this._width - 2);
  const north = Math.min(Math.floor(fromNorth), this._height - 2);
  const dx = fromWest - west;
  const fromSouth = 1.0 - (fromNorth - north);

  const northwest = decodeHeight(
    this._buffer,
    this._structure,
    north * this._width + west,
  );
  const northeast = decodeHeight(
    this._buffer,
    this._structure,
    north * this._width + west + 1,
  );
  const southwest = decodeHeight(
    this._buffer,
    this._structure,
    (north + 1) * this._width + west,
  );
  const southeast = decodeHeight(
    this._buffer,
    this._structure,
    (north + 1) * this._width + west + 1,
  );

  if (fromSouth < dx) {
    return (
      southwest +
      dx * (southeast - southwest) +
      fromSouth * (northeast - southeast)
    );
  }
  return (
    southwest +
    dx * (northeast - northwest) +
    fromSouth * (northwest - southwest)
  );
};

/**
 * Determines whether a direct child tile is available. Child mask bits are
 * southwest 1, southeast 2, northwest 4, and northeast 8.
 *
 * @param {number} thisX The parent tile X coordinate.
 * @param {number} thisY The parent tile Y coordinate.
 * @param {number} childX The direct child tile X coordinate.
 * @param {number} childY The direct child tile Y coordinate.
 * @returns {boolean} True if the child is available; otherwise, false.
 *
 * @exception {DeveloperError} Any address is invalid or is not a direct child.
 */
SceneGISPlanarHeightmapTerrainData.prototype.isChildAvailable = function (
  thisX,
  thisY,
  childX,
  childY,
) {
  checkAddress("thisX", thisX);
  checkAddress("thisY", thisY);
  checkAddress("childX", childX);
  checkAddress("childY", childY);

  const westChild = thisX * 2;
  const northChild = thisY * 2;
  if (
    !Number.isSafeInteger(westChild) ||
    !Number.isSafeInteger(northChild) ||
    (childX !== westChild && childX !== westChild + 1) ||
    (childY !== northChild && childY !== northChild + 1)
  ) {
    throw new DeveloperError(
      "childX and childY must identify a direct child of thisX and thisY.",
    );
  }

  const isEast = childX === westChild + 1;
  const isSouth = childY === northChild + 1;
  const bit = isSouth ? (isEast ? 2 : 1) : isEast ? 8 : 4;
  return (this._childTileMask & bit) !== 0;
};

/**
 * Initialization options for SceneGISPlanarHeightmapTerrainData.
 *
 * @typedef {object} SceneGISPlanarHeightmapTerrainData.ConstructorOptions
 * @property {Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array} buffer The owned numeric height elements.
 * @property {number} width The sample width, at least two.
 * @property {number} height The sample height, at least two.
 * @property {number} [childTileMask=15] Direct child availability bits: southwest 1, southeast 2, northwest 4, northeast 8.
 * @property {Uint8Array} [waterMask] The owned water mask.
 * @property {SceneGISPlanarHeightmapTerrainData.Structure} [structure] The encoded height structure.
 * @property {boolean} [createdByUpsampling=false] Whether the data was created by upsampling.
 * @property {Credit[]} [credits] Credits associated with the tile.
 */

/**
 * Cesium-compatible encoded height structure.
 *
 * @typedef {object} SceneGISPlanarHeightmapTerrainData.Structure
 * @property {number} [heightScale=1.0] Scale applied after decoding.
 * @property {number} [heightOffset=0.0] Offset in meters applied after scaling.
 * @property {number} [elementsPerHeight=1] Number of raw elements per encoded height.
 * @property {number} [stride=1] Number of raw elements between height samples.
 * @property {number} [elementMultiplier=256.0] Positional multiplier for multi-element heights.
 * @property {boolean} [isBigEndian=false] Whether the first raw element is most significant.
 */

export default SceneGISPlanarHeightmapTerrainData;
