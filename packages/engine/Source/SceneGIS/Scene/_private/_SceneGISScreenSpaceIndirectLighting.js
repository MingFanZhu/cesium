import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Color from "../../../Core/Color.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import depthShader from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODepth.js";
import common from "../../../Shaders/SceneGIS/IndirectLighting/SceneGISSILCommon.js";
import estimate from "../../../Shaders/SceneGIS/IndirectLighting/SceneGISSILEstimate.js";
import reconstruct from "../../../Shaders/SceneGIS/IndirectLighting/SceneGISSILReconstruct.js";
import LightingMrt from "./_SceneGISLightingMrt.js";

const opaquePasses = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
function eligible(command) {
  return (
    command.owner?._sceneGISWater !== true &&
    opaquePasses.includes(command.pass) &&
    command.renderState?.depthTest.enabled &&
    command.renderState.depthMask &&
    !command.framebuffer
  );
}

function allocate(effect, scene) {
  if (effect._state) {
    return effect._state;
  }
  const context = scene.context;
  const s = (effect._state = {
    mainActive: false,
    estimate: new FramebufferManager({
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    }),
    result: new FramebufferManager({ pixelDatatype: PixelDatatype.HALF_FLOAT }),
    fullSize: new Cartesian2(),
  });
  const uniforms = {
    u_depth: () => s.sourceDepth,
    u_source: () => s.shared.main.ssil.getColorTexture(0),
    u_response: () => s.shared.main.ssil.getColorTexture(1),
    u_fullSize: () => s.fullSize,
    u_stride: () => 1 / effect.resolutionScale,
    u_radius: () => effect.radius,
    u_thickness: () => effect.thickness,
    u_directions: () => effect.directionCount,
    u_steps: () => effect.stepCount,
    u_estimate: () => s.estimate.getColorTexture(),
    u_intensity: () => effect.intensity,
  };
  s.estimateCommand = context.createViewportQuadCommand(
    new ShaderSource({ sources: [common, estimate] }),
    { owner: effect, uniformMap: uniforms },
  );
  s.reconstructCommand = context.createViewportQuadCommand(
    new ShaderSource({ sources: [common, reconstruct] }),
    { owner: effect, uniformMap: uniforms },
  );
  return s;
}

