import resolveMrt from "../../Renderer/_SceneGISResolveMrt.js";
import combine from "../../../Core/combine.js";
import pointColor from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredPointColor.js";
import pointEDL from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredPointEDL.js";
import MaterialExtensions from "./_SceneGISDeferredMaterialExtensions.js";
import defined from "../../../Core/defined.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import BlendFunction from "../../../Scene/BlendFunction.js";
import material from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRMain.js";
import composite from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRComposite.js";
import indirect from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOMain.js";
import diffuse from "../../../Shaders/SceneGIS/IndirectLighting/SceneGISSILMain.js";
import DeferredLayout from "./_SceneGISDeferredLayout.js";

const opaquePasses = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
// These native stages modify lit color without an MRT response contract yet.
const postLightingBranches = ["HAS_ATMOSPHERE"];
const indirectPostLightingBranches = [
  "FOG",
  "GROUND_ATMOSPHERE",
  "APPLY_MATERIAL",
  "CLIPPING_PLANES",
];

function layout(scene, passState, eligible, reflections) {
  const ranges = scene._view.frustumCommandsList;
  const environment = scene._environmentState;
  const ao = scene.postProcessStages.ambientOcclusion.enabled;
  const ssil = scene._sceneGISScreenSpaceIndirectLighting?.enabled === true;
  if ((ao && !scene._hdr) || environment.useWebVR) {
    return undefined;
  }
  const manager = environment.useGlobeDepthFramebuffer
    ? scene._view.globeDepth.colorFramebufferManager
    : scene._view.sceneFramebuffer._colorFramebuffer;
  if (manager.framebuffer !== passState.framebuffer) {
    return undefined;
  }
  let coat = false;
  for (const range of ranges) {
    for (const pass of opaquePasses) {
      for (let i = 0; i < range.indices[pass]; ++i) {
        const command = range.commands[pass][i];
        if (command.owner?._sceneGISWater === true) {
          continue;
        }
        if (
          command instanceof ClearCommand ||
          DeferredLayout.isDebugOverlay(command) ||
          DeferredLayout.isGlobeDepth(command) ||
          DeferredLayout.isAnnotation(command)
        ) {
          continue;
        }
        const deferredGlobe = scene._sceneGISDeferred._isGlobeCommand(command);
        if (
          !eligible(command) ||
          (command.renderState.blending.enabled && !deferredGlobe)
        ) {
          return undefined;
        }
        const defines = command.shaderProgram.fragmentShaderSource.defines;
        if (postLightingBranches.some((name) => defines.includes(name))) {
          return undefined;
        }
        if (
          (ao || ssil) &&
          !deferredGlobe &&
          indirectPostLightingBranches.some((name) => defines.includes(name))
        ) {
          return undefined;
        }
        coat ||= defines.includes("USE_CLEARCOAT");
      }
    }
  }
  coat &&= reflections;
  const count =
    (reflections ? (coat ? 7 : 4) : 1) + (ao ? 1 : 0) + (ssil ? 2 : 0);
  const capacity = Math.min(
    ContextLimits.maximumDrawBuffers,
    ContextLimits.maximumColorAttachments,
  );
  const reflectionCount = reflections ? (coat ? 7 : 4) : 1;
  const split = count > capacity;
  if (
    split &&
    (reflectionCount > capacity || 1 + Number(ao) + (ssil ? 2 : 0) > capacity)
  ) {
    return undefined;
  }
  return {
    manager,
    coat,
    ao,
    ssil,
    reflections,
    count,
    split,
    reflectionCount,
    radiance:
      reflections || scene.frameState._sceneGISWater?.surfaces.length > 0,
  };
}

function releaseTargets(mrt) {
  mrt.framebuffer?.destroy();
  mrt.auxiliaryFramebuffer?.destroy();
  mrt.resolveFramebuffer?.destroy();
  mrt.weights?.destroy();
  mrt.indirect?.destroy();
  mrt.ssil?.destroy();
  mrt.radiance?.destroy();
  mrt.mask?.shaderProgram.destroy();
  mrt.composite?.shaderProgram.destroy();
  for (const command of mrt.pointCommands.values()) {
    command.shaderProgram.destroy();
  }
  mrt.pointCommands.clear();
}

