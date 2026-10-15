import Color from "../../../Core/Color.js";
import combine from "../../../Core/combine.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import DepthFunction from "../../../Scene/DepthFunction.js";
import indirect from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOMain.js";
import DeferredLayout from "./_SceneGISDeferredLayout.js";

const opaquePasses = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];

function enabled(scene) {
  return (
    scene.debugShowCommands ||
    scene.debugShowFrustums ||
    scene.shadowMap.debugCascadeColors
  );
}

function color(scene, command, result) {
  Color.clone(Color.WHITE, result);
  if (scene.debugShowCommands) {
    command._debugColor ??= Color.fromRandom();
    Color.clone(command._debugColor, result);
  }
  if (scene.debugShowFrustums) {
    const mask = command.debugOverlappingFrustums;
    result.red *= (mask & 1) !== 0 ? 1 : 0;
    result.green *= (mask & 2) !== 0 ? 1 : 0;
    result.blue *= (mask & 4) !== 0 ? 1 : 0;
  }
  result.alpha = 1;
  return result;
}

function release(renderer) {
  const state = renderer._debugTint;
  state?.framebuffer?.destroy();
  state?.target.destroy();
  state?.merge?.shaderProgram.destroy();
  renderer._debugTint = undefined;
  renderer.debugTintByteLength = 0;
}

function update(renderer, ranges, passState) {
  renderer.debugTintDrawCount = renderer.debugTintScreenCount = 0;
  const scene = renderer._scene;
  if (!enabled(scene)) {
    release(renderer);
    return;
  }
  const visible = ranges.some((range) =>
    opaquePasses.some((pass) =>
      range.commands[pass]
        .slice(0, range.indices[pass])
        .some(
          (command) =>
            !(command instanceof ClearCommand) &&
            !DeferredLayout.isDebugOverlay(command) &&
            command.renderState.depthMask &&
            command.owner?._sceneGISWater !== true &&
            !DeferredLayout.isAnnotation(command) &&
            !DeferredLayout.isGlobeDepth(command) &&
            (!scene.debugCommandFilter || scene.debugCommandFilter(command)),
        ),
    ),
  );
  if (!visible) {
    release(renderer);
    return;
  }
  let state = renderer._debugTint;
  const context = scene.context;
  if (!state) {
    state = renderer._debugTint = {
      target: new FramebufferManager({
        pixelDatatype: PixelDatatype.HALF_FLOAT,
      }),
      commands: new WeakMap(),
      lights: new WeakMap(),
      clear: new ClearCommand({ color: Color.WHITE }),
    };
  }
  state.target.update(
    context,
    scene.drawingBufferWidth,
    scene.drawingBufferHeight,
  );
  const texture = state.target.getColorTexture();
  const depth = renderer._source.depthStencilTexture;
  if (state.texture !== texture || state.depth !== depth) {
    state.framebuffer?.destroy();
    state.framebuffer = new Framebuffer({
      context,
      colorTextures: [texture],
      depthStencilTexture: depth,
      destroyAttachments: false,
    });
    state.texture = texture;
    state.depth = depth;
  }
  state.target.clear(context, state.clear, passState);
  renderer.debugTintByteLength = texture.width * texture.height * 8;
  renderer.byteLength += renderer.debugTintByteLength;
}

