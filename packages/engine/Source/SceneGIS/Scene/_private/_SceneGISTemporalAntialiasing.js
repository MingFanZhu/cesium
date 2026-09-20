import Cartesian2 from "../../../Core/Cartesian2.js";
import Color from "../../../Core/Color.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import depthShader from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODepth.js";
import resolveShader from "../../../Shaders/SceneGIS/Antialiasing/SceneGISTemporalResolve.js";

function halton(index, base) {
  let value = 0;
  let scale = 1;
  while (index > 0) {
    scale /= base;
    value += scale * (index % base);
    index = Math.floor(index / base);
  }
  return value;
}

function historyTarget(context, width, height) {
  return new Framebuffer({
    context,
    colorTextures: [
      new Texture({
        context,
        width,
        height,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        sampler: Sampler.LINEAR,
      }),
      new Texture({
        context,
        width,
        height,
        pixelFormat: PixelFormat.RED,
        pixelDatatype: PixelDatatype.FLOAT,
        sampler: Sampler.NEAREST,
      }),
    ],
  });
}

function allocate(effect) {
  const scene = effect._scene;
  const context = scene.context;
  let state = effect._state;
  if (!state) {
    state = effect._state = {
      valid: false,
      active: false,
      sample: 0,
      index: 0,
      jitter: new Cartesian2(),
      projection: new Matrix4(),
      inverseProjection: new Matrix4(),
      previousProjection: new Matrix4(),
      previousView: new Matrix4(),
      previousFromCurrent: new Matrix4(),
      depth: new FramebufferManager({
        pixelFormat: PixelFormat.RED,
        pixelDatatype: PixelDatatype.FLOAT,
      }),
      clear: new ClearCommand({ color: Color.TRANSPARENT }),
      history: [],
    };
    state.resolve = context.createViewportQuadCommand(resolveShader, {
      owner: effect,
      uniformMap: {
        u_color: () => state.color,
        u_depth: () => state.depth.getColorTexture(),
        u_history: () => state.history[1 - state.index].getColorTexture(0),
        u_historyDepth: () => state.history[1 - state.index].getColorTexture(1),
        u_inverseProjection: () => state.inverseProjection,
        u_previousProjection: () => state.previousProjection,
        u_previousFromCurrent: () => state.previousFromCurrent,
        u_historyWeight: () => effect.historyWeight,
        u_jitter: () => state.jitter,
        u_valid: () => state.valid,
      },
    });
  }
  const width = context.drawingBufferWidth;
  const height = context.drawingBufferHeight;
  if (width !== state.width || height !== state.height) {
    for (const buffer of state.history) {
      buffer.destroy();
    }
    state.history = [
      historyTarget(context, width, height),
      historyTarget(context, width, height),
    ];
    state.depth.update(context, width, height);
    state.width = width;
    state.height = height;
    state.valid = false;
    state.sample = 0;
  }
  const logDepth = scene.frameState.useLogDepth;
  if (!state.copyDepth || state.logDepth !== logDepth) {
    state.copyDepth?.shaderProgram.destroy();
    state.copyDepth = context.createViewportQuadCommand(
      new ShaderSource({
        defines: logDepth ? ["LOG_DEPTH_READ_ONLY"] : [],
        sources: [depthShader],
      }),
      { owner: effect, uniformMap: { u_depth: () => state.sourceDepth } },
    );
    state.logDepth = logDepth;
    state.valid = false;
  }
  return state;
}

/** Scene-owned temporal resolve. No geometry submission or borrowed history. @private */
const SceneGISTemporalAntialiasing = {};

SceneGISTemporalAntialiasing.capturePickJitter = function (scene, pickDepth) {
  const jitter = scene.context.uniformState._sceneGISProjectionJitter;
  if (!jitter && !pickDepth._sceneGISPixelJitter) {
    return;
  }
  const pixels = pickDepth._sceneGISPixelJitter ?? new Cartesian2();
  pixels.x = jitter ? jitter.x * scene.drawingBufferWidth * 0.5 : 0;
  pixels.y = jitter ? jitter.y * scene.drawingBufferHeight * 0.5 : 0;
  pickDepth._sceneGISPixelJitter = pixels;
};

