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
 * A caller-owned fixed-axis cube-map sky box for a planar SceneGIS world.
 * Face directions are positiveX east, positiveY north, and positiveZ up.
 * Sources must already be loaded and are immutable after construction.
 *
 * @alias SceneGISPlanarSkyBox
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {object} options.sources Six same-type, identically sized square, preloaded, non-URL cube-map faces.
 * @param {Credit|string} [options.credit] Credit displayed while the sky box is rendered.
 *
 * @exception {DeveloperError} Six same-type, identically sized square, preloaded non-URL faces are not supplied.
 * @exception {DeveloperError} options.credit is not a Credit or string.
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
   * Gets the immutable preloaded face collection.
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
   * Gets the optional credit.
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
 * Returns true if this object was destroyed; otherwise, false.
 *
 * @returns {boolean} True if this object was destroyed; otherwise, false.
 */
SceneGISPlanarSkyBox.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the cube-map resources owned by this sky box.
 *
 * @returns {undefined}
 */
SceneGISPlanarSkyBox.prototype.destroy = function () {
  this._panorama = this._panorama && this._panorama.destroy();
  return destroyObject(this);
};

export default SceneGISPlanarSkyBox;
