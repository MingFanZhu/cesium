import resolveMrt from "../../Renderer/_SceneGISResolveMrt.js";
import defined from "../../../Core/defined.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Renderbuffer from "../../../Renderer/Renderbuffer.js";
import RenderbufferFormat from "../../../Renderer/RenderbufferFormat.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import BlendFunction from "../../../Scene/BlendFunction.js";
import material from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRMain.js";
import composite from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRComposite.js";
import indirect from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOMain.js";
import diffuse from "../../../Shaders/SceneGIS/IndirectLighting/SceneGISSILMain.js";

const opaquePasses = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
const classificationPasses = [
  Pass.TERRAIN_CLASSIFICATION,
  Pass.CESIUM_3D_TILE_CLASSIFICATION,
  Pass.CESIUM_3D_TILE_CLASSIFICATION_IGNORE_SHOW,
];
// These native stages modify lit color without an MRT response contract yet.
const postLightingBranches = [
  "HAS_ATMOSPHERE",
  "HAS_PRIMITIVE_OUTLINE",
  "HAS_CLIPPING_PLANES",
  "HAS_SILHOUETTE",
  "HAS_EDGE_VISIBILITY",
  "HAS_POINT_CLOUD_COLOR_STYLE",
  "HAS_PLANAR_FILL_DEPTH",
];
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
  if (
    (ao && !scene.highDynamicRange) ||
    ranges.length !== 1 ||
    environment.useWebVR ||
    environment.useInvertClassification ||
    environment.clearGlobeDepth ||
    scene._globeTranslucencyState.translucent ||
    scene.debugShowCommands ||
    scene.debugShowFrustums
  ) {
    return undefined;
  }
  const manager = environment.useGlobeDepthFramebuffer
    ? scene._view.globeDepth.colorFramebufferManager
    : scene._view.sceneFramebuffer._colorFramebuffer;
  if (manager.framebuffer !== passState.framebuffer) {
    return undefined;
  }
  const range = ranges[0];
  if (classificationPasses.some((pass) => range.indices[pass] > 0)) {
    return undefined;
  }
  let coat = false;
  for (const pass of opaquePasses) {
    for (let i = 0; i < range.indices[pass]; ++i) {
      const command = range.commands[pass][i];
      if (command.owner?._sceneGISWater === true) {
        continue;
      }
      if (!eligible(command) || command.renderState.blending.enabled) {
        return undefined;
      }
      const defines = command.shaderProgram.fragmentShaderSource.defines;
      if (postLightingBranches.some((name) => defines.includes(name))) {
        return undefined;
      }
      if (
        (ao || ssil) &&
        indirectPostLightingBranches.some((name) => defines.includes(name))
      ) {
        return undefined;
      }
      coat ||= defines.includes("USE_CLEARCOAT");
    }
  }
  coat &&= reflections;
  const count =
    (reflections ? (coat ? 7 : 4) : 1) + (ao ? 1 : 0) + (ssil ? 2 : 0);
  if (
    count > ContextLimits.maximumDrawBuffers ||
    count > ContextLimits.maximumColorAttachments
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
    radiance:
      reflections || scene.frameState._sceneGISWater?.surfaces.length > 0,
  };
}

function releaseTargets(mrt) {
  mrt.framebuffer?.destroy();
  mrt.resolveFramebuffer?.destroy();
  mrt.clearFramebuffer?.destroy();
  mrt.renderbuffers?.forEach((buffer) => buffer.destroy());
  mrt.weights?.destroy();
  mrt.indirect?.destroy();
  mrt.ssil?.destroy();
  mrt.radiance?.destroy();
  mrt.mask?.shaderProgram.destroy();
  mrt.composite?.shaderProgram.destroy();
}

