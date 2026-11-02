import Cartesian3 from "../../../../Core/Cartesian3.js";
import Cartesian4 from "../../../../Core/Cartesian4.js";
import Matrix4 from "../../../../Core/Matrix4.js";
import Quaternion from "../../../../Core/Quaternion.js";
import DrawCommand from "../../../../Renderer/DrawCommand.js";
import RenderState from "../../../../Renderer/RenderState.js";
import ShaderDestination from "../../../../Renderer/ShaderDestination.js";
import videoShader from "../../../../Shaders/SceneGIS/Gaussian/SceneGISGaussianVideo.js";
import { updateGaussianSourceRenderTransform } from "./_SceneGISGaussianViewObservation.js";

const stageAt = (primitive, slot) => primitive._videoProjectors?.[slot];

/** Explicit internal bridge between the observer coordinator and owned splat renderer. @private */
const GaussianVideo = {
  configure(builder, depth) {
    builder.addDefine(
      "SCENEGIS_GAUSSIAN_VIDEO",
      undefined,
      ShaderDestination.BOTH,
    );
    builder.addVarying("vec3", "v_gvCenter", "flat");
    builder.addVarying("mat3", "v_gvPrecision", "flat");
    builder.addVarying("vec3", "v_gvRay");
    builder.addUniform("bool", "u_gvPerspective", ShaderDestination.FRAGMENT);
    builder.addFragmentLines(videoShader);
    if (depth) {
      builder.addDefine(
        "SCENEGIS_GAUSSIAN_VIDEO_DEPTH",
        undefined,
        ShaderDestination.FRAGMENT,
      );
      builder.addUniform(
        "float",
        "u_gvAlphaThreshold",
        ShaderDestination.FRAGMENT,
      );
      builder.addUniform("vec2", "u_gvDepthRange", ShaderDestination.FRAGMENT);
      return;
    }
    const lines = [
      "vec3 sceneGIS_gaussianVideoColor(vec3 color, vec3 position) {",
    ];
    for (let slot = 0; slot < 4; slot++) {
      for (const [type, name] of [
        ["sampler2D", "Video"],
        ["sampler2D", "Depth"],
        ["mat4", "View"],
        ["mat4", "Projection"],
        ["vec4", "Range"],
        ["vec4", "Media"],
        ["bool", "Ready"],
      ]) {
        builder.addUniform(
          type,
          `u_gv${name}${slot}`,
          ShaderDestination.FRAGMENT,
        );
      }
      lines.push(
        `color = sceneGIS_gaussianProjectVideo(color, position, u_gvVideo${slot}, u_gvDepth${slot}, u_gvView${slot}, u_gvProjection${slot}, u_gvRange${slot}, u_gvMedia${slot}, u_gvReady${slot});`,
      );
    }
    lines.push("return color; }");
    builder.addFragmentLines(lines);
  },

  uniforms(primitive, context) {
    const result = { u_gvPerspective: () => primitive._videoPerspective };
    for (let slot = 0; slot < 4; slot++) {
      const range = new Cartesian4();
      const media = new Cartesian4();
      const current = () => stageAt(primitive, slot);
      Object.assign(result, {
        [`u_gvVideo${slot}`]: () =>
          current()?.media.texture ?? context.defaultTexture,
        [`u_gvDepth${slot}`]: () =>
          current()?.depth?.texture ?? context.defaultTexture,
        [`u_gvView${slot}`]: () =>
          current()?.viewToObserver ?? Matrix4.IDENTITY,
        [`u_gvProjection${slot}`]: () =>
          current()?.camera.frustum.projectionMatrix ?? Matrix4.IDENTITY,
        [`u_gvRange${slot}`]: () => {
          const state = current();
          return Cartesian4.fromElements(
            state?.near ?? 1,
            state?.distance ?? 2,
            state?.depthBias ?? 0,
            0,
            range,
          );
        },
        [`u_gvMedia${slot}`]: () => {
          const state = current();
          const texture = state?.media.texture;
          return Cartesian4.fromElements(
            texture ? texture.width / texture.height : 1,
            state?.camera.frustum.aspectRatio ?? 1,
            state?.opacity ?? 0,
            Number(state?.flipY ?? false),
            media,
          );
        },
        [`u_gvReady${slot}`]: () =>
          !!(current()?.analysisReady && current().media.ready),
      });
    }
    return result;
  },

  update(primitive, frame) {
    primitive._videoProjectors = (frame._sceneGISObservers ?? []).filter(
      (state) => state.gaussianTargets?.includes(primitive),
    );
    primitive._videoPerspective =
      "infiniteProjectionMatrix" in frame.camera.frustum;
    const controller = primitive._controller;
    const command = controller._d3?.current?.command;
    if (command) {
      command.shaderProgram = controller._renderResources.getVideoProgram(
        primitive._videoProjectors.length > 0 && !frame.passes.pick
          ? "receiver"
          : "base",
      );
    }
  },

  ready(primitive) {
    const controller = primitive._controller;
    return !!(
      controller.ready &&
      controller._observerReadyGeneration === controller._viewGeneration &&
      !controller._content &&
      !controller._cleanup &&
      !controller._resourceBlocker
    );
  },

  depthCommand(primitive, state, frame) {
    const controller = primitive._controller;
    const main = controller._d3.current.command;
    const entries = (state.gaussianCommands ??= new Map());
    let entry = entries.get(primitive);
    if (!entry || entry.main !== main) {
      const command = DrawCommand.shallowClone(main);
      const origin = new Cartesian3(),
        position = new Cartesian3(),
        rotation = new Quaternion();
      entry = { main, command, origin, position, rotation };
      command.shaderProgram =
        controller._renderResources.getVideoProgram("depth");
      const renderState = RenderState.getState(main.renderState);
      renderState.depthMask = true;
      renderState.blending.enabled = false;
      renderState.colorMask = {
        red: false,
        green: false,
        blue: false,
        alpha: false,
      };
      command.renderState = RenderState.fromCache(renderState);
      command._sceneGISGaussianObserver = true;
      command.uniformMap = {
        ...main.uniformMap,
        u_viewOriginLocal: () => origin,
        u_sourceRenderToViewPosition: () => position,
        u_sourceRenderToViewQuaternion: () => rotation,
        u_gvPerspective: () => true,
        u_gvAlphaThreshold: () => state.gaussianAlphaThreshold,
        u_gvDepthRange: () => state.depthRange,
      };
      entries.set(primitive, entry);
    }
    updateGaussianSourceRenderTransform(
      frame,
      primitive._effectiveModelMatrix,
      entry.origin,
      entry.position,
      entry.rotation,
    );
    entry.command.boundingVolume = main.boundingVolume;
    return entry.command;
  },
};

export default GaussianVideo;
