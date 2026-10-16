import Color from "../../../Core/Color.js";
import defined from "../../../Core/defined.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import AmbientOcclusion from "./_SceneGISAmbientOcclusion.js";
import ReflectionMrt from "./_SceneGISLightingMrt.js";
import ReflectionTracing from "./_SceneGISReflectionTracing.js";
import IndirectLighting from "./_SceneGISScreenSpaceIndirectLighting.js";

const opaquePasses = [
  Pass.GLOBE,
  Pass.CESIUM_3D_TILE,
  Pass.OPAQUE,
  Pass.SCENEGIS_VECTOR,
];

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
      raw: new FramebufferManager({
        colorAttachmentsLength: 3,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
      }),
      depth: new FramebufferManager({
        pixelFormat: PixelFormat.RED,
        pixelDatatype: PixelDatatype.FLOAT,
      }),
      result: new FramebufferManager({
        colorAttachmentsLength: 2,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
      }),
      clear: new ClearCommand({
        color: Color.TRANSPARENT,
      }),
      clearColor: new ClearCommand({ color: Color.TRANSPARENT }),
    };
  }
  for (const f of [s.raw, s.depth, s.result]) {
    f.update(context, context.drawingBufferWidth, context.drawingBufferHeight);
  }
  ReflectionTracing.allocate(effect, scene, s);
  return s;
}

SceneGISScreenSpaceReflections.prepare = function (scene) {
  const effect = scene._sceneGISScreenSpaceReflections;
  if (!defined(effect)) {
    return;
  }
  if (!effect._ready && effect._state?.tracing) {
    effect._state.tracing.valid = false;
  }
  effect._ready = false;
  if (defined(effect._state)) {
    effect._state.mainActive = false;
  }
  if (effect.enabled) {
    effect._validate();
  }
};

SceneGISScreenSpaceReflections.execute = function (scene, passState) {
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
  s.captureDraws = 0;
  s.mainDraws = 0;
  s.radianceTexture = s.raw.getColorTexture();
  s.mainPass = s.mainActive = ReflectionMrt.begin(
    scene,
    s,
    passState,
    eligible,
  );
  const ao = scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
  ao.mainPass = s.main.ao;
  ao.prepassDraws = 0;
};

SceneGISScreenSpaceReflections.resolve = function (scene, passState, frustum) {
  const effect = scene._sceneGISScreenSpaceReflections;
  const s = effect?._state;
  if (!effect?.enabled || !s?.mainActive || !scene.frameState.passes.render) {
    return false;
  }
  const context = scene.context;
  const original = passState.framebuffer;
  try {
    ReflectionMrt.resolve(scene, s, passState);
    context.uniformState.updateFrustum(scene.camera.frustum);
    AmbientOcclusion.resolveShared(scene, passState, s.depth.getColorTexture());
    IndirectLighting.render(scene, s, s.depth.getColorTexture());
    ReflectionMrt.radiance(scene, s);
    ReflectionTracing.execute(scene, s);
    passState.framebuffer = original;
    ReflectionMrt.composite(scene, s, passState);
    effect._ready = true;
  } finally {
    s.mainActive = false;
    passState.framebuffer = original;
    context.uniformState.updateFrustum(frustum);
  }
  return true;
};

SceneGISScreenSpaceReflections.destroy = function (effect) {
  effect._ready = false;
  const s = effect._state;
  if (!defined(s)) {
    return;
  }
  ReflectionMrt.destroy(s);
  s.raw.destroy();
  s.depth.destroy();
  s.result.destroy();
  ReflectionTracing.destroy(s);
  effect._state = undefined;
};

export default SceneGISScreenSpaceReflections;
