import defined from "../../Core/defined.js";
import ShaderDestination from "../../Renderer/ShaderDestination.js";
import LightingStageFS from "../../Shaders/Model/LightingStageFS.js";
import LightingModel from "./LightingModel.js";
// SCENEGIS_PATCH_BEGIN SGP-0010: Bind the optional current-frame physical lighting source.
import SceneGISModelEnvironmentLighting from "../../SceneGIS/Scene/_private/_SceneGISModelEnvironmentLighting.js";
// SCENEGIS_PATCH_END SGP-0010

/**
 * The lighting pipeline stage is responsible for taking a material and rendering
 * it with a lighting model such as physically based rendering (PBR) or unlit
 * shading
 *
 * @namespace LightingPipelineStage
 *
 * @private
 */
const LightingPipelineStage = {
  name: "LightingPipelineStage", // Helps with debugging
};

/**
 * Process a primitive. This modifies the following parts of the render
 * resources:
 * <ul>
 *   <li>modifies the shader to include the lighting stage</li>
 * </ul>
 * @param {PrimitiveRenderResources} renderResources The render resources for the primitive
 * @param {ModelComponents.Primitive} primitive The primitive to be rendered
 *
 * @private
 */
// SCENEGIS_PATCH_BEGIN SGP-0010: Receive the frame record already supplied by ModelSceneGraph.
LightingPipelineStage.process = function (
  renderResources,
  primitive,
  frameState,
) {
  // SCENEGIS_PATCH_END SGP-0010
  const { model, lightingOptions, shaderBuilder } = renderResources;

  if (defined(model.lightColor)) {
    shaderBuilder.addDefine(
      "USE_CUSTOM_LIGHT_COLOR",
      undefined,
      ShaderDestination.FRAGMENT,
    );

    shaderBuilder.addUniform(
      "vec3",
      "model_lightColorHdr",
      ShaderDestination.FRAGMENT,
    );

    const uniformMap = renderResources.uniformMap;
    uniformMap.model_lightColorHdr = function () {
      return model.lightColor;
    };
  }

  // The lighting model is always set by the material. However, custom shaders
  // can override this.
  const { lightingModel } = lightingOptions;

  if (lightingModel === LightingModel.PBR) {
    shaderBuilder.addDefine(
      "LIGHTING_PBR",
      undefined,
      ShaderDestination.FRAGMENT,
    );
  } else {
    shaderBuilder.addDefine(
      "LIGHTING_UNLIT",
      undefined,
      ShaderDestination.FRAGMENT,
    );
  }

  // SCENEGIS_PATCH_BEGIN SGP-0010: Keep physical source implementation in SceneGIS-owned code.
  SceneGISModelEnvironmentLighting.process(renderResources, frameState);
  // SCENEGIS_PATCH_END SGP-0010
  shaderBuilder.addFragmentLines(LightingStageFS);
};

export default LightingPipelineStage;
