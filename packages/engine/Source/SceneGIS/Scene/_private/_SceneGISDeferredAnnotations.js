import combine from "../../../Core/combine.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import RenderState from "../../../Renderer/RenderState.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import DeferredLayout from "./_SceneGISDeferredLayout.js";

function splitCommand(renderer, source, translucent, cached) {
  const context = renderer._scene.context;
  const shader = source.shaderProgram;
  const key = translucent
    ? "sceneGIS_annotation_translucent"
    : "sceneGIS_annotation_opaque";
  let program = context.shaderCache.getDerivedShaderProgram(shader, key);
  if (!program) {
    const fs = shader.fragmentShaderSource.clone();
    // Reuse the native alpha cutoff and SDF coverage calculation.
    fs.defines.push(translucent ? "TRANSLUCENT" : "OPAQUE");
    if (translucent) {
      fs.sources = fs.sources.map((s) =>
        ShaderSource.replaceMain(s, "sceneGISAnnotationMain"),
      );
      fs.sources.push(`
        uniform sampler2D u_sceneGISAnnotationSurface;
        uniform float u_sceneGISAnnotationTag;
        uniform bool u_sceneGISAnnotationMulti;
        void main() {
          if (u_sceneGISAnnotationMulti) {
            vec2 surface = texelFetch(u_sceneGISAnnotationSurface, ivec2(gl_FragCoord.xy), 0).rg;
            if (surface.x > 0.0 && abs(surface.y) < u_sceneGISAnnotationTag) { discard; }
          }
          sceneGISAnnotationMain();
        }
      `);
    }
    program = context.shaderCache.createDerivedShaderProgram(shader, key, {
      vertexShaderSource: shader.vertexShaderSource,
      fragmentShaderSource: fs,
      attributeLocations: shader._attributeLocations,
    });
  }
  const command = DrawCommand.shallowClone(source, cached.command);
  command.shaderProgram = program;
  if (cached.sourceState !== source.renderState) {
    const rs = RenderState.getState(source.renderState);
    rs.depthMask = !translucent;
    rs.blending.enabled = translucent;
    cached.renderState = RenderState.fromCache(rs);
    cached.sourceState = source.renderState;
  }
  command.renderState = cached.renderState;
  command.pass = translucent ? Pass.TRANSLUCENT : Pass.OPAQUE;
  if (translucent) {
    if (cached.sourceUniforms !== source.uniformMap) {
      cached.uniformMap = combine(source.uniformMap, {
        u_sceneGISAnnotationSurface: () => renderer.opaqueDepthTexture,
        u_sceneGISAnnotationTag: () => renderer._annotations.tag,
        u_sceneGISAnnotationMulti: () => renderer._multiFrustum,
      });
      cached.sourceUniforms = source.uniformMap;
    }
    command.uniformMap = cached.uniformMap;
  }
  return command;
}

function prepareCommands(renderer) {
  const { passes, commandList } = renderer._scene.frameState;
  if (!passes.render || passes.pick || passes.depth || passes.pickVoxel) {
    return;
  }
  const cache = (renderer._annotationCommands ??= new WeakMap());
  const length = commandList.length;
  for (let i = 0; i < length; ++i) {
    const command = commandList[i];
    if (
      !DeferredLayout.isAnnotation(command) ||
      !command.renderState.blending.enabled
    ) {
      continue;
    }
    let pair = cache.get(command);
    if (!pair) {
      pair = [{ command: new DrawCommand() }, { command: new DrawCommand() }];
      cache.set(command, pair);
    }
    commandList[i] = splitCommand(renderer, command, false, pair[0]);
    commandList.push(splitCommand(renderer, command, true, pair[1]));
  }
}

function finalDepth(scene) {
  const temporal = scene._sceneGISTemporalAntialiasing?._state;
  if (temporal?.active && temporal.deferredCaptured) {
    return temporal.depth.getColorTexture();
  }
  const water = scene.frameState._sceneGISWater?.finalDepth;
  return water?.captured ? water.depth.getColorTexture() : undefined;
}

function release(renderer) {
  const state = renderer._annotations;
  if (!state) {
    return;
  }
  state.framebuffer?.destroy();
  state.depth.destroy();
  state.copy?.shaderProgram.destroy();
  renderer._annotations = undefined;
}

function update(renderer, ranges) {
  renderer.annotationDrawCount = renderer.annotationDepthCopyCount = 0;
  const needed = ranges.some((range) => {
    for (let i = 0; i < range.indices[Pass.OPAQUE]; ++i) {
      if (DeferredLayout.isAnnotation(range.commands[Pass.OPAQUE][i])) {
        return true;
      }
    }
    return false;
  });
  if (!needed) {
    release(renderer);
    return;
  }
  const multi = renderer._multiFrustum;
  if (renderer._annotations?.multi !== multi) {
    release(renderer);
  }
  const state = (renderer._annotations ??= {
    multi,
    depth: new FramebufferManager({
      pixelFormat: multi ? PixelFormat.RG : PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
    }),
    commands: new WeakMap(),
  });
  const scene = renderer._scene;
  const width = scene.drawingBufferWidth,
    height = scene.drawingBufferHeight;
  if (state.depth.isDirty(width, height, 1)) {
    state.framebuffer?.destroy();
    state.framebuffer = undefined;
    state.depth.update(scene.context, width, height);
  }
  state.ready = false;
  state.byteLength = width * height * (multi ? 8 : 4);
  renderer.byteLength += state.byteLength;
}

