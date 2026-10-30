import Credit from "../../Core/Credit.js";
import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import Matrix3 from "../../Core/Matrix3.js";
import CubeMapPanorama from "../../Scene/CubeMapPanorama.js";

const faceNames = [
  "positiveX",
  "negativeX",
  "positiveY",
  "negativeY",
  "positiveZ",
  "negativeZ",
];

function validateSources(sources) {
  if (!defined(sources) || typeof sources !== "object") {
    throw new DeveloperError(
      "options.sources must define six preloaded cube-map faces.",
    );
  }

  let sourceConstructor;
  let faceSize;
  for (let i = 0; i < faceNames.length; i++) {
    const source = sources[faceNames[i]];
    if (!defined(source) || typeof source !== "object") {
      throw new DeveloperError(
        "options.sources must define six non-URL preloaded cube-map faces.",
      );
    }
    const width = source.width ?? source.naturalWidth;
    const height = source.height ?? source.naturalHeight;
    if (
      !Number.isFinite(width) ||
      width <= 0 ||
      !Number.isFinite(height) ||
      height <= 0
    ) {
      throw new DeveloperError(
        "options.sources cube-map faces must be preloaded image or canvas-like objects.",
      );
    }
    if (width !== height) {
      throw new DeveloperError(
        "options.sources cube-map faces must be square and have identical dimensions.",
      );
    }
    const constructor = source.constructor;
    if (i === 0) {
      sourceConstructor = constructor;
      faceSize = width;
    } else if (constructor !== sourceConstructor) {
      throw new DeveloperError(
        "options.sources cube-map faces must all have the same type.",
      );
    } else if (width !== faceSize) {
      throw new DeveloperError(
        "options.sources cube-map faces must be square and have identical dimensions.",
      );
    }
  }
}

/**
 * 调用方所有的平面世界固定轴立方体天空盒。各面方向为 positiveX 向东、positiveY 向北、positiveZ 向上。源必须预先加载，构造后不可变。
 *
 * @alias SceneGISPlanarSkyBox
 * @constructor
 *
 * @param {object} options 包含以下属性的对象：
 * @param {object} options.sources 六个同类型、相同正方形尺寸、已预加载且非 URL 的立方体贴图面。
 * @param {Credit|string} [options.credit] 天空盒绘制时显示的署名。
 *
 * @exception {DeveloperError} 未提供六个同类型、相同正方形尺寸、已预加载且非 URL 的面。
 * @exception {DeveloperError} options.credit 不是 Credit 或字符串。
 */
function SceneGISPlanarSkyBox(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  validateSources(options.sources);
  if (
    defined(options.credit) &&
    typeof options.credit !== "string" &&
    !(options.credit instanceof Credit)
  ) {
    throw new DeveloperError("options.credit must be a Credit or string.");
  }

  const sources = {};
  for (let i = 0; i < faceNames.length; i++) {
    const faceName = faceNames[i];
    sources[faceName] = options.sources[faceName];
  }
  Object.freeze(sources);
  this._sources = sources;
  this._panorama = new CubeMapPanorama({
    sources,
    transform: Matrix3.IDENTITY,
    returnCommand: true,
    credit: options.credit,
  });
}

Object.defineProperties(SceneGISPlanarSkyBox.prototype, {
  /**
   * 获取不可变的预加载面集合。
   *
   * @memberof SceneGISPlanarSkyBox.prototype
   * @type {object}
   * @readonly
   */
  sources: {
    get: function () {
      return this._sources;
    },
  },

  /**
   * 获取可选署名。
   *
   * @memberof SceneGISPlanarSkyBox.prototype
   * @type {Credit|undefined}
   * @readonly
   */
  credit: {
    get: function () {
      return this._panorama.credit;
    },
  },
});

SceneGISPlanarSkyBox.prototype._update = function (frameState, useHdr) {
  const command = this._panorama.update(frameState, useHdr);
  if (defined(command) && defined(this._panorama.credit)) {
    frameState.creditDisplay.addCreditToNextFrame(this._panorama.credit);
  }
  return command;
};

/**
 * 此对象已销毁时返回 true，否则返回 false。
 *
 * @returns {boolean} 此对象已销毁时为 true，否则为 false。
 */
SceneGISPlanarSkyBox.prototype.isDestroyed = function () {
  return false;
};

/**
 * 销毁此天空盒自有的立方体贴图资源。
 *
 * @returns {undefined}
 */
SceneGISPlanarSkyBox.prototype.destroy = function () {
  this._panorama = this._panorama && this._panorama.destroy();
  return destroyObject(this);
};

export default SceneGISPlanarSkyBox;
