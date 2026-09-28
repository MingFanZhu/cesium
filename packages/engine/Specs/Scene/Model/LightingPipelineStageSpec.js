import {
  _shadersLightingStageFS,
  LightingModel,
  LightingPipelineStage,
  ModelLightingOptions,
  ShaderBuilder,
  Cartesian3,
} from "../../../index.js";
import ShaderBuilderTester from "../../../../../Specs/ShaderBuilderTester.js";
// SCENEGIS_PATCH_BEGIN SGP-0025: Expect the optional PBR filtering binding.
import specularAntialiasing from "../../../Source/Shaders/SceneGIS/Antialiasing/SceneGISSpecularAntialiasing.js";
// SCENEGIS_PATCH_END SGP-0025

describe("Scene/Model/LightingPipelineStage", function () {
  const mockPrimitive = {};
  const mockModel = {};

  const optionsUnlit = new ModelLightingOptions();
  optionsUnlit.lightingModel = LightingModel.UNLIT;

  it("supports light color", function () {
    const mockModelWithLightColor = {
      lightColor: new Cartesian3(1, 0, 0),
    };
    const shaderBuilder = new ShaderBuilder();
    const renderResources = {
      model: mockModelWithLightColor,
      shaderBuilder: shaderBuilder,
      lightingOptions: optionsUnlit,
      uniformMap: {},
    };
    LightingPipelineStage.process(renderResources, mockPrimitive);

    ShaderBuilderTester.expectHasVertexDefines(shaderBuilder, []);
    ShaderBuilderTester.expectHasFragmentDefines(shaderBuilder, [
      "USE_CUSTOM_LIGHT_COLOR",
      "LIGHTING_UNLIT",
    ]);

    ShaderBuilderTester.expectHasVertexUniforms(shaderBuilder, []);
    ShaderBuilderTester.expectHasFragmentUniforms(shaderBuilder, [
      "uniform vec3 model_lightColorHdr;",
    ]);

    ShaderBuilderTester.expectFragmentLinesEqual(shaderBuilder, [
      _shadersLightingStageFS,
    ]);

    expect(renderResources.uniformMap.model_lightColorHdr).toBeDefined();
  });

  it("supports unlit lighting", function () {
    const shaderBuilder = new ShaderBuilder();
    const renderResources = {
      model: mockModel,
      shaderBuilder: shaderBuilder,
      lightingOptions: optionsUnlit,
    };
    LightingPipelineStage.process(renderResources, mockPrimitive);

    ShaderBuilderTester.expectHasVertexDefines(shaderBuilder, []);
    ShaderBuilderTester.expectHasFragmentDefines(shaderBuilder, [
      "LIGHTING_UNLIT",
    ]);

    ShaderBuilderTester.expectHasVertexUniforms(shaderBuilder, []);
    ShaderBuilderTester.expectHasFragmentUniforms(shaderBuilder, []);

    ShaderBuilderTester.expectFragmentLinesEqual(shaderBuilder, [
      _shadersLightingStageFS,
    ]);
  });

  it("supports PBR lighting", function () {
    const optionsPbr = new ModelLightingOptions();
    optionsPbr.lightingModel = LightingModel.PBR;

    const shaderBuilder = new ShaderBuilder();
    const renderResources = {
      model: mockModel,
      shaderBuilder: shaderBuilder,
      lightingOptions: optionsPbr,
      // SCENEGIS_PATCH_BEGIN SGP-0025: ModelSceneGraph supplies a uniform map and frame state.
      uniformMap: {},
      // SCENEGIS_PATCH_END SGP-0025
    };
    // SCENEGIS_PATCH_BEGIN SGP-0025: Check default and live uniform publication.
    const frameState = {};
    LightingPipelineStage.process(renderResources, mockPrimitive, frameState);
    expect(renderResources.uniformMap.u_sceneGISSpecularAntialiasing()).toBe(
      false,
    );
    frameState._sceneGISSpecularAntialiasingEnabled = true;
    expect(renderResources.uniformMap.u_sceneGISSpecularAntialiasing()).toBe(
      true,
    );
    // SCENEGIS_PATCH_END SGP-0025

    ShaderBuilderTester.expectHasVertexDefines(shaderBuilder, []);
    ShaderBuilderTester.expectHasFragmentDefines(shaderBuilder, [
      "LIGHTING_PBR",
    ]);

    ShaderBuilderTester.expectHasVertexUniforms(shaderBuilder, []);
    // SCENEGIS_PATCH_BEGIN SGP-0025: Filtering does not replace native lighting.
    ShaderBuilderTester.expectHasFragmentUniforms(shaderBuilder, [
      "uniform bool u_sceneGISSpecularAntialiasing;",
    ]);
    ShaderBuilderTester.expectFragmentLinesEqual(shaderBuilder, [
      _shadersLightingStageFS,
      specularAntialiasing,
    ]);
    // SCENEGIS_PATCH_END SGP-0025
  });
});