function allocate(scene, state, selected) {
  const context = scene.context;
  const {
    manager,
    coat,
    ao,
    ssil,
    reflections,
    radiance,
    split,
    reflectionCount,
  } = selected;
  const source = manager.framebuffer;
  const color = state.raw.getColorTexture();
  let mrt = state.main;
  if (
    defined(mrt) &&
    mrt.source === source &&
    mrt.color === color &&
    mrt.coat === coat &&
    mrt.ao === ao &&
    !!mrt.ssil === ssil &&
    mrt.reflections === reflections &&
    mrt.needsRadiance === radiance &&
    mrt.split === split
  ) {
    return mrt;
  }
  if (defined(mrt)) {
    releaseTargets(mrt);
  }
  const width = color.width;
  const height = color.height;
  mrt = state.main = {
    source,
    color,
    split,
    coat,
    ao,
    reflections,
    needsRadiance: radiance,
    width,
    height,
    pointCommands: new Map(),
    commands: new WeakMap(),
    auxiliaryCommands: new WeakMap(),
    auxiliaryPrograms: new WeakMap(),
    programs: new WeakMap(),
    weights: reflections
      ? new FramebufferManager({
          colorAttachmentsLength: coat ? 4 : 2,
          pixelDatatype: PixelDatatype.HALF_FLOAT,
        })
      : undefined,
    indirect: ao
      ? new FramebufferManager({ pixelDatatype: PixelDatatype.HALF_FLOAT })
      : undefined,
    ssil: ssil
      ? new FramebufferManager({
          colorAttachmentsLength: 2,
          pixelDatatype: PixelDatatype.HALF_FLOAT,
        })
      : undefined,
    radiance: radiance
      ? new FramebufferManager({
          pixelDatatype: PixelDatatype.HALF_FLOAT,
        })
      : undefined,
  };
  mrt.weights?.update(context, width, height);
  mrt.indirect?.update(context, width, height);
  mrt.ssil?.update(context, width, height);
  mrt.radiance?.update(context, width, height);
  const textures = [color];
  if (reflections) {
    textures.push(
      state.raw.getColorTexture(1),
      mrt.weights.getColorTexture(0),
      mrt.weights.getColorTexture(1),
    );
  }
  if (coat) {
    textures.push(
      state.raw.getColorTexture(2),
      mrt.weights.getColorTexture(2),
      mrt.weights.getColorTexture(3),
    );
  }
  if (ao) {
    textures.push(mrt.indirect.getColorTexture());
  }
  mrt.aoLocation = split ? 1 : textures.length - 1;
  if (ssil) {
    mrt.ssilLocation = split ? 1 + Number(ao) : textures.length;
    textures.push(mrt.ssil.getColorTexture(0), mrt.ssil.getColorTexture(1));
  }
  if (split) {
    mrt.auxiliaryFramebuffer = new Framebuffer({
      context,
      colorTextures: [color, ...textures.slice(reflectionCount)],
      destroyAttachments: false,
    });
    textures.length = reflectionCount;
  }
  mrt.resolveFramebuffer = new Framebuffer({
    context,
    colorTextures: textures,
    destroyAttachments: false,
  });
  mrt.framebuffer = new Framebuffer({
    context,
    colorTextures: [manager.getColorTexture(), ...textures.slice(1)],
    depthStencilTexture: source.depthStencilTexture,
    destroyAttachments: false,
  });
  // Exclude the native background from the opaque radiance mip chain.
  if (radiance) {
    mrt.mask = context.createViewportQuadCommand(
      `uniform sampler2D u_color;
     uniform sampler2D u_coverage;
     ${ao ? "uniform sampler2D u_indirect; uniform sampler2D u_occlusion;" : ""}
     ${ssil ? "uniform sampler2D u_ssil;" : ""}
     ${!reflections && !ao ? "uniform sampler2D u_depth;" : ""}
     void main() {
       ivec2 pixel = ivec2(gl_FragCoord.xy);
       float coverage = ${!reflections && !ao ? "float(texelFetch(u_depth, pixel, 0).r > 0.0)" : "texelFetch(u_coverage, pixel, 0).a"};
       vec3 color = texelFetch(u_color, pixel, 0).rgb;
       ${ao ? "color += (texelFetch(u_occlusion, pixel, 0).r - 1.0) * texelFetch(u_indirect, pixel, 0).rgb;" : ""}
       ${ssil ? "color += texelFetch(u_ssil, pixel, 0).rgb;" : ""}
       out_FragColor = vec4(color * coverage, coverage);
     }`,
      {
        framebuffer: mrt.radiance.framebuffer,
        uniformMap: {
          u_color: () => color,
          u_coverage: () =>
            reflections
              ? mrt.weights.getColorTexture(0)
              : ao
                ? mrt.indirect.getColorTexture()
                : state.raw.getColorTexture(),
          u_ssil: () =>
            scene._sceneGISScreenSpaceIndirectLighting._state.result.getColorTexture(),
          u_depth: () => state.depth.getColorTexture(),
          u_indirect: () => mrt.indirect.getColorTexture(),
          u_occlusion: () =>
            scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion.filtered.getColorTexture(),
        },
      },
    );
  }
  const defines = [];
  if (reflections) {
    defines.push("SCENEGIS_SSR_MAIN");
  }
  if (coat) {
    defines.push("SCENEGIS_SSR_COAT_TARGETS");
  }
  if (ao) {
    defines.push("SCENEGIS_AO_MAIN");
  }
  if (ssil) {
    defines.push("SCENEGIS_SSIL_MAIN");
  }
  mrt.composite = context.createViewportQuadCommand(
    new ShaderSource({
      defines,
      sources: [composite],
    }),
    {
      renderState: RenderState.fromCache({
        blending: {
          enabled: true,
          functionSourceRgb: BlendFunction.ONE,
          functionDestinationRgb: BlendFunction.ONE,
          functionSourceAlpha: BlendFunction.ZERO,
          functionDestinationAlpha: BlendFunction.ONE,
        },
      }),
      uniformMap: {
        u_base: () => state.result.getColorTexture(0),
        u_coat: () => state.result.getColorTexture(1),
        u_baseWeight: () => mrt.weights.getColorTexture(0),
        u_baseEnvironment: () => mrt.weights.getColorTexture(1),
        u_coatWeight: () => mrt.weights.getColorTexture(2),
        u_coatEnvironment: () => mrt.weights.getColorTexture(3),
        u_indirect: () => mrt.indirect.getColorTexture(),
        u_ssil: () =>
          scene._sceneGISScreenSpaceIndirectLighting._state.result.getColorTexture(),
        u_occlusion: () =>
          scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion.filtered.getColorTexture(),
      },
    },
  );
  return mrt;
}

