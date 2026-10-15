import Color from "../../../Core/Color.js";
import combine from "../../../Core/combine.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import capture from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredCapture.js";
import lighting from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredPointEDL.js";

function register(processor, frameState, start) {
  let registration = frameState._sceneGISPointEDL;
  if (!registration) {
    registration = frameState._sceneGISPointEDL = { commands: new Map() };
  }
  if (registration.frameNumber !== frameState.frameNumber) {
    registration.commands.clear();
    registration.frameNumber = frameState.frameNumber;
  }
  const commands = frameState.commandList;
  for (let i = start; i < commands.length; ++i) {
    const command = commands[i];
    if (
      command.primitiveType === PrimitiveType.POINTS &&
      command.pass !== Pass.TRANSLUCENT
    ) {
      registration.commands.set(command, processor);
    }
  }
}

function releaseProcessor(processor) {
  const state = processor._sceneGISDeferredEDL;
  state?.depth.destroy();
  processor._sceneGISDeferredEDL = undefined;
}

function prepare(renderer, ranges) {
  const scene = renderer._scene;
  const registration = scene.frameState._sceneGISPointEDL;
  const states = (renderer._pointEDLStates ??= new Map());
  const owners = (renderer._pointEDLOwners ??= new Map());
  owners.clear();
  renderer.pointEDLDrawCount = renderer.pointEDLByteLength = 0;
  for (const state of states.values()) {
    state.commands.clear();
  }
  if (registration?.frameNumber === scene.frameState.frameNumber) {
    for (const range of ranges) {
      for (const pass of [Pass.OPAQUE, Pass.CESIUM_3D_TILE]) {
        for (let i = 0; i < range.indices[pass]; ++i) {
          const command = range.commands[pass][i];
          const processor = registration.commands.get(command);
          if (
            !processor ||
            (scene.debugCommandFilter && !scene.debugCommandFilter(command))
          ) {
            continue;
          }
          let state = states.get(processor);
          if (!state) {
            state = {
              processor,
              commands: new Set(),
              derived: new WeakMap(),
              depth: new FramebufferManager({
                pixelFormat: PixelFormat.RED,
                pixelDatatype: PixelDatatype.FLOAT,
                depthStencil: true,
                supportsDepthTexture: true,
              }),
              clear: new ClearCommand({
                color: Color.TRANSPARENT,
                depth: 1,
                stencil: 0,
              }),
            };
            states.set(processor, state);
            processor._sceneGISDeferredEDL = state;
          }
          state.commands.add(command);
          owners.set(command.owner, state);
        }
      }
    }
  }
  for (const [processor, state] of states) {
    if (state.commands.size === 0 || processor.isDestroyed()) {
      if (!processor.isDestroyed()) {
        releaseProcessor(processor);
      }
      states.delete(processor);
    }
  }
  registration?.commands.clear();
}

