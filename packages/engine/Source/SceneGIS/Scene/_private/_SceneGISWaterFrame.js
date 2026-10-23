import PixelFormat from "../../../Core/PixelFormat.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";

const sampler = new Sampler({
  minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});

function hasVisibleWater(ranges) {
  for (const range of ranges) {
    for (let i = 0; i < range.indices[Pass.OPAQUE]; ++i) {
      if (SceneGISWaterFrame.isWater(range.commands[Pass.OPAQUE][i])) {
        return true;
      }
    }
  }
  return false;
}

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
    });
  },
  prepare(scene) {
    const state = SceneGISWaterFrame.get(scene.frameState);
    state.hdr = scene._hdr;
    state.world = scene.world;
    state.ellipsoid = scene.ellipsoid;
    state.near = scene.camera.frustum.near;
    state.surfaces.length = 0;
    state.ready = false;
    state.captureDraws = 0;
    state.borrowed = false;
    if (state.finalDepth) {
      state.finalDepth.captured = false;
    }
  },
  releaseFinalDepth(scene) {
    const water = scene.frameState._sceneGISWater;
    const state = water?.finalDepth;
    if (state) {
      state.waterFramebuffer?.destroy();
      state.depth.destroy();
      state.copyDepth?.shaderProgram.destroy();
      water.finalDepth = undefined;
    }
  },
  updateFinalDepth(scene) {
    const ranges = scene._view.frustumCommandsList;
    const needed =
      ((ranges.length > 1 &&
        scene._sceneGISEnvironmentEffectsPipeline?.needsSceneDepth) ||
        ranges.some((range) => range.indices[Pass.VOXELS] > 0)) &&
      !scene._sceneGISTemporalAntialiasing?._state?.active &&
      hasVisibleWater(ranges);
    if (!needed) {
      SceneGISWaterFrame.releaseFinalDepth(scene);
      return;
    }
    const water = SceneGISWaterFrame.get(scene.frameState);
    const state = (water.finalDepth ??= {
      depth: new FramebufferManager({
        pixelFormat: PixelFormat.RED,
        pixelDatatype: PixelDatatype.FLOAT,
      }),
      waterCommands: new WeakMap(),
    });
    const {
      context,
      drawingBufferWidth: width,
      drawingBufferHeight: height,
    } = scene;
    if (state.depth.isDirty(width, height, 1)) {
      state.waterFramebuffer?.destroy();
      state.waterFramebuffer = undefined;
      state.depth.update(context, width, height);
    }
    state.byteLength = width * height * 4;
  },
  captureFinalDepth(scene) {
    const state = scene.frameState._sceneGISWater?.finalDepth;
    if (!state || !scene._sceneGISDeferred?.ready) {
      return;
    }
    state.sourceDepth = scene._sceneGISDeferred._linearDepth;
    state.copyDepth ??= scene.context.createViewportQuadCommand(
      "uniform sampler2D u_depth; void main() { out_FragColor = texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0); }",
      { uniformMap: { u_depth: () => state.sourceDepth } },
    );
    state.copyDepth.framebuffer = state.depth.framebuffer;
    state.copyDepth.execute(scene.context);
    state.captured = true;
  },
  waterCommand(scene, command, passState) {
    const water = scene.frameState._sceneGISWater;
    if (!water?.drawing || !SceneGISWaterFrame.isWater(command)) {
      return command;
    }
    const temporal = scene._sceneGISTemporalAntialiasing?._state;
    const state =
      temporal?.active && temporal.deferredCaptured
        ? temporal
        : water.finalDepth?.captured
          ? water.finalDepth
          : undefined;
    if (!state) {
      return command;
    }
    const source = passState.framebuffer;
    if (!state.waterFramebuffer || state.waterSource !== source) {
      state.waterFramebuffer?.destroy();
      state.waterFramebuffer = new Framebuffer({
        context: scene.context,
        colorTextures: [
          source.getColorTexture(0),
          state.depth.getColorTexture(),
        ],
        depthStencilTexture: source.depthStencilTexture,
        destroyAttachments: false,
      });
      state.waterSource = source;
    }
    const shader = command.shaderProgram;
    let program = scene.context.shaderCache.getDerivedShaderProgram(
      shader,
      "sceneGIS_water_final_depth",
    );
    if (!program) {
      const fs = shader.fragmentShaderSource.clone();
      fs.sources = fs.sources.map((s) =>
        ShaderSource.replaceMain(s, "sceneGISFinalWaterMain"),
      );
      fs.sources.push(
        "layout(location = 1) out float sceneGISFinalWaterDepth; void main() { sceneGISFinalWaterMain(); sceneGISFinalWaterDepth = -v_positionEC.z; }",
      );
      program = scene.context.shaderCache.createDerivedShaderProgram(
        shader,
        "sceneGIS_water_final_depth",
        {
          vertexShaderSource: shader.vertexShaderSource,
          fragmentShaderSource: fs,
          attributeLocations: shader._attributeLocations,
        },
      );
    }
    const derived = DrawCommand.shallowClone(
      command,
      state.waterCommands.get(command),
    );
    state.waterCommands.set(command, derived);
    derived.shaderProgram = program;
    derived.framebuffer = state.waterFramebuffer;
    return derived;
  },
  defer(scene, command) {
    return (
      SceneGISWaterFrame.isWater(command) &&
      !scene.frameState._sceneGISWater?.drawing
    );
  },
  capture(scene) {
    const s = scene.frameState._sceneGISWater;
    if (!s?.surfaces.length || !scene.frameState.passes.render) {
      return;
    }
    const ranges = scene._view.frustumCommandsList;
    if (!hasVisibleWater(ranges)) {
      return;
    }
    const deferred = scene._sceneGISDeferred;
    if (deferred?._active) {
      return;
    }
    if (deferred?.ready && deferred._waterReady) {
      s.colorTexture = deferred._waterColor.getColorTexture();
      s.colorTexture.generateMipmap();
      s.colorTexture.sampler = sampler;
      s.depthTexture = deferred._linearDepth;
      s.borrowed = true;
      s.ready = true;
      return;
    }
    const ssr = scene._sceneGISScreenSpaceReflections;
    const ssil = scene._sceneGISScreenSpaceIndirectLighting;
    const ao =
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
    // Main-pass inputs are published after opaque drawing, before water composition.
    if (
      (ssr?.enabled && ssr._state?.mainActive) ||
      ao.mainActive ||
      (ssil?.enabled && ssil._state?.mainActive)
    ) {
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
    if (ao.mainPass && ao.ready && ao.main?.needsRadiance) {
      s.colorTexture = ao.radianceTexture;
      s.colorTexture.generateMipmap();
      s.colorTexture.sampler = sampler;
      s.depthTexture = ao.sourceDepth;
      s.borrowed = true;
      s.ready = true;
      return;
    }
    if (
      ssil?.ready &&
      ssil._state.shared === ssil._state &&
      ssil._state.main?.needsRadiance
    ) {
      s.colorTexture = ssil._state.radianceTexture;
      s.colorTexture.generateMipmap();
      s.colorTexture.sampler = sampler;
      s.depthTexture = ssil._state.depth.getColorTexture();
      s.borrowed = true;
      s.ready = true;
      return;
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
          command.owner._prepareWaterSurface?.(scene, passState);
          executeCommand(command, scene, passState);
        }
      }
    } finally {
      s.drawing = false;
    }
  },
  destroy(scene) {
    SceneGISWaterFrame.releaseFinalDepth(scene);
    scene.frameState._sceneGISWater = undefined;
  },
};
export default SceneGISWaterFrame;
