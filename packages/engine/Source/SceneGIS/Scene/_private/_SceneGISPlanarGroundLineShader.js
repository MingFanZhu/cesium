import areaFragmentShaderSource from "../../../Shaders/SceneGIS/PlanarGround/SceneGISPlanarGroundAreaFS.js";
import areaVertexShaderSource from "../../../Shaders/SceneGIS/PlanarGround/SceneGISPlanarGroundAreaVS.js";
import fragmentShaderSource from "../../../Shaders/SceneGIS/PlanarGround/SceneGISPlanarGroundLineFS.js";
import vertexShaderSource from "../../../Shaders/SceneGIS/PlanarGround/SceneGISPlanarGroundLineVS.js";

/**
 * Shader sources for eye-space expansion of stable planar ground-line segment
 * volumes.
 *
 * The segment/end-plane role follows the algorithmic structure of Cesium's
 * GroundPolylinePrimitive and PolylineShadowVolume shaders at upstream
 * baseline 6d5d8b1f0725b6f831b336463f4b11c98023427b. Recheck those sources
 * when their eye-space width convention, globe-depth copy/reconstruction,
 * or terrain-classification pass changes. Fragment clipping uses the current
 * surface position, keeping color and picking in a shared VA draw.
 * This shader contains no ellipsoid, map projection, or terrain-tile
 * dependency.
 * Area extent planes and fragment culling follow ShadowVolumeAppearanceVS/FS
 * at the same baseline; stencil retains the exact polygon footprint.
 *
 * @private
 */
const SceneGISPlanarGroundLineShader = {
  areaVertexShaderSource,
  areaFragmentShaderSource,
  vertexShaderSource,
  fragmentShaderSource,
};

export default SceneGISPlanarGroundLineShader;
