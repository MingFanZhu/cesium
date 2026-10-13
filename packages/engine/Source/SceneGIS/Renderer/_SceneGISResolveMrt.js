/** Resolve selected color attachments and depth without leaving native GL caches stale. @private */
function _SceneGISResolveMrt(
  context,
  source,
  target,
  width,
  height,
  colorCount,
) {
  const gl = context._gl;
  const drawBuffers = new Array(target.numberOfColorAttachments).fill(gl.NONE);
  source.bindRead();
  target.bindDraw();
  try {
    for (let i = 0; i < colorCount; ++i) {
      gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
      drawBuffers[i] = gl.COLOR_ATTACHMENT0 + i;
      gl.drawBuffers(drawBuffers);
      gl.blitFramebuffer(
        0,
        0,
        width,
        height,
        0,
        0,
        width,
        height,
        gl.COLOR_BUFFER_BIT | (i === 0 ? gl.DEPTH_BUFFER_BIT : 0),
        gl.NEAREST,
      );
      drawBuffers[i] = gl.NONE;
    }
  } finally {
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.drawBuffers(target._getActiveColorAttachments());
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    context._currentFramebuffer = undefined;
  }
}
export default _SceneGISResolveMrt;
