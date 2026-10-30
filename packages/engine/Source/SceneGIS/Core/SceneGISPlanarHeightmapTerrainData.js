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
 * 以矩形高度图表示的单个平面地形瓦片数据。样本按从北到南、从西到东的行主序存储，包含全部瓦片边界。构造函数接管输入缓冲和水面掩码，成功构造后调用方不得修改它们。
 *
 * @alias SceneGISPlanarHeightmapTerrainData
 * @constructor
 *
 * @param {SceneGISPlanarHeightmapTerrainData.ConstructorOptions} options 构造选项。
 *
 * @exception {DeveloperError} buffer 不是非 BigInt 的数值 TypedArray。
 * @exception {DeveloperError} 宽或高不是至少为 2 的安全整数。
 * @exception {DeveloperError} 编码结构无效或不适合缓冲区。
 * @exception {DeveloperError} 解码高度非有限值。
 * @exception {DeveloperError} 子瓦片掩码或元数据无效。
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
   * 获取采样宽度。
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
   * 获取采样高度。
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
   * 获取最小解码高度，单位为米。
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
   * 获取最大解码高度，单位为米。
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
   * 获取与此瓦片关联的署名。
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
   * 获取此瓦片所有的水面掩码。
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
   * 获取数据是否由上采样创建。
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
 * 按高度图固定的西南到东北三角形对角线拆分进行高度插值。
 *
 * @param {SceneGISPlanarExtent} extent 此数据表示的瓦片范围。
 * @param {number} x X 坐标，单位为米。
 * @param {number} y Y 坐标，单位为米。
 * @returns {number|undefined} 插值高度，单位为米；有限位置在范围外时返回 undefined。
 *
 * @exception {DeveloperError} 范围无效，或 X/Y 非有限值。
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
 * 判断直接子瓦片是否可用。子掩码位为西南 1、东南 2、西北 4、东北 8。
 *
 * @param {number} thisX 父瓦片的 X 坐标。
 * @param {number} thisY 父瓦片的 Y 坐标。
 * @param {number} childX 直接子瓦片的 X 坐标。
 * @param {number} childY 直接子瓦片的 Y 坐标。
 * @returns {boolean} 子瓦片可用时为 true，否则为 false。
 *
 * @exception {DeveloperError} 任一地址无效或不是直接子瓦片。
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
 * SceneGISPlanarHeightmapTerrainData 的初始化选项。
 *
 * @typedef {object} SceneGISPlanarHeightmapTerrainData.ConstructorOptions
 * @property {Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array} buffer 自有数值高度元素。
 * @property {number} width 采样宽度，至少为 2。
 * @property {number} height 采样高度，至少为 2。
 * @property {number} [childTileMask=15] 直接子瓦片可用位：西南 1、东南 2、西北 4、东北 8。
 * @property {Uint8Array} [waterMask] 自有水面掩码。
 * @property {SceneGISPlanarHeightmapTerrainData.Structure} [structure] 高度编码结构。
 * @property {boolean} [createdByUpsampling=false] 数据是否由上采样创建。
 * @property {Credit[]} [credits] 与瓦片关联的署名。
 */

/**
 * 与 Cesium 兼容的高度编码结构。
 *
 * @typedef {object} SceneGISPlanarHeightmapTerrainData.Structure
 * @property {number} [heightScale=1.0] 解码后应用的倍率。
 * @property {number} [heightOffset=0.0] 缩放后应用的偏移，单位为米。
 * @property {number} [elementsPerHeight=1] 每个编码高度包含的原始元素数。
 * @property {number} [stride=1] 相邻高度样本之间的原始元素步长。
 * @property {number} [elementMultiplier=256.0] 多元素高度编码的位权倍率。
 * @property {boolean} [isBigEndian=false] 首个原始元素是否为最高有效位。
 */

export default SceneGISPlanarHeightmapTerrainData;