function captureDepth(renderer, passState) {
  const state = renderer._annotations;
  if (!state || !renderer.ready) {
    return;
  }
  const context = renderer._scene.context;
  state.copy ??= context.createViewportQuadCommand(
    "uniform sampler2D u_depth; void main() { out_FragColor = texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0); }",
    { uniformMap: { u_depth: () => renderer._linearDepth } },
  );
  state.copy.framebuffer = state.depth.framebuffer;
  state.copy.execute(context, passState);
  state.ready = true;
  ++renderer.annotationDepthCopyCount;
}

function execute(renderer, command, passState) {
  const state = renderer._annotations,
    scene = renderer._scene,
    context = scene.context;
  const source = passState.framebuffer,
    final = finalDepth(scene);
  const color = source.getColorTexture(0),
    hardwareDepth = source.depthStencilTexture;
  if (
    !state.framebuffer ||
    state.color !== color ||
    state.hardwareDepth !== hardwareDepth ||
    state.final !== final
  ) {
    state.framebuffer?.destroy();
    const colors = [color, state.depth.getColorTexture()];
    if (final) {
      colors.push(final);
    }
    state.framebuffer = new Framebuffer({
      context,
      colorTextures: colors,
      depthStencilTexture: hardwareDepth,
      destroyAttachments: false,
    });
    state.color = color;
    state.hardwareDepth = hardwareDepth;
    state.final = final;
  }
  const shader = command.shaderProgram;
  const key = `sceneGIS_annotation_depth_${state.multi}_${!!final}`;
  let program = context.shaderCache.getDerivedShaderProgram(shader, key);
  if (!program) {
    const fs = shader.fragmentShaderSource.clone();
    fs.sources = fs.sources.map((s) =>
      ShaderSource.replaceMain(s, "sceneGISAnnotationDepthMain"),
    );
    fs.sources.push(`
      uniform sampler2D u_sceneGISAnnotationMaterialDepth;
      uniform float u_sceneGISAnnotationDepthTag;
      layout(location=1) out vec4 sceneGISAnnotationDepth;
      ${final ? "layout(location=2) out vec4 sceneGISAnnotationFinalDepth;" : ""}
      void main() {
        ${
          state.multi
            ? `
          vec2 surface = texelFetch(u_sceneGISAnnotationMaterialDepth, ivec2(gl_FragCoord.xy), 0).rg;
          if (surface.x > 0.0 && surface.y < u_sceneGISAnnotationDepthTag) { discard; }
        `
            : ""
        }
        #ifdef LOG_DEPTH
        // Native depth-disabled billboards move to the near plane and skip their explicit depth writer.
        gl_FragDepth = 0.0;
        #endif
        sceneGISAnnotationDepthMain();
        #ifdef LOG_DEPTH
        vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, gl_FragDepth);
        #else
        vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord);
        #endif
        float depth = -eye.z / eye.w;
        sceneGISAnnotationDepth = vec4(depth, -u_sceneGISAnnotationDepthTag, 0.0, 1.0);
        ${final ? "sceneGISAnnotationFinalDepth = vec4(depth, 0.0, 0.0, 1.0);" : ""}
      }
    `);
    program = context.shaderCache.createDerivedShaderProgram(shader, key, {
      vertexShaderSource: shader.vertexShaderSource,
      fragmentShaderSource: fs,
      attributeLocations: shader._attributeLocations,
    });
  }
  let cached = state.commands.get(command);
  if (!cached) {
    cached = { command: new DrawCommand() };
    state.commands.set(command, cached);
  }
  const derived = DrawCommand.shallowClone(command, cached.command);
  if (cached.sourceUniforms !== command.uniformMap) {
    cached.uniformMap = combine(command.uniformMap, {
      u_sceneGISAnnotationMaterialDepth: () => renderer._linearDepth,
      u_sceneGISAnnotationDepthTag: () => state.tag,
    });
    cached.sourceUniforms = command.uniformMap;
  }
  derived.uniformMap = cached.uniformMap;
  derived.shaderProgram = program;
  // Only opaque coverage reaches this framebuffer, so FLOAT outputs never require float blending.
  derived.framebuffer = state.framebuffer;
  derived.execute(context, passState);
  ++renderer.annotationDrawCount;
}

function draw(renderer, range, index, passState, executeCommand) {
  const state = renderer._annotations;
  if (!state?.ready) {
    return;
  }
  const scene = renderer._scene;
  state.tag = index + 1;
  state.drawing = true;
  const pass = scene.context.uniformState.pass;
  try {
    scene.context.uniformState.updatePass(Pass.OPAQUE);
    for (let i = 0; i < range.indices[Pass.OPAQUE]; ++i) {
      const command = range.commands[Pass.OPAQUE][i];
      if (DeferredLayout.isAnnotation(command)) {
        executeCommand(command, scene, passState);
      }
    }
  } finally {
    state.drawing = false;
    scene.context.uniformState.updatePass(pass);
  }
}

/** Independent solid annotation colors and native transparent composition. @private */
const _SceneGISDeferredAnnotations = {
  release,
  prepareCommands,
  update,
  captureDepth,
  execute,
  draw,
};
export default _SceneGISDeferredAnnotations;