function allocate(scene, state, selected) {
  const context = scene.context;
  const { manager, coat, ao, ssil, reflections, radiance } = selected;
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
    mrt.needsRadiance === radiance
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
    coat,
    ao,
    reflections,
    needsRadiance: radiance,
    width,
    height,
    numSamples: manager.numSamples,
    commands: new WeakMap(),
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
  mrt.aoLocation = textures.length - 1;
  if (ssil) {
    mrt.ssilLocation = textures.length;
    textures.push(mrt.ssil.getColorTexture(0), mrt.ssil.getColorTexture(1));
  }
  mrt.resolveFramebuffer = new Framebuffer({
    context,
    colorTextures: textures,
    depthStencilTexture: state.raw.getDepthStencilTexture(),
    destroyAttachments: false,
  });
  const options = { context, destroyAttachments: false };
  if (mrt.numSamples > 1) {
    mrt.renderbuffers = textures.slice(1).map(
      () =>
        new Renderbuffer({
          context,
          width,
          height,
          numSamples: mrt.numSamples,
          format: RenderbufferFormat.RGBA16F,
        }),
    );
    options.colorRenderbuffers = [
      manager.getColorRenderbuffer(),
      ...mrt.renderbuffers,
    ];
    options.depthStencilRenderbuffer = source.depthStencilRenderbuffer;
    mrt.clearFramebuffer = new Framebuffer({
      context,
      colorRenderbuffers: mrt.renderbuffers,
      destroyAttachments: false,
    });
  } else {
    options.colorTextures = [manager.getColorTexture(), ...textures.slice(1)];
    options.depthStencilTexture = source.depthStencilTexture;
  }
  mrt.framebuffer = new Framebuffer(options);
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
      if (defined(mrt.clearFramebuffer)) {
        passState.framebuffer = mrt.clearFramebuffer;
        state.clearColor.execute(scene.context, passState);
      }
      passState.framebuffer = state.depth.framebuffer;
      state.clearColor.execute(scene.context, passState);
    } finally {
      passState.framebuffer = original;
    }
    state.mainDraws = 0;
    return true;
  },

  command(scene, state, command) {
    const mrt = state.main;
    const shader = command.shaderProgram;
    let program = mrt.programs.get(shader);
    if (!defined(program)) {
      const name = `sceneGIS_lighting_${mrt.reflections}_${mrt.coat}_${mrt.ao}_${!!mrt.ssil}`;
      program = scene.context.shaderCache.getDerivedShaderProgram(shader, name);
      if (!defined(program)) {
        const fs = shader.fragmentShaderSource.clone();
        if (mrt.reflections) {
          fs.defines.push("SCENEGIS_SSR_CAPTURE", "SCENEGIS_SSR_MAIN");
        }
        if (mrt.coat) {
          fs.defines.push("SCENEGIS_SSR_COAT_TARGETS");
        }
        fs.sources = fs.sources.map((source) =>
          ShaderSource.replaceMain(source, "sceneGISSSRMain"),
        );
        if (mrt.reflections) {
          fs.sources.unshift(material);
        }
        if (mrt.ao) {
          fs.defines.push(
            "SCENEGIS_AO_MAIN",
            `SCENEGIS_AO_LOCATION ${mrt.aoLocation}`,
          );
          fs.sources.unshift(indirect);
        }
        if (mrt.ssil) {
          fs.defines.push(
            "SCENEGIS_SSIL_MAIN",
            `SCENEGIS_SSIL_SOURCE_LOCATION ${mrt.ssilLocation}`,
            `SCENEGIS_SSIL_RESPONSE_LOCATION ${mrt.ssilLocation + 1}`,
          );
          fs.sources.unshift(diffuse);
        }
        fs.sources.push(
          `void main() { sceneGISSSRMain(); ${mrt.reflections ? "sceneGISSSRWriteMaterial();" : ""} ${mrt.ao ? "sceneGISWriteIndirect();" : ""} ${mrt.ssil ? "sceneGISSILWrite();" : ""} }`,
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
      mrt.programs.set(shader, program);
    }
    const derived = DrawCommand.shallowClone(
      command,
      mrt.commands.get(command),
    );
    mrt.commands.set(command, derived);
    derived.shaderProgram = program;
    derived.framebuffer = mrt.framebuffer;
    ++state.mainDraws;
    return derived;
  },

  draw(scene, state, command, passState) {
    SceneGISLightingMrt.command(scene, state, command).execute(
      scene.context,
      passState,
    );
  },

  resolve(scene, state) {
    const context = scene.context;
    const mrt = state.main;
    resolveMrt(
      context,
      mrt.framebuffer,
      mrt.resolveFramebuffer,
      mrt.width,
      mrt.height,
      mrt.numSamples > 1 ? mrt.framebuffer.numberOfColorAttachments : 1,
    );
  },

  radiance(scene, state) {
    state.main.mask.execute(scene.context);
    state.radianceTexture = state.main.radiance.getColorTexture();
  },

  composite(scene, state, passState) {
    state.main.composite.execute(scene.context, passState);
  },

  destroy(state) {
    if (defined(state.main)) {
      releaseTargets(state.main);
      state.main = undefined;
    }
  },
};

export default SceneGISLightingMrt;
