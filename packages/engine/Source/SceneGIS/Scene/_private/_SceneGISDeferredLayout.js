import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import Pass from "../../../Renderer/Pass.js";
import BillboardCollection from "../../../Scene/BillboardCollection.js";
import SceneMode from "../../../Scene/SceneMode.js";

const opaquePasses = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
const excluded = ["HAS_MODEL_COLOR", "HAS_SELECTED_FEATURE_ID"];

function isAnnotation(command) {
  return (
    command.pass === Pass.OPAQUE &&
    command.owner instanceof BillboardCollection &&
    command.renderState.depthMask
  );
}

function eligible(command) {
  return (
    command.owner?._sceneGISWater !== true &&
    !isGlobeDepth(command) &&
    !isAnnotation(command)
  );
}

function isGlobeDepth(command) {
  const mask = command.renderState?.colorMask;
  return (
    command.pass === Pass.GLOBE &&
    mask &&
    !mask.red &&
    !mask.green &&
    !mask.blue &&
    !mask.alpha
  );
}

function validateScene(scene) {
  const context = scene.context;
  if (
    !context.webgl2 ||
    !context.colorBufferHalfFloat ||
    !context.colorBufferFloat ||
    !context.depthTexture ||
    ContextLimits.maximumDrawBuffers < 4 ||
    ContextLimits.maximumColorAttachments < 4
  ) {
    throw new RuntimeError(
      "Deferred material layout requires WebGL2, four floating-point targets and depth textures.",
    );
  }
  if (
    scene.mode !== SceneMode.SCENE3D ||
    scene.useWebVR ||
    scene.debugCommandFilter ||
    scene.debugShowCommands ||
    scene.debugShowFrustums
  ) {
    throw new DeveloperError(
      "Deferred rendering requires SCENE3D without WebVR or debug overrides.",
    );
  }
  if (scene.msaaSamples !== 1) {
    throw new DeveloperError(
      "Deferred lighting requires msaaSamples = 1. Select TAA or FXAA explicitly.",
    );
  }
}

function validate(scene, range, passState, isDeferredModel, isDeferredGlobe) {
  if (passState.viewport.x !== 0 || passState.viewport.y !== 0) {
    throw new DeveloperError(
      "Deferred material layout requires a full viewport.",
    );
  }
  let hasClassification =
    (scene._environmentState.useInvertClassification &&
      range.indices[Pass.CESIUM_3D_TILE] > 0) ||
    [Pass.TERRAIN_CLASSIFICATION, Pass.CESIUM_3D_TILE_CLASSIFICATION].some(
      (pass) => range.indices[pass] > 0,
    );
  let hasFeatureStyle = false;
  let hasOcean = false;
  let hasOceanFabric = false;
  for (const pass of opaquePasses) {
    for (let i = 0; i < range.indices[pass]; ++i) {
      const command = range.commands[pass][i];
      if (!eligible(command)) {
        continue;
      }
      if (
        !command.renderState?.depthTest.enabled ||
        !command.renderState.depthMask ||
        (command.renderState.blending.enabled && !isDeferredGlobe(command)) ||
        defined(command.framebuffer)
      ) {
        throw new DeveloperError(
          "Deferred material layout requires ordinary depth-writing opaque commands.",
        );
      }
      const fs = command.shaderProgram.fragmentShaderSource;
      if (isDeferredGlobe(command)) {
        hasClassification ||= fs.defines.includes("HAS_VECTOR_LAYER");
        hasOcean ||=
          fs.defines.includes("HAS_WATER_MASK") &&
          (fs.defines.includes("SHOW_REFLECTIVE_OCEAN") ||
            fs.defines.includes("APPLY_MATERIAL"));
        hasOceanFabric ||=
          fs.defines.includes("SHOW_REFLECTIVE_OCEAN") &&
          fs.defines.includes("APPLY_MATERIAL");
      }
      hasFeatureStyle ||= fs.defines.includes("HAS_SELECTED_FEATURE_ID");
      const nativeStyling =
        (fs.defines.includes("HAS_MODEL_COLOR") ||
          fs.defines.includes("HAS_SELECTED_FEATURE_ID")) &&
        isDeferredModel(command);
      const unsupported = excluded.find(
        (name) =>
          fs.defines.includes(name) &&
          !(
            nativeStyling &&
            (name === "HAS_MODEL_COLOR" || name === "HAS_SELECTED_FEATURE_ID")
          ),
      );
      if (
        nativeStyling &&
        fs.defines.includes("HAS_SELECTED_FEATURE_ID") &&
        (ContextLimits.maximumDrawBuffers < 5 ||
          ContextLimits.maximumColorAttachments < 5)
      ) {
        throw new RuntimeError(
          "Deferred feature styling requires five floating-point color attachments.",
        );
      }
      if (unsupported) {
        throw new DeveloperError(
          `Deferred material layout does not encode ${unsupported}.`,
        );
      }
    }
  }
  const count =
    4 +
    (hasClassification ? 1 : 0) +
    (hasFeatureStyle || hasOceanFabric ? 1 : 0) +
    (hasOcean ? 1 : 0);
  if (
    (hasClassification || hasOcean) &&
    (ContextLimits.maximumDrawBuffers < count ||
      ContextLimits.maximumColorAttachments < count)
  ) {
    throw new RuntimeError(
      `Deferred ${hasOcean ? "Globe water material" : "classification"} requires ${count} floating-point color attachments.`,
    );
  }
}

/** Deferred material qualification shared by the renderer and its consumers. @private */
const _SceneGISDeferredLayout = {
  validateScene,
  validate,
  isGlobeDepth,
  isAnnotation,
};
export default _SceneGISDeferredLayout;
