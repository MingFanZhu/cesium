import Color from "../../../Core/Color.js";
import combine from "../../../Core/combine.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import DerivedCommand from "../../../Scene/DerivedCommand.js";
import PostProcessStage from "../../../Scene/PostProcessStage.js";
import PostProcessStageComposite from "../../../Scene/PostProcessStageComposite.js";
import SceneMode from "../../../Scene/SceneMode.js";
import common from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOCommon.js";
import debug from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODebug.js";
import depth from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODepth.js";
import estimate from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOEstimate.js";
import filter from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOFilter.js";
import receive from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOReceive.js";

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
    depthCommands: new WeakMap(),
    depthPrograms: new WeakMap(),
    receivers: new WeakMap(),
    receiverPrograms: new WeakMap(),
    receiverUniforms: undefined,
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
  state.receiverUniforms = {
    u_sceneGISAmbientOcclusion: () => state.filtered.getColorTexture(),
  };
  composite._sceneGISAmbientOcclusion = state;
  return composite;
};

SceneGISAmbientOcclusion.prepare = function (scene) {
  const ao = scene.postProcessStages.ambientOcclusion;
  const state = ao._sceneGISAmbientOcclusion;
  state.ready = false;
  scene.frameState._sceneGISAmbientOcclusion = ao.enabled;
  if (!ao.enabled) {
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

function allocate(state, scene) {
  const context = scene.context;
  if (!defined(state.rawDepth)) {
    state.rawDepth = new FramebufferManager({
      color: false,
      depthStencil: true,
      supportsDepthTexture: true,
    });
    state.linearDepth = new FramebufferManager({
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
    });
    state.estimate = new FramebufferManager();
    state.filtered = new FramebufferManager({ pixelFormat: PixelFormat.RED });
    state.clearDepth = new ClearCommand({ depth: 1.0, stencil: 0 });
    state.clearLinear = new ClearCommand({ color: Color.TRANSPARENT });
    const uniforms = {
      u_linearDepth: () => state.linearDepth.getColorTexture(),
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
  for (const buffer of [
    state.rawDepth,
    state.linearDepth,
    state.estimate,
    state.filtered,
  ]) {
    buffer.update(
      context,
      context.drawingBufferWidth,
      context.drawingBufferHeight,
    );
  }
  const useLogDepth = scene.frameState.useLogDepth;
  if (!defined(state.copyCommand) || state.useLogDepth !== useLogDepth) {
    state.copyCommand?.shaderProgram.destroy();
    state.copyCommand = context.createViewportQuadCommand(
      new ShaderSource({
        defines: useLogDepth ? ["LOG_DEPTH_READ_ONLY"] : [],
        sources: [depth],
      }),
      {
        owner: state,
        uniformMap: { u_depth: () => state.rawDepth.getDepthStencilTexture() },
      },
    );
    state.useLogDepth = useLogDepth;
  }
}

function eligible(command) {
  return (
    command.owner?._sceneGISWater !== true &&
    opaquePasses.includes(command.pass) &&
    command.renderState?.depthTest.enabled &&
    command.renderState.depthMask
  );
}

SceneGISAmbientOcclusion.execute = function (scene, passState, frustum) {
  const state =
    scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
  if (
    !scene.frameState._sceneGISAmbientOcclusion ||
    !scene.frameState.passes.render
  ) {
    return;
  }
  allocate(state, scene);
  const context = scene.context;
  const us = context.uniformState;
  const oldFramebuffer = passState.framebuffer;
  const oldPass = us.pass;
  try {
    passState.framebuffer = state.linearDepth.framebuffer;
    state.clearLinear.execute(context, passState);
    const list = scene._view.frustumCommandsList;
    for (let i = list.length - 1; i >= 0; --i) {
      const range = list[i];
      frustum.near =
        i === 0 ? range.near : range.near * scene.opaqueFrustumNearOffset;
      frustum.far = range.far;
      us.updateFrustum(frustum);
      passState.framebuffer = state.rawDepth.framebuffer;
      state.clearDepth.execute(context, passState);
      for (const pass of opaquePasses) {
        us.updatePass(pass);
        const commands = range.commands[pass];
        for (let j = 0; j < range.indices[pass]; ++j) {
          let command = commands[j];
          if (
            !eligible(command) ||
            (scene.debugCommandFilter && !scene.debugCommandFilter(command))
          ) {
            continue;
          }
          if (
            scene.frameState.useLogDepth &&
            defined(command.derivedCommands.logDepth)
          ) {
            command = command.derivedCommands.logDepth.command;
          }
          const derived = DerivedCommand.createDepthOnlyDerivedCommand(
            scene,
            command,
            context,
            state.depthCommands.get(command),
          );
          state.depthCommands.set(command, derived);
          const depthCommand = derived.depthOnlyCommand;
          const source = command.shaderProgram;
          let program = state.depthPrograms.get(source);
          if (!defined(program)) {
            const fs = depthCommand.shaderProgram.fragmentShaderSource.clone();
            fs.defines.push("SCENEGIS_DEPTH_ONLY");
            program = context.shaderCache.createDerivedShaderProgram(
              source,
              "sceneGIS_AO_depth",
              {
                vertexShaderSource:
                  depthCommand.shaderProgram.vertexShaderSource,
                fragmentShaderSource: fs,
                attributeLocations: source._attributeLocations,
              },
            );
            state.depthPrograms.set(source, program);
          }
          depthCommand.shaderProgram = program;
          depthCommand.execute(context, passState);
        }
      }
      passState.framebuffer = state.linearDepth.framebuffer;
      state.copyCommand.execute(context, passState);
    }
    us.updateFrustum(scene.camera.frustum);
    passState.framebuffer = state.estimate.framebuffer;
    state.estimateCommand.execute(context, passState);
    passState.framebuffer = state.filtered.framebuffer;
    state.filterCommand.execute(context, passState);
    state.ready = true;
  } finally {
    passState.framebuffer = oldFramebuffer;
    us.updateFrustum(scene.camera.frustum);
    us.updatePass(oldPass);
  }
};

SceneGISAmbientOcclusion.receiver = function (scene, command) {
  const state =
    scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
  if (!scene.frameState.passes.render || !state.ready || !eligible(command)) {
    return command;
  }
  let result = state.receivers.get(command);
  if (!defined(result)) {
    result = {};
    state.receivers.set(command, result);
  }
  const shader = command.shaderProgram;
  let program = state.receiverPrograms.get(shader);
  // Native derived keys include the full source; resolve only when it changes.
  if (!defined(program)) {
    program = scene.context.shaderCache.getDerivedShaderProgram(
      shader,
      "sceneGIS_AO",
    );
    if (!defined(program)) {
      const fs = shader.fragmentShaderSource.clone();
      fs.defines.push("SCENEGIS_AMBIENT_OCCLUSION");
      fs.sources.unshift(receive);
      program = scene.context.shaderCache.createDerivedShaderProgram(
        shader,
        "sceneGIS_AO",
        {
          vertexShaderSource: shader.vertexShaderSource,
          fragmentShaderSource: fs,
          attributeLocations: shader._attributeLocations,
        },
      );
    }
    state.receiverPrograms.set(shader, program);
  }
  if (result.sourceUniforms !== command.uniformMap) {
    result.sourceUniforms = command.uniformMap;
    result.uniformMap = combine(state.receiverUniforms, command.uniformMap);
  }
  result.command = DrawCommand.shallowClone(command, result.command);
  result.command.shaderProgram = program;
  result.command.uniformMap = result.uniformMap;
  return result.command;
};

SceneGISAmbientOcclusion.destroy = function (stage) {
  const state = stage._sceneGISAmbientOcclusion;
  state.ready = false;
  for (const name of ["rawDepth", "linearDepth", "estimate", "filtered"]) {
    state[name]?.destroy();
    state[name] = undefined;
  }
  for (const name of ["copyCommand", "estimateCommand", "filterCommand"]) {
    state[name]?.shaderProgram.destroy();
    state[name] = undefined;
  }
};

export default SceneGISAmbientOcclusion;