function capture(renderer, material, source, inverse, passState) {
  const state = renderer._debugTint;
  const mask = source.renderState.colorMask;
  if (!state || (mask && !mask.red && !mask.green && !mask.blue)) {
    return;
  }
  const context = renderer._scene.context;
  const shader = material.shaderProgram;
  let program = context.shaderCache.getDerivedShaderProgram(
    shader,
    "sceneGIS_debug_tint",
  );
  if (!program) {
    const fs = shader.fragmentShaderSource.clone();
    fs.defines = fs.defines.filter(
      (name) =>
        name !== "SCENEGIS_DEFERRED_EXTENSIONS" &&
        name !== "SCENEGIS_AO_MAIN" &&
        !name.startsWith("SCENEGIS_AO_LOCATION"),
    );
    fs.defines.push("SCENEGIS_DEFERRED_EXTENSION_ONLY");
    fs.sources = fs.sources.filter(
      (source) =>
        (source !== indirect &&
          !source.includes("void sceneGISRecordExtensions(")) ||
        source.includes("void sceneGISWriteDeferredMaterial()"),
    );
    fs.sources[fs.sources.length - 1] = `uniform vec4 u_sceneGISDebugColor;
uniform bool u_sceneGISDebugInverse;
void main() {
  sceneGISDeferredMaterialMain();
  vec3 tint = u_sceneGISDebugColor.rgb;
  #ifdef SCENEGIS_GEOMETRY_SHADOW
  tint *= sceneGISGeometryShadowDebug.rgb;
  #endif
  out_FragColor = u_sceneGISDebugInverse ? vec4(0.0, tint) : vec4(tint, 1.0);
}`;
    program = context.shaderCache.createDerivedShaderProgram(
      shader,
      "sceneGIS_debug_tint",
      {
        vertexShaderSource: shader.vertexShaderSource,
        fragmentShaderSource: fs,
        attributeLocations: shader._attributeLocations,
      },
    );
  }
  let cached = state.commands.get(source);
  if (!cached) {
    cached = { command: new DrawCommand(), color: new Color() };
    state.commands.set(source, cached);
  }
  if (cached.state !== source.renderState) {
    const rs = RenderState.getState(source.renderState);
    rs.depthTest = { enabled: true, func: DepthFunction.EQUAL };
    rs.depthMask = false;
    rs.stencilMask = 0;
    rs.blending.enabled = false;
    rs.colorMask = { red: true, green: true, blue: true, alpha: true };
    cached.renderState = RenderState.fromCache(rs);
    cached.state = source.renderState;
  }
  cached.inverse = inverse;
  if (cached.uniforms !== material.uniformMap) {
    cached.uniforms = material.uniformMap;
    cached.uniformMap = combine(
      {
        u_sceneGISDebugColor: () =>
          color(renderer._scene, source, cached.color),
        u_sceneGISDebugInverse: () => cached.inverse,
      },
      material.uniformMap,
    );
  }
  const command = DrawCommand.shallowClone(material, cached.command);
  command.shaderProgram = program;
  command.renderState = cached.renderState;
  command.uniformMap = cached.uniformMap;
  command.framebuffer = inverse
    ? renderer._inverse._maskView
    : state.framebuffer;
  command.execute(context, passState);
  ++renderer.debugTintDrawCount;
}

function lighting(renderer, command) {
  const state = renderer._debugTint;
  if (!state) {
    return command;
  }
  const context = renderer._scene.context;
  const shader = command.shaderProgram;
  const name = "sceneGIS_debug_lighting";
  let program = context.shaderCache.getDerivedShaderProgram(shader, name);
  if (!program) {
    const fs = shader.fragmentShaderSource.clone();
    fs.sources = fs.sources.map((source) =>
      ShaderSource.replaceMain(source, "sceneGISDebugLightMain"),
    );
    fs.sources.push(`uniform sampler2D u_sceneGISDebugTint;
void main() {
  sceneGISDebugLightMain();
  vec3 tint = texelFetch(u_sceneGISDebugTint, ivec2(gl_FragCoord.xy), 0).rgb;
  out_FragColor.rgb *= tint;
  #ifdef SCENEGIS_AO_MAIN
  sceneGISScaleIndirect(tint);
  #endif
  #ifdef SCENEGIS_SSR_MAIN
  sceneGISSSRScale(tint);
  #endif
  #ifdef SCENEGIS_SSIL_MAIN
  sceneGISSILScale(tint);
  #endif
}`);
    program = context.shaderCache.createDerivedShaderProgram(shader, name, {
      vertexShaderSource: shader.vertexShaderSource,
      fragmentShaderSource: fs,
      attributeLocations: shader._attributeLocations,
    });
  }
  let cached = state.lights.get(command);
  if (!cached || cached.sourceUniforms !== command.uniformMap) {
    cached = {
      command: new DrawCommand(),
      sourceUniforms: command.uniformMap,
      uniformMap: combine(
        { u_sceneGISDebugTint: () => state.target.getColorTexture() },
        command.uniformMap,
      ),
    };
    state.lights.set(command, cached);
  }
  const derived = DrawCommand.shallowClone(command, cached.command);
  derived.shaderProgram = program;
  derived.uniformMap = cached.uniformMap;
  return derived;
}