SceneGISTemporalAntialiasing.pickCoordinates = function (pickDepth, position) {
  const jitter = pickDepth._sceneGISPixelJitter;
  if (jitter) {
    Cartesian2.subtract(position, jitter, position);
  }
};

SceneGISTemporalAntialiasing.prepare = function (scene) {
  const effect = scene._sceneGISTemporalAntialiasing;
  if (!effect?.enabled) {
    return;
  }
  effect._validate();
  effect._ready = false;
};

SceneGISTemporalAntialiasing.begin = function (scene) {
  const effect = scene._sceneGISTemporalAntialiasing;
  if (
    !effect?.enabled ||
    !scene.frameState.passes.render ||
    scene.frameState.passes.pick
  ) {
    return;
  }
  const state = allocate(effect);
  const projection = scene.camera.frustum.projectionMatrix;
  if (!Matrix4.equals(projection, state.projection)) {
    state.valid = false;
  }
  Matrix4.clone(projection, state.projection);
  Matrix4.inverse(projection, state.inverseProjection);
  // Multiplication in JS doubles preserves camera-relative precision in ECEF worlds.
  Matrix4.multiply(
    state.previousView,
    scene.camera.inverseViewMatrix,
    state.previousFromCurrent,
  );
  const sample = state.sample + 1;
  state.jitter.x = (2 * (halton(sample, 2) - 0.5)) / state.width;
  state.jitter.y = (2 * (halton(sample, 3) - 0.5)) / state.height;
  state.active = true;
  scene.context.uniformState._sceneGISProjectionJitter = state.jitter;
  scene.context.uniformState.updateCamera(scene.camera);
  state.depth.clear(scene.context, state.clear);
};

SceneGISTemporalAntialiasing.captureDepth = function (scene) {
  const state = scene._sceneGISTemporalAntialiasing?._state;
  if (!state?.active) {
    return;
  }
  const view = scene._view;
  const manager = scene._environmentState.useGlobeDepthFramebuffer
    ? view.globeDepth.colorFramebufferManager
    : view.sceneFramebuffer._colorFramebuffer;
  manager.prepareTextures(scene.context);
  state.sourceDepth = manager.getDepthStencilTexture();
  state.copyDepth.framebuffer = state.depth.framebuffer;
  state.copyDepth.execute(scene.context);
};

SceneGISTemporalAntialiasing.resolve = function (scene, color) {
  const effect = scene._sceneGISTemporalAntialiasing;
  const state = effect?._state;
  if (!state?.active) {
    return color;
  }
  state.color = color;
  state.resolve.framebuffer = state.history[state.index];
  state.resolve.execute(scene.context);
  const result = state.history[state.index].getColorTexture(0);
  Matrix4.clone(state.projection, state.previousProjection);
  Matrix4.clone(scene.camera.viewMatrix, state.previousView);
  state.index = 1 - state.index;
  state.sample = (state.sample + 1) % 8;
  state.valid = true;
  effect._ready = true;
  return result;
};

SceneGISTemporalAntialiasing.end = function (scene) {
  const state = scene._sceneGISTemporalAntialiasing?._state;
  if (!state?.active) {
    return;
  }
  state.active = false;
  if (!scene._sceneGISTemporalAntialiasing._ready) {
    state.valid = false;
  }
  scene.context.uniformState._sceneGISProjectionJitter = undefined;
  scene.context.uniformState.updateCamera(scene.camera);
};

SceneGISTemporalAntialiasing.destroy = function (effect) {
  const state = effect._state;
  if (!state) {
    return;
  }
  SceneGISTemporalAntialiasing.end(effect._scene);
  state.depth.destroy();
  for (const buffer of state.history) {
    buffer.destroy();
  }
  state.resolve.shaderProgram.destroy();
  state.copyDepth?.shaderProgram.destroy();
  effect._state = undefined;
  effect._ready = false;
};

export default SceneGISTemporalAntialiasing;