function compositePointColors(scene, mrt, passState) {
  const renderer = scene._sceneGISDeferred;
  for (const group of renderer._groups) {
    const source = group.command;
    const flags = source.shaderProgram.fragmentShaderSource.defines;
    if (
      !flags.includes("HAS_POINT_CLOUD_COLOR_STYLE") ||
      !flags.includes("LIGHTING_PBR") ||
      !flags.includes("HAS_NORMALS")
    ) {
      continue;
    }
    let command = mrt.pointCommands.get(source);
    const debug = !!renderer._debugTint;
    if (command && command._sceneGISDebugTint !== debug) {
      command.shaderProgram.destroy();
      command = undefined;
    }
    if (!command) {
      const defines =
        mrt.composite.shaderProgram.fragmentShaderSource.defines.concat(
          "HDR",
          "SCENEGIS_POINT_COLOR_CORRECTION",
          flags.filter((name) =>
            [
              "HAS_MODEL_COLOR",
              "HAS_PRIMITIVE_OUTLINE",
              "SCENEGIS_DEFERRED_FEATURE_STYLE",
              "SCENEGIS_DEFERRED_OUTLINE_STYLE",
              "SCENEGIS_DEFERRED_POINT_EDL",
            ].includes(name),
          ),
        );
      defines.push("SCENEGIS_POINT_EDL_FUNCTION_ONLY");
      if (debug) {
        defines.push("SCENEGIS_DEFERRED_DEBUG_TINT");
      }
      command = scene.context.createViewportQuadCommand(
        new ShaderSource({
          defines,
          sources: [
            MaterialExtensions.lightingSource(renderer._extensionLayout),
            flags.includes("SCENEGIS_DEFERRED_POINT_EDL") ? pointEDL : "",
            pointColor,
            composite,
          ],
        }),
        {
          renderState: mrt.composite.renderState,
          uniformMap: combine(
            source.uniformMap,
            combine(mrt.composite.uniformMap, {
              u_sceneGISPointLitColor: () => mrt.color,
              u_sceneGISPointClassified: () => renderer._hasClassification,
              u_sceneGISClassification: () =>
                renderer._classification?.getColorTexture() ??
                renderer._raw.getColorTexture(0),
              u_sceneGISDebugTint: () =>
                renderer._debugTint.target.getColorTexture(),
            }),
          ),
        },
      );
      command._sceneGISDebugTint = debug;
      mrt.pointCommands.set(source, command);
    }
    command.execute(scene.context, passState);
    ++renderer.colorCorrectionDrawCount;
  }
  for (const [source, command] of mrt.pointCommands) {
    if (!renderer._groups.some((group) => group.command === source)) {
      command.shaderProgram.destroy();
      mrt.pointCommands.delete(source);
    }
  }
}

/**
 * Shares AO/reflection outputs while borrowing native main-pass color/depth.
 * @private
 */
