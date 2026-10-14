import Color from "../../../Core/Color.js";
import combine from "../../../Core/combine.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import PostProcessStage from "../../../Scene/PostProcessStage.js";
import PostProcessStageComposite from "../../../Scene/PostProcessStageComposite.js";
import SceneMode from "../../../Scene/SceneMode.js";
import common from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOCommon.js";
import debug from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODebug.js";
import estimate from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOEstimate.js";
import filter from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOFilter.js";
import LightingMrt from "./_SceneGISLightingMrt.js";
import IndirectLighting from "./_SceneGISScreenSpaceIndirectLighting.js";

const opaquePasses = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
const parameterNames = [
  "intensity",
  "bias",
  "lengthCap",
  "directionCount",
  "stepCount",
];

function uniformValue(value) {
  return typeof value === "function" ? value() : value;
}

/** Current-frame indirect lighting occlusion, owned by the native AO composite. @private */
const SceneGISAmbientOcclusion = {};

SceneGISAmbientOcclusion.createStage = function () {
  const state = {
    ready: false,
    context: undefined,
    values: {},
  };
  const uniforms = {
    intensity: 1.5,
    bias: 0.03,
    lengthCap: 1.0,
    directionCount: 8,
    stepCount: 8,
    randomTexture: undefined,
    ambientOcclusionOnly: false,
  };
  const stage = new PostProcessStage({
    name: "czm_ambient_occlusion_debug",
    fragmentShader: debug,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
    uniforms: {
      u_occlusion: () =>
        state.filtered?.getColorTexture() ?? state.context.defaultTexture,
      ambientOcclusionOnly: () => uniformValue(uniforms.ambientOcclusionOnly),
    },
  });
  const composite = new PostProcessStageComposite({
    name: "czm_ambient_occlusion",
    stages: [stage],
    uniforms,
  });
  state.uniforms = uniforms;
  composite._sceneGISAmbientOcclusion = state;
  return composite;
};

SceneGISAmbientOcclusion.prepare = function (scene) {
  const ao = scene.postProcessStages.ambientOcclusion;
  const state = ao._sceneGISAmbientOcclusion;
  state.ready = false;
  state.mainPass = false;
  state.mainActive = false;
  state.prepassDraws = 0;
  scene.frameState._sceneGISAmbientOcclusion = ao.enabled;
  if (!ao.enabled) {
    LightingMrt.destroy(state);
    state.raw?.destroy();
    state.raw = undefined;
    return;
  }
  const context = scene.context;
  if (
    scene.mode !== SceneMode.SCENE3D ||
    !context.webgl2 ||
    !context.depthTexture ||
    !context.colorBufferFloat ||
    !context.colorBufferHalfFloat
  ) {
    throw new RuntimeError(
      "SceneGIS ambient occlusion requires SCENE3D, WebGL2 and floating-point color/depth textures.",
    );
  }
  const u = state.values;
  for (const name of parameterNames) {
    u[name] = uniformValue(state.uniforms[name]);
  }
  if (
    !Number.isFinite(u.lengthCap) ||
    u.lengthCap <= 0 ||
    !Number.isFinite(u.intensity) ||
    u.intensity < 0 ||
    !Number.isFinite(u.bias) ||
    u.bias < 0 ||
    u.bias >= 1 ||
    !Number.isInteger(u.directionCount) ||
    u.directionCount < 2 ||
    !Number.isInteger(u.stepCount) ||
    u.stepCount < 1
  ) {
    throw new DeveloperError(
      "AO requires lengthCap > 0, intensity >= 0, bias in [0, 1), integer directionCount >= 2 and stepCount >= 1.",
    );
  }
  state.context = context;
};

