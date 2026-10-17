import PostProcessStage from "../../../Scene/PostProcessStage.js";
import shader from "../../../Shaders/SceneGIS/Rendering/SceneGISAgXTonemapping.js";

/**
 * Create AgX for the collection-owned HDR display slot.
 * @param {boolean} useAutoExposure Use the existing exposure divisor texture.
 * @returns {PostProcessStage} The collection owns and configures this stage.
 * @private
 */
function _SceneGISAgXTonemapping(useAutoExposure) {
  return new PostProcessStage({
    name: "sceneGIS_agx",
    fragmentShader: `${useAutoExposure ? "#define AUTO_EXPOSURE\n" : ""}${shader}`,
    uniforms: {
      autoExposure: undefined,
      exposure: 1.0,
    },
  });
}

export default _SceneGISAgXTonemapping;