const SceneGISLightingMrt = {
  layout,
  begin(
    scene,
    state,
    passState,
    eligible,
    reflections = true,
    selected = layout(scene, passState, eligible, reflections),
  ) {
    if (!defined(selected)) {
      return false;
    }
    state.depth.update(
      scene.context,
      scene.drawingBufferWidth,
      scene.drawingBufferHeight,
      1,
      PixelDatatype.FLOAT,
      scene._sceneGISDeferred?._multiFrustum ? PixelFormat.RG : PixelFormat.RED,
    );
    if (state.depth === state.linearDepth) {
      state.sourceDepth = state.depth.getColorTexture();
    }
    const mrt = allocate(scene, state, selected);
    const original = passState.framebuffer;
    try {
      // Clear owned outputs only. Native color/depth already contain the background.
      passState.framebuffer = state.raw.framebuffer;
      state.clear.execute(scene.context, passState);
      for (const buffer of [mrt.weights, mrt.indirect, mrt.ssil]) {
        if (defined(buffer)) {
          passState.framebuffer = buffer.framebuffer;
          state.clearColor.execute(scene.context, passState);
        }
      }
      if (!scene._sceneGISDeferred?._active) {
        passState.framebuffer = state.depth.framebuffer;
        state.clearColor.execute(scene.context, passState);
      }
    } finally {
      passState.framebuffer = original;
    }
    state.mainDraws = 0;
    return true;
  },

  command(scene, state, command, auxiliary = false) {
    const mrt = state.main;
    const reflections = mrt.reflections && !auxiliary;
    const coat = mrt.coat && !auxiliary;
    const ao = mrt.ao && (!mrt.split || auxiliary);
    const ssil = !!mrt.ssil && (!mrt.split || auxiliary);
    const programs = auxiliary ? mrt.auxiliaryPrograms : mrt.programs;
    const commands = auxiliary ? mrt.auxiliaryCommands : mrt.commands;
    const shader = command.shaderProgram;
    let program = programs.get(shader);
    if (!defined(program)) {
      const name = `sceneGIS_lighting_${reflections}_${coat}_${ao}_${ssil}_${auxiliary}`;
      program = scene.context.shaderCache.getDerivedShaderProgram(shader, name);
      if (!defined(program)) {
        const fs = shader.fragmentShaderSource.clone();
        if (reflections) {
          fs.defines.push("SCENEGIS_SSR_MAIN");
        }
        if (coat) {
          fs.defines.push("SCENEGIS_SSR_COAT_TARGETS");
        }
        fs.sources = fs.sources.map((source) =>
          ShaderSource.replaceMain(source, "sceneGISSSRMain"),
        );
        if (reflections) {
          fs.sources.unshift(material);
        }
        if (ao) {
          fs.defines.push(
            "SCENEGIS_AO_MAIN",
            `SCENEGIS_AO_LOCATION ${mrt.aoLocation}`,
          );
          fs.sources.unshift(indirect);
        }
        if (ssil) {
          fs.defines.push(
            "SCENEGIS_SSIL_MAIN",
            `SCENEGIS_SSIL_SOURCE_LOCATION ${mrt.ssilLocation}`,
            `SCENEGIS_SSIL_RESPONSE_LOCATION ${mrt.ssilLocation + 1}`,
          );
          fs.sources.unshift(diffuse);
        }
        fs.sources.push(
          `void main() { sceneGISSSRMain(); ${reflections ? "sceneGISSSRWriteMaterial();" : ""} ${ao ? "sceneGISWriteIndirect();" : ""} ${ssil ? "sceneGISSILWrite();" : ""} }`,
        );
        program = scene.context.shaderCache.createDerivedShaderProgram(
          shader,
          name,
          {
            vertexShaderSource: shader.vertexShaderSource,
            fragmentShaderSource: fs,
            attributeLocations: shader._attributeLocations,
          },
        );
      }
      programs.set(shader, program);
    }
    const derived = DrawCommand.shallowClone(command, commands.get(command));
    commands.set(command, derived);
    derived.shaderProgram = program;
    derived.framebuffer = auxiliary
      ? mrt.auxiliaryFramebuffer
      : mrt.framebuffer;
    ++state.mainDraws;
    return derived;
  },

  resolve(scene, state) {
    const mrt = state.main;
    // Deferred material collection already populated the shared linear depth.
    resolveMrt(
      scene.context,
      mrt.framebuffer,
      mrt.resolveFramebuffer,
      mrt.width,
      mrt.height,
      1,
      false,
    );
  },

  radiance(scene, state) {
    state.main.mask.execute(scene.context);
    state.radianceTexture = state.main.radiance.getColorTexture();
  },

  composite(scene, state, passState) {
    state.main.composite.execute(scene.context, passState);
    compositePointColors(scene, state.main, passState);
  },

  destroy(state) {
    if (defined(state.main)) {
      releaseTargets(state.main);
      state.main = undefined;
    }
  },
};

export default SceneGISLightingMrt;
