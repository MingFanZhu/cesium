import BoundingSphere from "../../../Core/BoundingSphere.js";
import SceneGISGpuParticleSystem from "../SceneGISGpuParticleSystem.js";
import sampling from "../SceneGISWindFieldSampling.js";
import display from "../../../Shaders/SceneGIS/Wind/SceneGISWindDisplay.js";
import update from "../../../Shaders/SceneGIS/Wind/SceneGISWindParticleUpdate.js";
import style from "../../../Shaders/SceneGIS/Wind/SceneGISWindParticleStyle.js";

/** @private */
function createWindParticles(view, field, bounds) {
  // The public particle shader reserves u_sg names for its own state. Explicit
  // GLSL aliases adapt the public wind sampler without changing either protocol.
  const uniforms = {};
  const aliases = [];
  for (const [name, callback] of Object.entries(
    sampling.createUniformMap(field),
  )) {
    const alias = name.replace("u_sgWind", "u_wind");
    uniforms[alias] = callback;
    aliases.push(`#define ${name} ${alias}`);
  }
  const source = [...aliases, sampling.shaderSource].join("\n");
  return new SceneGISGpuParticleSystem({
    maximumParticles: view.particleCount,
    initialParticles: view.particleCount,
    emissionRate: 0,
    boundingSphere: new BoundingSphere(bounds.center, bounds.radius + 11),
    modelMatrix: field.modelMatrix,
    timeSource: () => field.simulationTime,
    simulationShader: [source, update].join("\n"),
    renderShader: [source, display, style].join("\n"),
    uniformMap: {
      ...uniforms,
      u_windTimeStep: () => view._simulation.timeStep,
      u_windParticleSize: () => view.particleSize,
      u_windParticleOpacity: () => view.particleOpacity,
      u_colorMaximum: () => view.colorMaximum,
      u_colorConcentration: () => view.colorBy === "concentration",
    },
  });
}
export default createWindParticles;
