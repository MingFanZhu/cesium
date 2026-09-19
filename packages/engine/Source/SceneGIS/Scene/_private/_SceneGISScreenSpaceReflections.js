import Color from "../../../Core/Color.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import combine from "../../../Core/combine.js";
import defined from "../../../Core/defined.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";
import capture from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRCapture.js";
import receive from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRReceive.js";
import trace from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRTrace.js";
import ray from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRRay.js";
import filter from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRFilter.js";
import depth from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODepth.js";
import AmbientOcclusion from "./_SceneGISAmbientOcclusion.js";
import LocalLights from "./_SceneGISLocalLights.js";

const opaquePasses = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
const mipSampler = new Sampler({
  minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});

/**
 * Current-frame capture, traversal and native PBR radiance substitution.
 * @private
 */
const SceneGISScreenSpaceReflections = {};

function eligible(command) {
  return (
    command.owner?._sceneGISWater !== true &&
    opaquePasses.includes(command.pass) &&
    command.renderState?.depthTest.enabled &&
    command.renderState.depthMask &&
    !defined(command.framebuffer)
  );
}

function allocate(effect, scene) {
  let s = effect._state;
  const context = scene.context;
  if (!defined(s)) {
    s = effect._state = {
      captures: new WeakMap(),
      receivers: new WeakMap(),
      capturing: false,
      raw: new FramebufferManager({
        colorAttachmentsLength: 3,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        depthStencil: true,
        supportsDepthTexture: true,
      }),
      depth: new FramebufferManager({
        pixelFormat: PixelFormat.RED,
        pixelDatatype: PixelDatatype.FLOAT,
      }),
      result: new FramebufferManager({
        colorAttachmentsLength: 2,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
      }),
      filtered: new FramebufferManager({
        colorAttachmentsLength: 2,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
      }),
      clear: new ClearCommand({
        color: Color.TRANSPARENT,
        depth: 1,
        stencil: 0,
      }),
      clearDepth: new ClearCommand({ depth: 1, stencil: 0 }),
      clearColor: new ClearCommand({ color: Color.TRANSPARENT }),
    };
    s.receiverUniforms = {
      u_sceneGISSSRBase: () => s.result.getColorTexture(0),
      u_sceneGISSSRCoat: () => s.result.getColorTexture(1),
    };
    s.trace = context.createViewportQuadCommand(
      new ShaderSource({ sources: [ray, trace] }),
      {
        owner: effect,
        uniformMap: {
          u_depth: () => s.depth.getColorTexture(),
          u_color: () => s.raw.getColorTexture(0),
          u_baseRay: () => s.raw.getColorTexture(1),
          u_coatRay: () => s.raw.getColorTexture(2),
          u_maximumDistance: () => effect.maximumDistance,
          u_thickness: () => effect.thickness,
          u_maximumRoughness: () => effect.maximumRoughness,
          u_stepCount: () => effect.stepCount,
          u_rayNear: () => scene.camera.frustum.near,
        },
      },
    );
    s.filterInput = s.result;
    s.filterAxis = new Cartesian2(1, 0);
    s.filter = context.createViewportQuadCommand(filter, {
      owner: effect,
      uniformMap: {
        u_depth: () => s.depth.getColorTexture(),
        u_baseRay: () => s.raw.getColorTexture(1),
        u_coatRay: () => s.raw.getColorTexture(2),
        u_base: () => s.filterInput.getColorTexture(0),
        u_coat: () => s.filterInput.getColorTexture(1),
        u_axis: () => s.filterAxis,
      },
    });
  }
  for (const f of [s.raw, s.depth, s.result, s.filtered]) {
    f.update(context, context.drawingBufferWidth, context.drawingBufferHeight);
  }
  const logDepth = scene.frameState.useLogDepth;
  if (!defined(s.copyDepth) || s.logDepth !== logDepth) {
    s.copyDepth?.shaderProgram.destroy();
    s.copyDepth = context.createViewportQuadCommand(
      new ShaderSource({
        defines: logDepth ? ["LOG_DEPTH_READ_ONLY"] : [],
        sources: [depth],
      }),
      {
        owner: effect,
        uniformMap: { u_depth: () => s.raw.getDepthStencilTexture() },
      },
    );
    s.logDepth = logDepth;
  }
  return s;
}

SceneGISScreenSpaceReflections.prepare = function (scene) {
  const effect = scene._sceneGISScreenSpaceReflections;
  if (!defined(effect)) {
    return;
  }
  effect._ready = false;
  if (effect.enabled) {
    effect._validate();
  }
};