function merge(renderer, inverse, passState) {
  const state = renderer._debugTint;
  if (!state) {
    return;
  }
  state.merge ??= renderer._scene.context.createViewportQuadCommand(
    "uniform sampler2D u_mask; uniform sampler2D u_depth; uniform sampler2D u_specular; void main() { ivec2 p = ivec2(gl_FragCoord.xy); vec4 mask = texelFetch(u_mask, p, 0); if (mask.r == 0.0 || texelFetch(u_specular, p, 0).a == 0.0) discard; gl_FragDepth = texelFetch(u_depth, p, 0).r; out_FragColor = vec4(mask.gba, 1.0); }",
    {
      uniformMap: inverse._uniforms,
      renderState: RenderState.fromCache({
        depthMask: false,
        depthTest: { enabled: true, func: DepthFunction.EQUAL },
      }),
    },
  );
  state.merge.uniformMap = inverse._uniforms;
  state.merge.framebuffer = state.framebuffer;
  state.merge.execute(renderer._scene.context, passState);
  ++renderer.debugTintScreenCount;
}

function receiver(scene, command) {
  if (
    (!scene.debugShowCommands && !scene.debugShowFrustums) ||
    command.owner === scene._sceneGISDeferred?._inverse
  ) {
    return command;
  }
  const renderer = scene._sceneGISDeferred;
  const commands = (renderer._debugReceivers ??= new WeakMap());
  const key = "sceneGIS_debug_color";
  const shader = command.shaderProgram;
  let program = scene.context.shaderCache.getDerivedShaderProgram(shader, key);
  if (!program) {
    const fs = shader.fragmentShaderSource.clone();
    if (
      fs.sources.some((source) => source.includes("czm_translucent_main();"))
    ) {
      fs.sources = fs.sources.map((source) =>
        source.replace(
          "czm_translucent_main();",
          "czm_translucent_main(); czm_out_FragColor.rgb *= u_sceneGISDebugColor.rgb;",
        ),
      );
      fs.sources.unshift("uniform vec4 u_sceneGISDebugColor;");
    } else {
      fs.sources = fs.sources.map((source) =>
        ShaderSource.replaceMain(source, "sceneGISDebugColorMain"),
      );
      fs.sources.push(
        "uniform vec4 u_sceneGISDebugColor; void main() { sceneGISDebugColorMain(); out_FragColor.rgb *= u_sceneGISDebugColor.rgb; }",
      );
    }
    program = scene.context.shaderCache.createDerivedShaderProgram(
      shader,
      key,
      {
        vertexShaderSource: shader.vertexShaderSource,
        fragmentShaderSource: fs,
        attributeLocations: shader._attributeLocations,
      },
    );
  }
  let cached = commands.get(command);
  if (!cached || cached.sourceUniforms !== command.uniformMap) {
    cached = {
      command: new DrawCommand(),
      color: new Color(),
      sourceUniforms: command.uniformMap,
    };
    cached.uniformMap = combine(
      {
        u_sceneGISDebugColor: () => color(scene, command, cached.color),
      },
      command.uniformMap,
    );
    commands.set(command, cached);
  }
  const derived = DrawCommand.shallowClone(command, cached.command);
  derived.shaderProgram = program;
  derived.uniformMap = cached.uniformMap;
  return derived;
}

/** Optional diagnostic colors after lighting, with bounded owned storage. @private */
export default {
  enabled,
  update,
  capture,
  lighting,
  merge,
  receiver,
  release,
};
