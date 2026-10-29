/* global window, document, performance, setTimeout */

window.CESIUM_BASE_URL = "/Build/CesiumUnminified/";
const C = await import("/Build/CesiumUnminified/index.js");
const context = new C.Context(document.querySelector("canvas"));
const gl = context._gl;
const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
const debug = gl.getExtension("WEBGL_debug_renderer_info");
const result = {
  renderer: debug
    ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER),
  cases: [],
};
let solver, query;
function cleanup() {
  if (solver && !solver.isDestroyed()) {
    solver.destroy();
  }
  if (!context.isDestroyed()) {
    if (query) {
      gl.deleteQuery(query);
    }
    context.destroy();
  }
}
window.addEventListener("pagehide", (e) => {
  if (!e.persisted) {
    cleanup();
  }
});
try {
  for (const dimensions of [
    [32, 32, 16],
    [128, 128, 32],
  ]) {
    const config = C._SceneGISWindModel.configure({
      dimensions: new C.Cartesian3(...dimensions),
      boundaryConditions: {
        xMin: "periodic",
        xMax: "periodic",
        yMin: "periodic",
        yMax: "periodic",
        zMin: "periodic",
        zMax: "periodic",
      },
    });
    solver = new C._SceneGISWindSolver(context, config);
    solver.step();
    const samples = [];
    for (let i = 0; i < 5; i++) {
      query = timer ? gl.createQuery() : undefined;
      if (query) {
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      }
      const start = performance.now();
      solver.step();
      const cpuMs = performance.now() - start;
      if (query) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
      }
      gl.flush();
      if (query) {
        while (
          !context.isDestroyed() &&
          !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
        ) {
          await new Promise((r) => setTimeout(r, 10));
        }
      }
      if (context.isDestroyed()) {
        break;
      }
      samples.push({
        cpuMs,
        gpuMs:
          query && !gl.getParameter(timer.GPU_DISJOINT_EXT)
            ? gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6
            : null,
      });
      if (query) {
        gl.deleteQuery(query);
      }
      query = undefined;
    }
    result.cases.push({
      dimensions,
      cells: config.count,
      atlas: [solver.width, solver.height],
      bytes: solver.byteLength,
      drawsPerStep: 3,
      timeStep: config.timeStep,
      samples,
    });
    solver.destroy();
    solver = undefined;
  }
} catch (error) {
  result.error = error.stack;
} finally {
  cleanup();
}
window.result = result;
document.querySelector("#result").textContent = JSON.stringify(result, null, 2);