function allocate(state, scene, sourceDepth) {
  const context = scene.context;

  if (!defined(sourceDepth) && !defined(state.linearDepth)) {
    state.linearDepth = new FramebufferManager({
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
    });
  }
  if (!defined(state.estimate)) {
    state.estimate = new FramebufferManager();
    state.filtered = new FramebufferManager({ pixelFormat: PixelFormat.RED });
    state.clearLinear = new ClearCommand({ color: Color.TRANSPARENT });
    const uniforms = {
      u_linearDepth: () => state.sourceDepth,
      u_radius: () => state.values.lengthCap,
    };
    state.estimateCommand = context.createViewportQuadCommand(
      new ShaderSource({ sources: [common, estimate] }),
      {
        owner: state,
        uniformMap: combine(uniforms, {
          u_bias: () => state.values.bias,
          u_directions: () => state.values.directionCount,
          u_steps: () => state.values.stepCount,
        }),
      },
    );
    state.filterCommand = context.createViewportQuadCommand(
      new ShaderSource({ sources: [common, filter] }),
      {
        owner: state,
        uniformMap: combine(uniforms, {
          u_estimate: () => state.estimate.getColorTexture(),
          u_intensity: () => state.values.intensity,
        }),
      },
    );
  }
  for (const buffer of [state.linearDepth, state.estimate, state.filtered]) {
    buffer?.update(
      context,
      context.drawingBufferWidth,
      context.drawingBufferHeight,
    );
  }
  state.sourceDepth = sourceDepth ?? state.linearDepth.getColorTexture();
}

function eligible(command) {
  return (
    command.owner?._sceneGISWater !== true &&
    opaquePasses.includes(command.pass) &&
    command.renderState?.depthTest.enabled &&
    command.renderState.depthMask &&
    !defined(command.framebuffer)
  );
}

SceneGISAmbientOcclusion.execute = function (scene, passState) {
  const state =
    scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
  if (
    !scene.frameState._sceneGISAmbientOcclusion ||
    !scene.frameState.passes.render
  ) {
    return;
  }
  allocate(state, scene);
  state.raw ??= new FramebufferManager({
    pixelDatatype: PixelDatatype.HALF_FLOAT,
  });
  state.clear = state.clearColor = state.clearLinear;
  state.raw.update(
    scene.context,
    scene.context.drawingBufferWidth,
    scene.context.drawingBufferHeight,
  );
  state.depth = state.linearDepth;
  state.mainPass = state.mainActive = LightingMrt.begin(
    scene,
    state,
    passState,
    eligible,
    false,
  );
};

function estimateOcclusion(state, context, passState) {
  passState.framebuffer = state.estimate.framebuffer;
  state.estimateCommand.execute(context, passState);
  passState.framebuffer = state.filtered.framebuffer;
  state.filterCommand.execute(context, passState);
  state.ready = true;
}

SceneGISAmbientOcclusion.resolveShared = function (
  scene,
  passState,
  sourceDepth,
) {
  const state =
    scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
  if (!state.mainPass) {
    return;
  }
  // Shared SSR owns the depth snapshot; release now-unused standalone capture targets.
  LightingMrt.destroy(state);
  for (const name of ["raw", "linearDepth"]) {
    state[name]?.destroy();
    state[name] = undefined;
  }
  state.depth = undefined;
  allocate(state, scene, sourceDepth);
  estimateOcclusion(state, scene.context, passState);
};

SceneGISAmbientOcclusion.resolve = function (scene, passState, frustum) {
  const state =
    scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
  if (!state.mainActive) {
    return;
  }
  const context = scene.context;
  const original = passState.framebuffer;
  try {
    LightingMrt.resolve(scene, state);
    context.uniformState.updateFrustum(scene.camera.frustum);
    estimateOcclusion(state, context, passState);
    IndirectLighting.render(scene, state, state.linearDepth.getColorTexture());
    passState.framebuffer = original;
    LightingMrt.composite(scene, state, passState);
    if (state.main.needsRadiance) {
      LightingMrt.radiance(scene, state);
    }
  } finally {
    state.mainActive = false;
    passState.framebuffer = original;
    context.uniformState.updateFrustum(frustum);
  }
  return true;
};

SceneGISAmbientOcclusion.destroy = function (stage) {
  const state = stage._sceneGISAmbientOcclusion;
  state.ready = false;
  LightingMrt.destroy(state);
  for (const name of ["raw", "linearDepth", "estimate", "filtered"]) {
    state[name]?.destroy();
    state[name] = undefined;
  }
  for (const name of ["estimateCommand", "filterCommand"]) {
    state[name]?.shaderProgram.destroy();
    state[name] = undefined;
  }
};

export default SceneGISAmbientOcclusion;
