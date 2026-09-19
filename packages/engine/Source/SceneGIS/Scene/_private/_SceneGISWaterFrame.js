import Color from "../../../Core/Color.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";
import depth from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODepth.js";

const passes = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
const sampler = new Sampler({
  minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});

/**
 * Scene-owned opaque inputs and per-frustum water scheduling.
 * @private
 */
const SceneGISWaterFrame = {
  isWater(command) {
    return command.owner?._sceneGISWater === true;
  },
  get(frameState) {
    return (frameState._sceneGISWater ??= {
      surfaces: [],
      drawing: false,
      ready: false,
      raw: undefined,
      depth: undefined,
    });
  },
  prepare(scene) {
    const state = SceneGISWaterFrame.get(scene.frameState);
    state.hdr = scene.highDynamicRange;
    state.near = scene.camera.frustum.near;
    state.surfaces.length = 0;
    state.ready = false;
    state.captureDraws = 0;
    state.borrowed = false;
  },
  defer(scene, command) {
    return (
      SceneGISWaterFrame.isWater(command) &&
      !scene.frameState._sceneGISWater?.drawing
    );
  },
  capture(scene, passState, frustum, executeCommand) {
    const s = scene.frameState._sceneGISWater;
    if (!s?.surfaces.length || !scene.frameState.passes.render) {
      return;
    }
    const ranges = scene._view.frustumCommandsList;
    let visible = false;
    for (const range of ranges) {
      for (let i = 0; i < range.indices[Pass.OPAQUE]; ++i) {
        visible ||= SceneGISWaterFrame.isWater(range.commands[Pass.OPAQUE][i]);
      }
    }
    if (!visible) {
      return;
    }
    const ssr = scene._sceneGISScreenSpaceReflections;
    // Main-pass inputs are published after opaque drawing, before water composition.
    if (ssr?.enabled && ssr._state?.mainActive) {
      return;
    }
    if (ssr?.ready) {
      s.colorTexture = ssr._state.radianceTexture;
      s.depthTexture = ssr._state.depth.getColorTexture();
      s.borrowed = true;
      s.ready = true;
      s.captureDraws = 0;
      return;
    }
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
      s.clearDepth = new ClearCommand({ depth: 1, stencil: 0 });
      s.clearColor = new ClearCommand({ color: Color.TRANSPARENT });
    }
    s.raw.update(
      context,
      context.drawingBufferWidth,
      context.drawingBufferHeight,
    );
    s.depth.update(
      context,
      context.drawingBufferWidth,
      context.drawingBufferHeight,
    );
    const logDepth = scene.frameState.useLogDepth;
    if (!s.copyDepth || s.logDepth !== logDepth) {
      s.copyDepth?.shaderProgram.destroy();
      s.copyDepth = context.createViewportQuadCommand(
        new ShaderSource({
          defines: logDepth ? ["LOG_DEPTH_READ_ONLY"] : [],
          sources: [depth],
        }),
        { uniformMap: { u_depth: () => s.raw.getDepthStencilTexture() } },
      );
      s.logDepth = logDepth;
    }
    const us = context.uniformState;
    const oldFramebuffer = passState.framebuffer;
    const oldPass = us.pass;
    s.captureDraws = 0;
    try {
      passState.framebuffer = s.raw.framebuffer;
      s.clear.execute(context, passState);
      passState.framebuffer = s.depth.framebuffer;
      s.clearColor.execute(context, passState);
      for (let i = ranges.length - 1; i >= 0; --i) {
        const range = ranges[i];
        frustum.near =
          i === 0 ? range.near : range.near * scene.opaqueFrustumNearOffset;
        frustum.far = range.far;
        us.updateFrustum(frustum);
        passState.framebuffer = s.raw.framebuffer;
        s.clearDepth.execute(context, passState);
        for (const pass of passes) {
          us.updatePass(pass);
          for (let j = 0; j < range.indices[pass]; ++j) {
            const command = range.commands[pass][j];
            if (
              !SceneGISWaterFrame.isWater(command) &&
              command.renderState?.depthTest.enabled &&
              command.renderState.depthMask &&
              !command.framebuffer
            ) {
              executeCommand(command, scene, passState);
              ++s.captureDraws;
            }
          }
        }
        passState.framebuffer = s.depth.framebuffer;
        s.copyDepth.execute(context, passState);
      }
      s.colorTexture = s.raw.getColorTexture();
      s.colorTexture.generateMipmap();
      s.colorTexture.sampler = sampler;
      s.depthTexture = s.depth.getColorTexture();
      s.borrowed = false;
      s.ready = true;
    } finally {
      passState.framebuffer = oldFramebuffer;
      us.updateFrustum(scene.camera.frustum);
      us.updatePass(oldPass);
    }
  },
  draw(scene, passState, range, executeCommand) {
    const s = scene.frameState._sceneGISWater;
    if (!s?.ready || !scene.frameState.passes.render) {
      return;
    }
    s.drawing = true;
    try {
      scene.context.uniformState.updatePass(Pass.OPAQUE);
      for (let i = 0; i < range.indices[Pass.OPAQUE]; ++i) {
        const command = range.commands[Pass.OPAQUE][i];
        if (SceneGISWaterFrame.isWater(command)) {
          executeCommand(command, scene, passState);
        }
      }
    } finally {
      s.drawing = false;
    }
  },
  destroy(scene) {
    const s = scene.frameState._sceneGISWater;
    s?.raw?.destroy();
    s?.depth?.destroy();
    s?.copyDepth?.shaderProgram.destroy();
    scene.frameState._sceneGISWater = undefined;
  },
};
export default SceneGISWaterFrame;
