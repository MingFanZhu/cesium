import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";
import common from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRCommon.js";
import hierarchy from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRHierarchy.js";
import trace from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRTrace.js";
import reduce from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRReduce.js";
import temporal from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRTemporal.js";
import reconstruct from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRReconstruct.js";

const mipSampler = new Sampler({
  minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});

function target(context, width, height) {
  return new Framebuffer({
    context,
    colorTextures: [
      PixelDatatype.HALF_FLOAT,
      PixelDatatype.HALF_FLOAT,
      PixelDatatype.FLOAT,
    ].map(
      (pixelDatatype) =>
        new Texture({
          context,
          width,
          height,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype,
          sampler: Sampler.NEAREST,
        }),
    ),
  });
}

function viewport(width, height) {
  return RenderState.fromCache({
    viewport: new BoundingRectangle(0, 0, width, height),
  });
}

function releaseTargets(t) {
  t.raw?.destroy();
  t.history.forEach((buffer) => buffer.destroy());
  t.history.length = 0;
}

/** Owned hierarchical tracing and reflection history, independent of geometry submission. @private */
const SceneGISReflectionTracing = {
  allocate(effect, scene, s) {
    const context = scene.context;
    let t = s.tracing;
    if (!t) {
      t = s.tracing = {
        levels: Array.from(
          { length: 6 },
          () =>
            new FramebufferManager({
              pixelFormat: PixelFormat.RED,
              pixelDatatype: PixelDatatype.FLOAT,
            }),
        ),
        history: [],
        index: 0,
        valid: false,
        projection: new Matrix4(),
        previousProjection: new Matrix4(),
        previousInverseProjection: new Matrix4(),
        previousView: new Matrix4(),
        previousFromCurrent: new Matrix4(),
      };
      const shared = {
        u_depth: () => s.depth.getColorTexture(),
        u_baseRay: () => s.raw.getColorTexture(1),
        u_coatRay: () => s.raw.getColorTexture(2),
        u_stride: () => 1 / effect.resolutionScale,
      };
      const levels = {};
      t.levels.forEach((buffer, i) => {
        levels[`u_level${i + 1}`] = () => buffer.getColorTexture();
      });
      t.reduce = context.createViewportQuadCommand(reduce, {
        owner: effect,
        uniformMap: { u_source: () => t.reduceSource },
      });
      t.trace = context.createViewportQuadCommand(
        new ShaderSource({ sources: [common, hierarchy, trace] }),
        {
          owner: effect,
          uniformMap: {
            ...shared,
            ...levels,
            u_color: () => s.radianceTexture,
            u_maximumDistance: () => effect.maximumDistance,
            u_thickness: () => effect.thickness,
            u_maximumRoughness: () => effect.maximumRoughness,
            u_stepCount: () => effect.stepCount,
            u_rayNear: () => scene.camera.frustum.near,
          },
        },
      );
      t.temporal = context.createViewportQuadCommand(
        new ShaderSource({ sources: [common, temporal] }),
        {
          owner: effect,
          uniformMap: {
            ...shared,
            u_base: () => t.raw.getColorTexture(0),
            u_coat: () => t.raw.getColorTexture(1),
            u_metadata: () => t.raw.getColorTexture(2),
            u_historyBase: () => t.history[1 - t.index].getColorTexture(0),
            u_historyCoat: () => t.history[1 - t.index].getColorTexture(1),
            u_historyGeometry: () => t.history[1 - t.index].getColorTexture(2),
            u_previousProjection: () => t.previousProjection,
            u_previousInverseProjection: () => t.previousInverseProjection,
            u_previousFromCurrent: () => t.previousFromCurrent,
            u_valid: () => t.valid,
          },
        },
      );
      t.reconstruct = context.createViewportQuadCommand(
        new ShaderSource({ sources: [common, reconstruct] }),
        {
          owner: effect,
          uniformMap: {
            ...shared,
            u_base: () => t.filtered.getColorTexture(0),
            u_coat: () => t.filtered.getColorTexture(1),
            u_metadata: () => t.raw.getColorTexture(2),
            u_maximumRoughness: () => effect.maximumRoughness,
          },
        },
      );
    }
    const width = context.drawingBufferWidth;
    const height = context.drawingBufferHeight;
    if (
      t.width !== width ||
      t.height !== height ||
      t.scale !== effect.resolutionScale
    ) {
      releaseTargets(t);
      t.width = width;
      t.height = height;
      t.scale = effect.resolutionScale;
      t.traceWidth = Math.ceil(width * t.scale);
      t.traceHeight = Math.ceil(height * t.scale);
      t.raw = target(context, t.traceWidth, t.traceHeight);
      t.trace.renderState = t.temporal.renderState = viewport(
        t.traceWidth,
        t.traceHeight,
      );
      t.reconstruct.renderState = viewport(width, height);
      t.levelStates = t.levels.map((buffer, index) => {
        const w = Math.ceil(width / 2 ** (index + 1));
        const h = Math.ceil(height / 2 ** (index + 1));
        buffer.update(context, w, h);
        return viewport(w, h);
      });
      t.valid = false;
    }
    if (effect.temporalFiltering && t.history.length === 0) {
      t.history = [
        target(context, t.traceWidth, t.traceHeight),
        target(context, t.traceWidth, t.traceHeight),
      ];
      t.valid = false;
    }
  },

  execute(scene, s) {
    const effect = scene._sceneGISScreenSpaceReflections;
    const context = scene.context;
    const t = s.tracing;
    t.valid &&=
      t.lastFrame + 1 === scene.frameState.frameNumber &&
      t.mainPass === s.mainPass &&
      t.logDepth === s.logDepth &&
      Matrix4.equals(t.projection, scene.camera.frustum.projectionMatrix);
    // Preserve ECEF precision by multiplying view transforms in JS doubles.
    Matrix4.multiply(
      t.previousView,
      scene.camera.inverseViewMatrix,
      t.previousFromCurrent,
    );
    s.radianceTexture.generateMipmap();
    s.radianceTexture.sampler = mipSampler;
    t.reduceSource = s.depth.getColorTexture();
    t.levels.forEach((buffer, index) => {
      t.reduce.framebuffer = buffer.framebuffer;
      t.reduce.renderState = t.levelStates[index];
      t.reduce.execute(context);
      t.reduceSource = buffer.getColorTexture();
    });
    t.trace.framebuffer = t.raw;
    t.trace.execute(context);
    t.filtered = t.raw;
    if (effect.temporalFiltering) {
      t.temporal.framebuffer = t.history[t.index];
      t.temporal.execute(context);
      t.filtered = t.history[t.index];
      t.index = 1 - t.index;
    }
    t.reconstruct.framebuffer = s.result.framebuffer;
    t.reconstruct.execute(context);
    Matrix4.clone(scene.camera.frustum.projectionMatrix, t.projection);
    // UniformState includes the active TAA jitter; Camera.frustum deliberately does not.
    Matrix4.clone(context.uniformState.projection, t.previousProjection);
    Matrix4.inverse(t.previousProjection, t.previousInverseProjection);
    Matrix4.clone(scene.camera.viewMatrix, t.previousView);
    t.lastFrame = scene.frameState.frameNumber;
    t.mainPass = s.mainPass;
    t.logDepth = s.logDepth;
    t.valid = effect.temporalFiltering;
  },

  destroy(s) {
    const t = s.tracing;
    if (!t) {
      return;
    }
    releaseTargets(t);
    t.levels.forEach((buffer) => buffer.destroy());
    for (const command of [t.reduce, t.trace, t.temporal, t.reconstruct]) {
      command.shaderProgram.destroy();
    }
    s.tracing = undefined;
  },
};

export default SceneGISReflectionTracing;
