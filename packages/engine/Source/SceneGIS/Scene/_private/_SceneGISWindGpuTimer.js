import destroyObject from "../../../Core/destroyObject.js";

/**
 * Optional nonblocking instrumentation only. Numerical commands remain native Renderer commands.
 * WebGL2 has no Renderer timer wrapper; this owns only EXT timer query objects.
 * @private
 */
function SceneGISWindGpuTimer(context) {
  this.gl = context._gl;
  this.extension = this.gl.getExtension("EXT_disjoint_timer_query_webgl2");
  this.supported = !!this.extension;
  this.pending = [];
  this.current = undefined;
  this.result = undefined;
}
SceneGISWindGpuTimer.prototype.poll = function () {
  if (!this.supported) {
    return;
  }
  const gl = this.gl,
    ext = this.extension;
  if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
    this.clear();
    return;
  }
  while (
    this.pending.length &&
    gl.getQueryParameter(this.pending[0].query, gl.QUERY_RESULT_AVAILABLE)
  ) {
    const sample = this.pending.shift();
    const milliseconds =
      gl.getQueryParameter(sample.query, gl.QUERY_RESULT) / 1e6;
    gl.deleteQuery(sample.query);
    this.result = Object.freeze({
      millisecondsPerStep: milliseconds / sample.steps,
      steps: sample.steps,
      version: sample.version,
    });
  }
};
SceneGISWindGpuTimer.prototype.begin = function () {
  if (!this.supported || this.pending.length >= 4) {
    return;
  }
  const gl = this.gl,
    ext = this.extension;
  if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
    return;
  }
  this.current = gl.createQuery();
  gl.beginQuery(ext.TIME_ELAPSED_EXT, this.current);
};
SceneGISWindGpuTimer.prototype.end = function (steps, version) {
  if (!this.current) {
    return;
  }
  this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
  if (steps > 0) {
    this.pending.push({ query: this.current, steps, version });
  } else {
    this.gl.deleteQuery(this.current);
  }
  this.current = undefined;
};
SceneGISWindGpuTimer.prototype.clear = function () {
  if (this.current) {
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.gl.deleteQuery(this.current);
    this.current = undefined;
  }
  for (const p of this.pending) {
    this.gl.deleteQuery(p.query);
  }
  this.pending.length = 0;
  this.result = undefined;
};
SceneGISWindGpuTimer.prototype.isDestroyed = function () {
  return false;
};
SceneGISWindGpuTimer.prototype.destroy = function () {
  this.clear();
  return destroyObject(this);
};
export default SceneGISWindGpuTimer;
