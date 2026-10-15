import destroyObject from "../../Core/destroyObject.js";
import PixelFormat from "../../Core/PixelFormat.js";
import Framebuffer from "../../Renderer/Framebuffer.js";
import PixelDatatype from "../../Renderer/PixelDatatype.js";

/** RGBA16F material layers with one sampler and borrowed framebuffer views. @private */
class _SceneGISMaterialArray {
  constructor(layers) {
    this._colorAttachmentsLength = layers;
    this._views = [];
  }

  update(context, width, height) {
    if (this.texture?.width === width && this.texture.height === height) {
      return;
    }
    this._release();
    const gl = context._gl;
    const target = gl.TEXTURE_2D_ARRAY;
    const handle = gl.createTexture();
    const layers = this._colorAttachmentsLength;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(target, handle);
    gl.texStorage3D(target, 1, gl.RGBA16F, width, height, layers);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(target, null);
    const texture = (this.texture = {
      _target: target,
      _texture: handle,
      width,
      height,
      sizeInBytes: width * height * layers * 8,
      _destroyed: false,
      isDestroyed() {
        return this._destroyed;
      },
    });
    this._gl = gl;
    this._views = Array.from({ length: layers }, (_, layer) => ({
      _target: target,
      _texture: handle,
      _sceneGISArrayLayer: layer,
      width,
      height,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      isDestroyed: () => texture._destroyed,
      // Layer views borrow storage, like native cube-map attachment faces.
      destroy() {},
    }));
    this.framebuffer = new Framebuffer({
      context,
      colorTextures: this._views,
      destroyAttachments: false,
    });
  }

  getColorTexture(index = 0) {
    return this._views[index];
  }

  clear(context, command, passState) {
    const original = command.framebuffer;
    try {
      command.framebuffer = this.framebuffer;
      command.execute(context, passState);
    } finally {
      command.framebuffer = original;
    }
  }

  _release() {
    this.framebuffer?.destroy();
    this.framebuffer = undefined;
    if (this.texture) {
      this._gl.deleteTexture(this.texture._texture);
      this.texture._destroyed = true;
      this.texture = undefined;
    }
    this._views.length = 0;
  }

  isDestroyed() {
    return false;
  }

  destroy() {
    this._release();
    return destroyObject(this);
  }
}

export default _SceneGISMaterialArray;
