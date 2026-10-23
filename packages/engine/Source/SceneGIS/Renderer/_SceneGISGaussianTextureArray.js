import DeveloperError from "../../Core/DeveloperError.js";
import destroyObject from "../../Core/destroyObject.js";

/** RGBA32UI storage for immutable Gaussian Core/SH pages. @private */
class _SceneGISGaussianTextureArray {
  constructor({ context, width, height, layers }) {
    const gl = context._gl;
    if (!context.webgl2) {
      throw new DeveloperError("Gaussian texture arrays require WebGL2.");
    }
    const maximumSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maximumLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
    if (
      ![width, height, layers].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) ||
      width > maximumSize ||
      height > maximumSize ||
      layers > maximumLayers
    ) {
      throw new DeveloperError(
        "Gaussian texture array dimensions exceed device limits.",
      );
    }
    this.width = width;
    this.height = height;
    this.layers = layers;
    this.sizeInBytes = width * height * layers * 16;
    this._gl = gl;
    this._target = gl.TEXTURE_2D_ARRAY;
    this._texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(this._target, this._texture);
    try {
      gl.texStorage3D(this._target, 1, gl.RGBA32UI, width, height, layers);
      gl.texParameteri(this._target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(this._target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(this._target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(this._target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch (error) {
      gl.deleteTexture(this._texture);
      throw error;
    } finally {
      gl.bindTexture(this._target, null);
    }
  }

  copyFrom({ source, xOffset = 0, yOffset = 0, layerOffset = 0 }) {
    const { width, height, layers, arrayBufferView } = source;
    if (
      ![xOffset, yOffset, layerOffset].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ) ||
      ![width, height, layers].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) ||
      xOffset + width > this.width ||
      yOffset + height > this.height ||
      layerOffset + layers > this.layers ||
      !(arrayBufferView instanceof Uint32Array) ||
      arrayBufferView.length !== width * height * layers * 4
    ) {
      throw new DeveloperError(
        "Gaussian texture array upload range is invalid.",
      );
    }
    const gl = this._gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(this._target, this._texture);
    try {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texSubImage3D(
        this._target,
        0,
        xOffset,
        yOffset,
        layerOffset,
        width,
        height,
        layers,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_INT,
        arrayBufferView,
      );
    } finally {
      gl.bindTexture(this._target, null);
    }
  }

  isDestroyed() {
    return false;
  }

  destroy() {
    this._gl.deleteTexture(this._texture);
    return destroyObject(this);
  }
}

export default _SceneGISGaussianTextureArray;
