import Cartesian3 from "../../../Core/Cartesian3.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import WebGLConstants from "../../../Core/WebGLConstants.js";
import Sync from "../../../Renderer/Sync.js";

/**
 * Snapshot one cell through existing native PBO/fence resources.
 * @private
 */
function SceneGISWindQuery(simulation, cell) {
  const solver = simulation._solver,
    tracer = simulation._tracer,
    c = simulation._config;
  const x = cell.x + (cell.z % solver.columns) * c.dimensions.x;
  const y = cell.y + Math.floor(cell.z / solver.columns) * c.dimensions.y;
  const buffers = [];
  let fence,
    timer,
    done = false;
  const version = simulation._version,
    time = simulation.simulationTime;
  let rejectPromise;
  function cleanup() {
    done = true;
    clearTimeout(timer);
    fence?.destroy();
    buffers.forEach((b) => b.destroy());
    simulation._queries.delete(query);
  }
  const query = {
    cancel() {
      if (!done) {
        cleanup();
        rejectPromise(
          new RuntimeError("Wind simulation destroyed during sampleAsync."),
        );
      }
    },
  };
  simulation._queries.add(query);
  return new Promise((resolve, reject) => {
    rejectPromise = reject;
    try {
      for (const framebuffer of [solver.macros, tracer.buffers[tracer.index]]) {
        buffers.push(
          solver.context.readPixelsToPBO({
            x,
            y,
            width: 1,
            height: 1,
            framebuffer,
          }),
        );
      }
      fence = new Sync({ context: solver.context });
      const deadline = performance.now() + 5000;
      const poll = () => {
        if (done) {
          return;
        }
        try {
          if (fence.getStatus() === WebGLConstants.SIGNALED) {
            const v = new Float32Array(4),
              t = new Float32Array(4);
            buffers[0].getBufferData(v);
            buffers[1].getBufferData(t);
            const solid =
              c.solidMask[
                cell.x + c.dimensions.x * (cell.y + c.dimensions.y * cell.z)
              ] === 1;
            cleanup();
            resolve({
              velocity: new Cartesian3(v[0], v[1], v[2]),
              density: v[3],
              concentration: t[0],
              tracerCfl: t[1],
              solid,
              cell,
              version,
              simulationTime: time,
            });
          } else if (performance.now() >= deadline) {
            cleanup();
            reject(new RuntimeError("Wind sample GPU fence timed out."));
          } else {
            timer = setTimeout(poll, 16);
          }
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      timer = setTimeout(poll, 0);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
export default SceneGISWindQuery;
