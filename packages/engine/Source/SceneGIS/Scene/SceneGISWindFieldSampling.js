import DeveloperError from "../../Core/DeveloperError.js";
import shaderSource from "../../Shaders/SceneGIS/Wind/SceneGISWindSampling.js";

/**
 * Public GPU consumer adapter for cell-centered wind atlases. Append shaderSource to a GLSL shader
 * and merge createUniformMap(field) into native sampler callbacks. Functions use simulation-local
 * meters: sceneGISWindInside, sceneGISWindSolid, sceneGISWindSample (vec4 velocity m/s + tracer).
 * Trilinear interpolation omits solid corners and renormalizes weights; samples inside solid or
 * outside domain return zero. This is a display sampler, not a conservative transport operator.
 * Resolve live field getters each draw. Never destroy borrowed textures; destroy consumers first.
 * @namespace SceneGISWindFieldSampling
 */
const SceneGISWindFieldSampling = {
  /**
   * GLSL declarations and sampling functions, using the u_sgWind prefix.
   * @type {string}
   * @readonly
   */
  shaderSource,
  /**
   * @param {SceneGISWindSimulation.GpuField} field Ready borrowed GPU descriptor.
   * @returns {object} Uniform callbacks; do not replace their texture ownership.
   */
  createUniformMap(field) {
    if (!field) {
      throw new DeveloperError("A ready wind GPU field is required.");
    }
    return {
      u_sgWindVelocity: () => field.velocityTexture,
      u_sgWindSolid: () => field.solidTexture,
      u_sgWindTracer: () => field.concentrationTexture,
      u_sgWindDimensions: () => field.dimensions,
      u_sgWindMinimum: () => field.minimum,
      u_sgWindCellSize: () => field.cellSize,
      u_sgWindColumns: () => field.atlasColumns,
    };
  },
};
export default SceneGISWindFieldSampling;
