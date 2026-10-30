import Check from "../../Core/Check.js";
import defined from "../../Core/defined.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";

function checkFiniteNumber(name, value) {
  Check.typeOf.number(name, value);
  if (!Number.isFinite(value)) {
    throw new DeveloperError(`${name} must be a finite number.`);
  }
}

/**
 * 平面世界坐标系中的只读二维范围。
 *
 * @alias SceneGISPlanarExtent
 * @constructor
 *
 * @param {object} options 包含以下属性的对象：
 * @param {number} options.minimumX 最小 X 坐标，单位为米。
 * @param {number} options.minimumY 最小 Y 坐标，单位为米。
 * @param {number} options.maximumX 最大 X 坐标，单位为米。
 * @param {number} options.maximumY 最大 Y 坐标，单位为米。
 *
 * @exception {DeveloperError} 任一边界不是有限数。
 * @exception {DeveloperError} <code>maximumX</code> 不大于 <code>minimumX</code>。
 * @exception {DeveloperError} <code>maximumY</code> 不大于 <code>minimumY</code>。
 * @exception {DeveloperError} 计算出的宽或高非有限值。
 */
function SceneGISPlanarExtent(options) {
  options = options ?? Frozen.EMPTY_OBJECT;

  checkFiniteNumber("options.minimumX", options.minimumX);
  checkFiniteNumber("options.minimumY", options.minimumY);
  checkFiniteNumber("options.maximumX", options.maximumX);
  checkFiniteNumber("options.maximumY", options.maximumY);

  if (options.maximumX <= options.minimumX) {
    throw new DeveloperError(
      "options.maximumX must be greater than options.minimumX.",
    );
  }
  if (options.maximumY <= options.minimumY) {
    throw new DeveloperError(
      "options.maximumY must be greater than options.minimumY.",
    );
  }

  const width = options.maximumX - options.minimumX;
  const height = options.maximumY - options.minimumY;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new DeveloperError("The extent width and height must be finite.");
  }

  this._minimumX = options.minimumX;
  this._minimumY = options.minimumY;
  this._maximumX = options.maximumX;
  this._maximumY = options.maximumY;
}

Object.defineProperties(SceneGISPlanarExtent.prototype, {
  /**
   * 获取最小 X 坐标，单位为米。
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  minimumX: {
    get: function () {
      return this._minimumX;
    },
  },

  /**
   * 获取最小 Y 坐标，单位为米。
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  minimumY: {
    get: function () {
      return this._minimumY;
    },
  },

  /**
   * 获取最大 X 坐标，单位为米。
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  maximumX: {
    get: function () {
      return this._maximumX;
    },
  },

  /**
   * 获取最大 Y 坐标，单位为米。
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  maximumY: {
    get: function () {
      return this._maximumY;
    },
  },

  /**
   * 获取宽度，单位为米。
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  width: {
    get: function () {
      return this._maximumX - this._minimumX;
    },
  },

  /**
   * 获取高度，单位为米。
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  height: {
    get: function () {
      return this._maximumY - this._minimumY;
    },
  },
});

/**
 * 复制范围。
 *
 * @param {SceneGISPlanarExtent} extent 要复制的范围。
 * @returns {SceneGISPlanarExtent|undefined} 新的范围；输入未定义时返回 <code>undefined</code>。
 */
SceneGISPlanarExtent.clone = function (extent) {
  if (!defined(extent)) {
    return undefined;
  }

  return new SceneGISPlanarExtent({
    minimumX: extent.minimumX,
    minimumY: extent.minimumY,
    maximumX: extent.maximumX,
    maximumY: extent.maximumY,
  });
};

/**
 * 精确比较两个范围是否相等。
 *
 * @param {SceneGISPlanarExtent} [left] 第一个范围。
 * @param {SceneGISPlanarExtent} [right] 第二个范围。
 * @returns {boolean} 两个范围相等时为 <code>true</code>，否则为 <code>false</code>。
 */
SceneGISPlanarExtent.equals = function (left, right) {
  return (
    left === right ||
    (defined(left) &&
      defined(right) &&
      left.minimumX === right.minimumX &&
      left.minimumY === right.minimumY &&
      left.maximumX === right.maximumX &&
      left.maximumY === right.maximumY)
  );
};

/**
 * 判断平面位置是否位于范围内，四条边界均包含。若位置具有 Z 坐标，则忽略该分量。
 *
 * @param {SceneGISPlanarExtent} extent 要测试的范围。
 * @param {Cartesian2|Cartesian3} position 要测试的平面位置。
 * @returns {boolean} 位置在范围内时为 <code>true</code>，否则为 <code>false</code>。
 *
 * @exception {DeveloperError} <code>extent</code> 不是 SceneGISPlanarExtent。
 * @exception {DeveloperError} 位置不具有有限 X、Y 坐标。
 */
SceneGISPlanarExtent.contains = function (extent, position) {
  if (!(extent instanceof SceneGISPlanarExtent)) {
    throw new DeveloperError("extent must be a SceneGISPlanarExtent.");
  }
  Check.typeOf.object("position", position);
  checkFiniteNumber("position.x", position.x);
  checkFiniteNumber("position.y", position.y);

  return (
    position.x >= extent.minimumX &&
    position.x <= extent.maximumX &&
    position.y >= extent.minimumY &&
    position.y <= extent.maximumY
  );
};

export default SceneGISPlanarExtent;