function depthCommand(state, command, context) {
  let cached = state.derived.get(command);
  if (!cached || cached.source !== command.shaderProgram) {
    const source = command.shaderProgram;
    const key = "sceneGIS_point_edl_depth";
    let shader = context.shaderCache.getDerivedShaderProgram(source, key);
    if (!shader) {
      const vs = source.vertexShaderSource.clone();
      const fs = source.fragmentShaderSource.clone();
      const model = fs.sources.some((s) =>
        s.includes("SCENEGIS_GBUFFER_MODEL"),
      );
      const point = fs.sources.some((s) =>
        s.includes("#define SCENEGIS_DEFERRED_POINT_MATERIAL"),
      );
      fs.defines.push("HDR", "SCENEGIS_DEFERRED_EXTENSION_ONLY");
      if (model) {
        fs.defines.push(
          "SCENEGIS_DEFERRED_CAPTURE",
          "CESIUM_REDIRECTED_COLOR_OUTPUT",
        );
      } else if (point) {
        fs.defines.push("SCENEGIS_DEFERRED_POINT_CAPTURE");
        vs.defines.push("SCENEGIS_DEFERRED_POINT_CAPTURE");
      }
      vs.sources = vs.sources.map((s) =>
        ShaderSource.replaceMain(s, "sceneGISPointDepthVertex"),
      );
      vs.sources.push(`out float v_sceneGISPointDepth;
void main() {
    sceneGISPointDepthVertex();
    v_sceneGISPointDepth = czm_orthographicIn3D == 1.0
        ? mix(czm_currentFrustum.x, czm_currentFrustum.y, 0.5 * (gl_Position.z / gl_Position.w + 1.0))
        : gl_Position.w;
    // Keep window coordinates valid for native clipping-plane reconstruction.
    // The fragment shader writes precise full-view logarithmic depth.
    gl_Position.z = clamp(gl_Position.z / gl_Position.w, -1.0, 1.0) * gl_Position.w;
}`);
      fs.sources = fs.sources.map((s) =>
        ShaderSource.replaceMain(s, "sceneGISPointDepthFragment"),
      );
      if (model || point) {
        fs.sources.push(capture);
      }
      fs.sources.push(`in float v_sceneGISPointDepth;
void main() {
    sceneGISPointDepthFragment();
    if (v_sceneGISPointDepth < czm_currentFrustum.x || v_sceneGISPointDepth > czm_currentFrustum.y) { discard; }
    out_FragColor = vec4(v_sceneGISPointDepth, 0.0, 0.0, 1.0);
    gl_FragDepth = log2(1.0 + v_sceneGISPointDepth - czm_currentFrustum.x) / log2(1.0 + czm_currentFrustum.y - czm_currentFrustum.x);
}`);
      shader = context.shaderCache.createDerivedShaderProgram(source, key, {
        vertexShaderSource: vs,
        fragmentShaderSource: fs,
        attributeLocations: source._attributeLocations,
      });
    }
    cached = { source, shader, command: new DrawCommand() };
    state.derived.set(command, cached);
  }
  const derived = DrawCommand.shallowClone(command, cached.command);
  derived.shaderProgram = cached.shader;
  if (cached.sourceRenderState !== command.renderState) {
    const options = RenderState.getState(command.renderState);
    options.stencilTest.enabled = false;
    cached.renderState = RenderState.fromCache(options);
    cached.sourceRenderState = command.renderState;
  }
  derived.renderState = cached.renderState;
  derived.framebuffer = state.depth.framebuffer;
  return derived;
}

function draw(renderer, passState) {
  const scene = renderer._scene;
  const context = scene.context;
  const uniformState = context.uniformState;
  const previousPass = uniformState.pass;
  uniformState.updateFrustum(scene.camera.frustum);
  try {
    for (const state of renderer._pointEDLStates.values()) {
      state.depth.update(
        context,
        scene.drawingBufferWidth,
        scene.drawingBufferHeight,
      );
      state.depth.clear(context, state.clear, passState);
      renderer.pointEDLByteLength +=
        scene.drawingBufferWidth * scene.drawingBufferHeight * 8;
      for (const command of state.commands) {
        uniformState.updatePass(command.pass);
        depthCommand(state, command, context).execute(context, passState);
        ++renderer.pointEDLDrawCount;
      }
    }
  } finally {
    uniformState.updatePass(previousPass);
  }
}

function release(renderer) {
  for (const processor of renderer._pointEDLStates?.keys() ?? []) {
    if (!processor.isDestroyed()) {
      releaseProcessor(processor);
    }
  }
  renderer._pointEDLStates?.clear();
  renderer._pointEDLOwners?.clear();
  renderer.pointEDLDrawCount = renderer.pointEDLByteLength = 0;
}

function uniforms(state, map) {
  return combine(map, {
    u_sceneGISPointDepth: () => state.depth.getColorTexture(),
    u_sceneGISPointRadius: () => state.processor._radius,
    u_sceneGISPointStrength: () => state.processor._strength,
  });
}

/** Private point-depth ownership and EDL integration. @private */
export default {
  register,
  releaseProcessor,
  prepare,
  draw,
  release,
  uniforms,
  lighting,
};
