import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import getTimestamp from "../../../Core/getTimestamp.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import luminance from "../../../Shaders/SceneGIS/AutoExposure/SceneGISExposureLuminance.js";
import histogram from "../../../Shaders/SceneGIS/AutoExposure/SceneGISExposureHistogram.js";
import reduce from "../../../Shaders/SceneGIS/AutoExposure/SceneGISExposureReduce.js";
import adapt from "../../../Shaders/SceneGIS/AutoExposure/SceneGISExposureAdapt.js";

function allocate(effect, context) {
  if (effect._state) {
    return;
  }
  const s = (effect._state = {
    gridSize: new Cartesian2(),
    percentiles: new Cartesian2(),
    limits: new Cartesian2(),
    speeds: new Cartesian2(),
    targets: Array.from(
      { length: 5 },
      () => new FramebufferManager({ pixelDatatype: PixelDatatype.FLOAT }),
    ),
  });
  [s.luminance, s.rows, s.histogram, s.result, s.previous] = s.targets;
  s.result.update(context, 1, 1);
  s.previous.update(context, 1, 1);
  const uniformMap = {
    u_color: () => s.source,
    u_gridSize: () => s.gridSize,
    u_centerWeight: () => effect.centerWeight,
    u_luminance: () => s.luminance.getColorTexture(),
    u_rows: () => s.rows.getColorTexture(),
    u_histogram: () => s.histogram.getColorTexture(),
    u_previous: () => s.previous.getColorTexture(),
    u_history: () => effect.ready,
    u_locked: () => effect.locked,
    u_percentiles: () =>
      Cartesian2.fromElements(
        effect.lowPercent,
        effect.highPercent,
        s.percentiles,
      ),
    u_limits: () =>
      Cartesian2.fromElements(
        Math.log2(effect.minimumExposure),
        Math.log2(effect.maximumExposure),
        s.limits,
      ),
    u_speeds: () =>
      Cartesian2.fromElements(effect.speedUp, effect.speedDown, s.speeds),
    u_seconds: () => s.seconds,
    u_compensation: () => effect.exposureCompensation,
    u_manualExposure: () => effect._scene.postProcessStages.exposure,
  };
  s.commands = [luminance, histogram, reduce, adapt].map((shader) =>
    context.createViewportQuadCommand(shader, { owner: effect, uniformMap }),
  );
}

function draw(context, command, target, width, height) {
  target.update(context, width, height);
  command.framebuffer = target.framebuffer;
  if (
    command.renderState?.viewport.width !== width ||
    command.renderState?.viewport.height !== height
  ) {
    command.renderState = RenderState.fromCache({
      viewport: new BoundingRectangle(0, 0, width, height),
    });
  }
  command.execute(context);
}

/** Bounded histogram metering and exposure history. @private */
const SceneGISAutoExposure = {
  update(collection, context, useHdr) {
    const effect = collection._sceneGISAutoExposure;
    const active = effect?.enabled === true;
    if (active) {
      effect._validate();
      if (!useHdr) {
        throw new RuntimeError(
          "Auto exposure requires an HDR post-process input.",
        );
      }
      allocate(effect, context);
    }
    const changed =
      (collection._sceneGISAutoExposureActive === true) !== active;
    collection._sceneGISAutoExposureActive = active;
    return changed;
  },

  texture(collection) {
    return collection._sceneGISAutoExposure?._state?.result.getColorTexture();
  },

  execute(collection, context, colorTexture, timestamp = getTimestamp()) {
    const effect = collection._sceneGISAutoExposure;
    if (!effect?.enabled) {
      return;
    }
    const s = effect._state;
    s.source = colorTexture;
    s.seconds = effect.ready ? (timestamp - s.timestamp) * 0.001 : 0;
    s.timestamp = timestamp;
    if (!effect.locked || !effect.ready) {
      const scale = Math.min(
        1,
        128 / Math.max(colorTexture.width, colorTexture.height),
      );
      const width = Math.max(1, Math.round(colorTexture.width * scale));
      const height = Math.max(1, Math.round(colorTexture.height * scale));
      Cartesian2.fromElements(width, height, s.gridSize);
      draw(context, s.commands[0], s.luminance, width, height);
      draw(context, s.commands[1], s.rows, 64, height);
      draw(context, s.commands[2], s.histogram, 64, 1);
    }
    const previous = s.result;
    s.result = s.previous;
    s.previous = previous;
    draw(context, s.commands[3], s.result, 1, 1);
    effect._ready = true;
    // Do not retain a reference to an upstream color target between frames.
    s.source = undefined;
  },

  destroy(effect) {
    const s = effect._state;
    if (s) {
      for (const command of s.commands) {
        command.shaderProgram.destroy();
      }
      for (const target of s.targets) {
        target.destroy();
      }
      effect._state = undefined;
    }
    effect._ready = false;
  },
};
export default SceneGISAutoExposure;
