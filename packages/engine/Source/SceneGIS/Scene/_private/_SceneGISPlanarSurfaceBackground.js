import DeveloperError from "../../../Core/DeveloperError.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";

/** Captures only the background preceding primary surface rendering. @private */
function SceneGISPlanarSurfaceBackground() {
  this._framebuffer = new FramebufferManager();
}

SceneGISPlanarSurfaceBackground.prototype.capture = function (
  frameState,
  passState,
) {
  const context = frameState.context;
  if (!context.webgl2) {
    throw new DeveloperError("Planar surface opacity requires WebGL 2.");
  }
  const hdr = frameState.camera._scene.highDynamicRange;
  const datatype = hdr
    ? context.halfFloatingPointTexture
      ? PixelDatatype.HALF_FLOAT
      : PixelDatatype.FLOAT
    : PixelDatatype.UNSIGNED_BYTE;
  const width = context.drawingBufferWidth;
  const height = context.drawingBufferHeight;
  this._framebuffer.update(context, width, height, 1, datatype);
  const gl = context._gl;
  const previous = context._currentFramebuffer;
  try {
    if (passState.framebuffer) {
      passState.framebuffer.bindRead();
    } else {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    }
    this._framebuffer.framebuffer.bindDraw();
    // Resolve MSAA as needed; no map, terrain, vector or object colors exist yet.
    gl.blitFramebuffer(
      0,
      0,
      width,
      height,
      0,
      0,
      width,
      height,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
  } finally {
    if (previous) {
      previous._bind();
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }
};

SceneGISPlanarSurfaceBackground.prototype.getTexture = function () {
  return this._framebuffer.getColorTexture();
};

SceneGISPlanarSurfaceBackground.prototype.destroy = function () {
  this._framebuffer.destroy();
};

export default SceneGISPlanarSurfaceBackground;