/** Single-bounce spatial transport using the shared main-pass lighting MRT. @private */
const SceneGISScreenSpaceIndirectLighting = {
  prepare(scene) {
    const effect = scene._sceneGISScreenSpaceIndirectLighting;
    if (!effect) {
      return;
    }
    effect._ready = false;
    if (effect._state) {
      effect._state.mainActive = false;
    }
    if (effect.enabled) {
      effect._validate();
    }
  },

  begin(scene, passState) {
    const effect = scene._sceneGISScreenSpaceIndirectLighting;
    if (!effect?.enabled) {
      return;
    }
    // Native empty/loading views have no frustum and no surface to illuminate.
    if (scene._view.frustumCommandsList.length === 0) {
      return;
    }
    // Preflight every owner before geometry submission. SSIL never invokes a replay fallback.
    const selected = LightingMrt.layout(
      scene,
      passState,
      eligible,
      scene._sceneGISScreenSpaceReflections?.enabled === true,
    );
    if (!selected) {
      throw new RuntimeError(
        "SSIL requires a supported single-frustum opaque MRT layout. Disable clearcoat SSR, classification or unsupported post-lighting effects; SSIL does not replay geometry.",
      );
    }
    if (
      scene._sceneGISScreenSpaceReflections?.enabled ||
      scene.postProcessStages.ambientOcclusion.enabled
    ) {
      return;
    }
    const s = allocate(effect, scene);
    const context = scene.context;
    if (!s.raw) {
      s.raw = new FramebufferManager({
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        depthStencil: true,
        supportsDepthTexture: true,
      });
      s.depth = new FramebufferManager({
        pixelFormat: PixelFormat.RED,
        pixelDatatype: PixelDatatype.FLOAT,
      });
      s.clear = new ClearCommand({
        color: Color.TRANSPARENT,
        depth: 1,
        stencil: 0,
      });
      s.clearColor = new ClearCommand({ color: Color.TRANSPARENT });
    }
    for (const target of [s.raw, s.depth]) {
      target.update(
        context,
        context.drawingBufferWidth,
        context.drawingBufferHeight,
      );
    }
    if (!s.copyDepth || s.logDepth !== scene.frameState.useLogDepth) {
      s.copyDepth?.shaderProgram.destroy();
      s.logDepth = scene.frameState.useLogDepth;
      s.copyDepth = context.createViewportQuadCommand(
        new ShaderSource({
          defines: s.logDepth ? ["LOG_DEPTH_READ_ONLY"] : [],
          sources: [depthShader],
        }),
        {
          owner: effect,
          uniformMap: { u_depth: () => s.raw.getDepthStencilTexture() },
        },
      );
    }
    s.mainActive = LightingMrt.begin(
      scene,
      s,
      passState,
      eligible,
      false,
      selected,
    );
  },

  receiver(scene, command) {
    const s = scene._sceneGISScreenSpaceIndirectLighting?._state;
    if (scene.frameState.passes.render && s?.mainActive && eligible(command)) {
      return LightingMrt.command(scene, s, command);
    }
    return command;
  },

  render(scene, shared, sourceDepth) {
    const effect = scene._sceneGISScreenSpaceIndirectLighting;
    if (!effect?.enabled || !shared.main.ssil) {
      return;
    }
    const s = allocate(effect, scene);
    s.shared = shared;
    s.sourceDepth = sourceDepth;
    const context = scene.context;
    const width = context.drawingBufferWidth,
      height = context.drawingBufferHeight;
    s.fullSize.x = width;
    s.fullSize.y = height;
    const lowWidth = Math.ceil(width * effect.resolutionScale),
      lowHeight = Math.ceil(height * effect.resolutionScale);
    s.estimate.update(context, lowWidth, lowHeight);
    s.result.update(context, width, height);
    s.estimateCommand.framebuffer = s.estimate.framebuffer;
    if (
      s.estimateCommand.renderState?.viewport.width !== lowWidth ||
      s.estimateCommand.renderState?.viewport.height !== lowHeight
    ) {
      s.estimateCommand.renderState = RenderState.fromCache({
        viewport: new BoundingRectangle(0, 0, lowWidth, lowHeight),
      });
    }
    s.estimateCommand.execute(context);
    s.reconstructCommand.framebuffer = s.result.framebuffer;
    if (
      s.reconstructCommand.renderState?.viewport.width !== width ||
      s.reconstructCommand.renderState?.viewport.height !== height
    ) {
      s.reconstructCommand.renderState = RenderState.fromCache({
        viewport: new BoundingRectangle(0, 0, width, height),
      });
    }
    s.reconstructCommand.execute(context);
    effect._ready = true;
  },

  resolve(scene, passState, frustum) {
    const s = scene._sceneGISScreenSpaceIndirectLighting?._state;
    if (!s?.mainActive) {
      return false;
    }
    const original = passState.framebuffer;
    try {
      LightingMrt.resolve(scene, s);
      passState.framebuffer = s.depth.framebuffer;
      s.copyDepth.execute(scene.context, passState);
      scene.context.uniformState.updateFrustum(scene.camera.frustum);
      SceneGISScreenSpaceIndirectLighting.render(
        scene,
        s,
        s.depth.getColorTexture(),
      );
      passState.framebuffer = original;
      LightingMrt.composite(scene, s, passState);
      if (s.main.needsRadiance) {
        LightingMrt.radiance(scene, s);
      }
    } finally {
      s.mainActive = false;
      passState.framebuffer = original;
      scene.context.uniformState.updateFrustum(frustum);
    }
    return true;
  },

  destroy(effect) {
    const s = effect._state;
    if (!s) {
      return;
    }
    if (s.shared && s.shared !== s) {
      LightingMrt.destroy(s.shared);
    }
    LightingMrt.destroy(s);
    for (const name of ["raw", "depth", "estimate", "result"]) {
      s[name]?.destroy();
    }
    for (const name of ["copyDepth", "estimateCommand", "reconstructCommand"]) {
      s[name]?.shaderProgram.destroy();
    }
    effect._state = undefined;
    effect._ready = false;
  },
};

export default SceneGISScreenSpaceIndirectLighting;