SceneGISScreenSpaceReflections.execute = function (
  scene,
  passState,
  frustum,
  executeCommand,
) {
  const effect = scene._sceneGISScreenSpaceReflections;
  const passes = scene.frameState.passes;
  if (
    !effect?.enabled ||
    !passes.render ||
    passes.pick ||
    passes.depth ||
    passes.pickVoxel
  ) {
    return;
  }
  const s = allocate(effect, scene);
  const context = scene.context;
  const us = context.uniformState;
  const oldFramebuffer = passState.framebuffer;
  const oldPass = us.pass;
  s.captureDraws = 0;
  try {
    s.capturing = true;
    passState.framebuffer = s.raw.framebuffer;
    s.clear.execute(context, passState);
    passState.framebuffer = s.depth.framebuffer;
    s.clearColor.execute(context, passState);
    const ranges = scene._view.frustumCommandsList;
    for (let i = ranges.length - 1; i >= 0; --i) {
      const range = ranges[i];
      frustum.near =
        i === 0 ? range.near : range.near * scene.opaqueFrustumNearOffset;
      frustum.far = range.far;
      us.updateFrustum(frustum);
      passState.framebuffer = s.raw.framebuffer;
      s.clearDepth.execute(context, passState);
      for (const pass of opaquePasses) {
        us.updatePass(pass);
        const commands = range.commands[pass];
        for (let j = 0; j < range.indices[pass]; ++j) {
          if (eligible(commands[j])) {
            executeCommand(commands[j], scene, passState);
          }
        }
      }
      passState.framebuffer = s.depth.framebuffer;
      s.copyDepth.execute(context, passState);
    }
    s.capturing = false;
    us.updateFrustum(scene.camera.frustum);
    s.raw.getColorTexture().generateMipmap();
    s.raw.getColorTexture().sampler = mipSampler;
    passState.framebuffer = s.result.framebuffer;
    s.trace.execute(context, passState);
    s.filterInput = s.result;
    Cartesian2.clone(Cartesian2.UNIT_X, s.filterAxis);
    passState.framebuffer = s.filtered.framebuffer;
    s.filter.execute(context, passState);
    s.filterInput = s.filtered;
    Cartesian2.clone(Cartesian2.UNIT_Y, s.filterAxis);
    passState.framebuffer = s.result.framebuffer;
    s.filter.execute(context, passState);
    effect._ready = true;
  } finally {
    s.capturing = false;
    passState.framebuffer = oldFramebuffer;
    us.updateFrustum(scene.camera.frustum);
    us.updatePass(oldPass);
  }
};

function derive(scene, command, s, capturing) {
  const cache = capturing ? s.captures : s.receivers;
  let result = cache.get(command);
  if (!defined(result)) {
    result = {};
    cache.set(command, result);
  }
  const shader = command.shaderProgram;
  const name = capturing ? "sceneGIS_SSR_capture" : "sceneGIS_SSR_receive";
  let program = scene.context.shaderCache.getDerivedShaderProgram(shader, name);
  if (!defined(program)) {
    const fs = shader.fragmentShaderSource.clone();
    fs.defines.push(
      capturing ? "SCENEGIS_SSR_CAPTURE" : "SCENEGIS_SSR_RECEIVE",
    );
    if (capturing) {
      fs.sources = fs.sources.map((source) =>
        ShaderSource.replaceMain(source, "sceneGISSSRMain"),
      );
      fs.sources.unshift(capture);
      fs.sources.push(`void main() {
        sceneGISSSRMain();
        out_FragColor.a = 1.0;
        sceneGISSSRBaseOutput = sceneGISSSRBaseRay;
        sceneGISSSRCoatOutput = sceneGISSSRCoatRay;
      }`);
    } else {
      fs.sources.unshift(receive);
    }
    program = scene.context.shaderCache.createDerivedShaderProgram(
      shader,
      name,
      {
        vertexShaderSource: shader.vertexShaderSource,
        fragmentShaderSource: fs,
        attributeLocations: shader._attributeLocations,
      },
    );
  }
  if (result.sourceUniforms !== command.uniformMap) {
    result.sourceUniforms = command.uniformMap;
    result.uniformMap = capturing
      ? command.uniformMap
      : combine(s.receiverUniforms, command.uniformMap);
  }
  result.command = DrawCommand.shallowClone(command, result.command);
  result.command.shaderProgram = program;
  result.command.uniformMap = result.uniformMap;
  return result.command;
}

// Called after native log/HDR selection and picking/debug handling, before opaque draw.
SceneGISScreenSpaceReflections.draw = function (scene, command, passState) {
  const effect = scene._sceneGISScreenSpaceReflections;
  if (
    !effect?.enabled ||
    !scene.frameState.passes.render ||
    !eligible(command)
  ) {
    return false;
  }
  const s = effect._state;
  if (!defined(s) || (!s.capturing && !effect._ready)) {
    return false;
  }
  if (
    scene.frameState.shadowState.lightShadowsEnabled &&
    command.receiveShadows &&
    defined(command.derivedCommands.shadows)
  ) {
    command = command.derivedCommands.shadows.receiveCommand;
  }
  command = LocalLights.receiver(scene, command);
  command = AmbientOcclusion.receiver(scene, command);
  // Non-PBR sources still occlude receivers and supply shaded color during capture.
  // Their normal draw does not need extra samplers or a receiver variant.
  if (
    !s.capturing &&
    !command.shaderProgram.fragmentShaderSource.defines.includes("SPECULAR_IBL")
  ) {
    command.execute(scene.context, passState);
    return true;
  }
  derive(scene, command, s, s.capturing).execute(scene.context, passState);
  if (s.capturing) {
    ++s.captureDraws;
  }
  return true;
};

SceneGISScreenSpaceReflections.destroy = function (effect) {
  effect._ready = false;
  const s = effect._state;
  if (!defined(s)) {
    return;
  }
  s.raw.destroy();
  s.depth.destroy();
  s.result.destroy();
  s.filtered.destroy();
  s.trace.shaderProgram.destroy();
  s.filter.shaderProgram.destroy();
  s.copyDepth?.shaderProgram.destroy();
  effect._state = undefined;
};

export default SceneGISScreenSpaceReflections;
