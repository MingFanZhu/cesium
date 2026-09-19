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

function layout(scene, passState, eligible) {
  const ranges = scene._view.frustumCommandsList;
  const environment = scene._environmentState;
  if (
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
      coat ||= defines.includes("USE_CLEARCOAT");
    }
  }
  const count = coat ? 7 : 4;
  if (
    count > ContextLimits.maximumDrawBuffers ||
    count > ContextLimits.maximumColorAttachments
  ) {
    return undefined;
  }
  return { manager, coat };
}

function releaseTargets(mrt) {
  mrt.framebuffer?.destroy();
  mrt.resolveFramebuffer?.destroy();
  mrt.clearFramebuffer?.destroy();
  mrt.renderbuffers?.forEach((buffer) => buffer.destroy());
  mrt.weights?.destroy();
  mrt.radiance?.destroy();
  mrt.mask?.shaderProgram.destroy();
  mrt.composite?.shaderProgram.destroy();
}

function allocate(scene, state, selected) {
  const context = scene.context;
  const { manager, coat } = selected;
  const source = manager.framebuffer;
  const color = state.raw.getColorTexture();
  let mrt = state.main;
  if (
    defined(mrt) &&
    mrt.source === source &&
    mrt.color === color &&
    mrt.coat === coat
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
    width,
    height,
    numSamples: manager.numSamples,
    commands: new WeakMap(),
    programs: new WeakMap(),
    weights: new FramebufferManager({
      colorAttachmentsLength: coat ? 4 : 2,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    }),
    radiance: new FramebufferManager({
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    }),
  };
  mrt.weights.update(context, width, height);
  mrt.radiance.update(context, width, height);
  const textures = [
    color,
    state.raw.getColorTexture(1),
    mrt.weights.getColorTexture(0),
    mrt.weights.getColorTexture(1),
  ];
  if (coat) {
    textures.push(
      state.raw.getColorTexture(2),
      mrt.weights.getColorTexture(2),
      mrt.weights.getColorTexture(3),
    );
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
  mrt.mask = context.createViewportQuadCommand(
    `uniform sampler2D u_color;
     uniform sampler2D u_coverage;
     void main() {
       ivec2 pixel = ivec2(gl_FragCoord.xy);
       float coverage = texelFetch(u_coverage, pixel, 0).a;
       out_FragColor = vec4(texelFetch(u_color, pixel, 0).rgb * coverage, coverage);
     }`,
    {
      framebuffer: mrt.radiance.framebuffer,
      uniformMap: {
        u_color: () => color,
        u_coverage: () => mrt.weights.getColorTexture(0),
      },
    },
  );
  mrt.composite = context.createViewportQuadCommand(
    new ShaderSource({
      defines: coat ? ["SCENEGIS_SSR_COAT_TARGETS"] : [],
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
      },
    },
  );
  return mrt;
}

/**
 * Owns auxiliary reflection outputs while borrowing native main-pass color/depth.
 * @private
 */
const SceneGISReflectionMrt = {
  begin(scene, state, passState, eligible) {
    const selected = layout(scene, passState, eligible);
    if (!defined(selected)) {
      return false;
    }
    const mrt = allocate(scene, state, selected);
    const original = passState.framebuffer;
    try {
      // Clear owned outputs only. Native color/depth already contain the background.
      passState.framebuffer = state.raw.framebuffer;
      state.clear.execute(scene.context, passState);
      passState.framebuffer = mrt.weights.framebuffer;
      state.clearColor.execute(scene.context, passState);
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

  draw(scene, state, command, passState) {
    const mrt = state.main;
    const shader = command.shaderProgram;
    let program = mrt.programs.get(shader);
    if (!defined(program)) {
      const name = mrt.coat ? "sceneGIS_SSR_mainCoat" : "sceneGIS_SSR_main";
      program = scene.context.shaderCache.getDerivedShaderProgram(shader, name);
      if (!defined(program)) {
        const fs = shader.fragmentShaderSource.clone();
        fs.defines.push("SCENEGIS_SSR_CAPTURE", "SCENEGIS_SSR_MAIN");
        if (mrt.coat) {
          fs.defines.push("SCENEGIS_SSR_COAT_TARGETS");
        }
        fs.sources = fs.sources.map((source) =>
          ShaderSource.replaceMain(source, "sceneGISSSRMain"),
        );
        fs.sources.unshift(material);
        fs.sources.push(
          "void main() { sceneGISSSRMain(); sceneGISSSRWriteMaterial(); }",
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
    derived.execute(scene.context, passState);
    ++state.mainDraws;
  },

  resolve(scene, state) {
    const context = scene.context;
    const gl = context._gl;
    const mrt = state.main;
    const source = mrt.framebuffer;
    const target = mrt.resolveFramebuffer;
    const count = source.numberOfColorAttachments;
    const drawBuffers = new Array(count).fill(gl.NONE);
    source.bindRead();
    target.bindDraw();
    try {
      // Native multisample resolve only selects attachment zero. Resolve each MRT explicitly.
      for (let i = 0; i < (mrt.numSamples > 1 ? count : 1); ++i) {
        gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
        drawBuffers[i] = gl.COLOR_ATTACHMENT0 + i;
        gl.drawBuffers(drawBuffers);
        gl.blitFramebuffer(
          0,
          0,
          mrt.width,
          mrt.height,
          0,
          0,
          mrt.width,
          mrt.height,
          gl.COLOR_BUFFER_BIT | (i === 0 ? gl.DEPTH_BUFFER_BIT : 0),
          gl.NEAREST,
        );
        drawBuffers[i] = gl.NONE;
      }
    } finally {
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.drawBuffers(target._getActiveColorAttachments());
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      context._currentFramebuffer = undefined;
    }
    mrt.mask.execute(context);
    state.radianceTexture = mrt.radiance.getColorTexture();
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

export default SceneGISReflectionMrt;
