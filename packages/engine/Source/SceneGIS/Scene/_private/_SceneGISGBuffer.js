import Color from "../../../Core/Color.js";
import defined from "../../../Core/defined.js";
import destroyObject from "../../../Core/destroyObject.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import PostProcessStage from "../../../Scene/PostProcessStage.js";
import SceneMode from "../../../Scene/SceneMode.js";
import captureShader from "../../../Shaders/SceneGIS/Rendering/SceneGISGBufferCapture.js";
import debugShader from "../../../Shaders/SceneGIS/Rendering/SceneGISGBufferDebug.js";
import depthShader from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODepth.js";
import resolveMrt from "../../Renderer/_SceneGISResolveMrt.js";
import SurfaceWeather from "./_SceneGISSurfaceWeather.js";
import surfaceOverlays from "./_SceneGISVectorSurfaceOverlays.js";

const opaquePasses = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
const excluded = [
  "USE_CLEARCOAT",
  "USE_ANISOTROPY",
  "USE_SPECULAR",
  "HAS_MODEL_COLOR",
  "HAS_SELECTED_FEATURE_ID",
  "HAS_POINT_CLOUD_COLOR_STYLE",
  "HAS_PRIMITIVE_OUTLINE",
  "HAS_SILHOUETTE",
  "HAS_CLIPPING_PLANES",
  "HAS_PLANAR_FILL_DEPTH",
  "HAS_EDGE_VISIBILITY",
];

function eligible(command) {
  return command.owner?._sceneGISWater !== true && !isGlobeDepth(command);
}

function isGlobeDepth(command) {
  const mask = command.renderState?.colorMask;
  return (
    command.pass === Pass.GLOBE &&
    mask &&
    !mask.red &&
    !mask.green &&
    !mask.blue &&
    !mask.alpha
  );
}

function validate(scene, range, passState, isDeferredModel, isDeferredGlobe) {
  const context = scene.context;
  if (
    !context.webgl2 ||
    !context.colorBufferHalfFloat ||
    !context.colorBufferFloat ||
    !context.depthTexture ||
    ContextLimits.maximumDrawBuffers < 4 ||
    ContextLimits.maximumColorAttachments < 4
  ) {
    throw new RuntimeError(
      "G-buffer prototype requires WebGL2, four floating-point targets and depth textures.",
    );
  }
  if (
    scene.mode !== SceneMode.SCENE3D ||
    !scene.highDynamicRange ||
    (scene._view.frustumCommandsList.length !== 1 && !isDeferredGlobe) ||
    scene._environmentState.useWebVR ||
    (scene._environmentState.useInvertClassification && !isDeferredGlobe) ||
    (scene._environmentState.clearGlobeDepth && !isDeferredGlobe) ||
    (scene._globeTranslucencyState.translucent && !isDeferredGlobe) ||
    scene.debugCommandFilter ||
    scene.debugShowCommands ||
    scene.debugShowFrustums ||
    passState.viewport.x !== 0 ||
    passState.viewport.y !== 0
  ) {
    throw new DeveloperError(
      "G-buffer prototype requires one HDR 3D frustum, an opaque world and a full viewport.",
    );
  }
  if (
    isDeferredGlobe &&
    scene._globeTranslucencyState.translucent &&
    surfaceOverlays.hasCommands(
      scene._globeTranslucencyState._sceneGISSurfaceOverlays,
      range.commands[Pass.TERRAIN_CLASSIFICATION],
      range.indices[Pass.TERRAIN_CLASSIFICATION],
    )
  ) {
    throw new DeveloperError(
      "Deferred translucent Globe direct vector overlays require their separate adaptation.",
    );
  }
  let hasClassification =
    (scene._environmentState.useInvertClassification &&
      range.indices[Pass.CESIUM_3D_TILE] > 0) ||
    [Pass.TERRAIN_CLASSIFICATION, Pass.CESIUM_3D_TILE_CLASSIFICATION].some(
      (pass) => range.indices[pass] > 0,
    );
  if (hasClassification && !isDeferredGlobe) {
    throw new DeveloperError(
      "G-buffer diagnostic replay does not support classification.",
    );
  }
  for (const pass of [
    Pass.CESIUM_3D_TILE_CLASSIFICATION_IGNORE_SHOW,
    Pass.VOXELS,
  ]) {
    if (
      range.indices[pass] > 0 &&
      !(
        isDeferredGlobe &&
        pass === Pass.CESIUM_3D_TILE_CLASSIFICATION_IGNORE_SHOW
      )
    ) {
      throw new DeveloperError(
        "G-buffer prototype does not support classification or voxel passes.",
      );
    }
  }
  let hasFeatureStyle = false;
  let hasOcean = false;
  let hasOceanFabric = false;
  for (const pass of opaquePasses) {
    for (let i = 0; i < range.indices[pass]; ++i) {
      const command = range.commands[pass][i];
      if (!eligible(command)) {
        continue;
      }
      if (
        !command.renderState?.depthTest.enabled ||
        !command.renderState.depthMask ||
        (command.renderState.blending.enabled && !isDeferredGlobe?.(command)) ||
        defined(command.framebuffer)
      ) {
        throw new DeveloperError(
          "G-buffer prototype requires ordinary depth-writing opaque commands.",
        );
      }
      const fs = command.shaderProgram.fragmentShaderSource;
      if (isDeferredGlobe?.(command)) {
        hasClassification ||= fs.defines.includes("HAS_VECTOR_LAYER");
        hasOcean ||=
          fs.defines.includes("HAS_WATER_MASK") &&
          (fs.defines.includes("SHOW_REFLECTIVE_OCEAN") ||
            fs.defines.includes("APPLY_MATERIAL"));
        hasOceanFabric ||=
          fs.defines.includes("SHOW_REFLECTIVE_OCEAN") &&
          fs.defines.includes("APPLY_MATERIAL");
      }
      hasFeatureStyle ||= fs.defines.includes("HAS_SELECTED_FEATURE_ID");
      const nativeStyling =
        isDeferredModel &&
        (fs.defines.includes("HAS_MODEL_COLOR") ||
          fs.defines.includes("HAS_SELECTED_FEATURE_ID")) &&
        isDeferredModel(command);
      const unsupported = excluded.find(
        (name) =>
          fs.defines.includes(name) &&
          !(
            nativeStyling &&
            (name === "HAS_MODEL_COLOR" || name === "HAS_SELECTED_FEATURE_ID")
          ),
      );
      if (
        nativeStyling &&
        fs.defines.includes("HAS_SELECTED_FEATURE_ID") &&
        (ContextLimits.maximumDrawBuffers < 5 ||
          ContextLimits.maximumColorAttachments < 5)
      ) {
        throw new RuntimeError(
          "Deferred feature styling requires five floating-point color attachments.",
        );
      }
      if (unsupported) {
        throw new DeveloperError(
          `G-buffer prototype does not encode ${unsupported}.`,
        );
      }
    }
  }
  const count =
    4 +
    (hasClassification ? 1 : 0) +
    (hasFeatureStyle || hasOceanFabric ? 1 : 0) +
    (hasOcean ? 1 : 0);
  if (
    (hasClassification || hasOcean) &&
    (ContextLimits.maximumDrawBuffers < count ||
      ContextLimits.maximumColorAttachments < count)
  ) {
    throw new RuntimeError(
      `Deferred ${hasOcean ? "Globe water material" : "classification"} requires ${count} floating-point color attachments.`,
    );
  }
}

function release(probe) {
  probe._resolve?.destroy();
  probe._resolve = undefined;
  probe._raw?.destroy();
  probe._depth?.destroy();
  probe._copyDepth?.shaderProgram.destroy();
  probe._raw = probe._depth = probe._copyDepth = undefined;
  probe._ready = false;
  probe.byteLength = 0;
}

function allocate(probe) {
  const scene = probe._scene;
  const context = scene.context;
  const width = context.drawingBufferWidth;
  const height = context.drawingBufferHeight;
  const samples = scene.msaaSamples;
  if (!probe._raw) {
    probe._raw = new FramebufferManager({
      colorAttachmentsLength: 4,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      depthStencil: true,
      supportsDepthTexture: true,
    });
    probe._depth = new FramebufferManager({
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
    });
  }
  if (probe._raw.isDirty(width, height, samples)) {
    probe._resolve?.destroy();
    probe._resolve = undefined;
    probe._raw.update(context, width, height, samples);
    if (samples > 1) {
      probe._resolve = new Framebuffer({
        context,
        destroyAttachments: false,
        colorTextures: [0, 1, 2, 3].map((i) => probe._raw.getColorTexture(i)),
        depthStencilTexture: probe._raw.getDepthStencilTexture(),
      });
    }
  }
  probe._depth.update(context, width, height);
  // Four half-float colors + packed depth-stencil, plus an R32F linear-depth view.
  probe.byteLength = width * height * (40 + (samples > 1 ? 36 * samples : 0));
  if (!probe._copyDepth || probe._logDepth !== scene.frameState.useLogDepth) {
    probe._copyDepth?.shaderProgram.destroy();
    probe._logDepth = scene.frameState.useLogDepth;
    probe._copyDepth = context.createViewportQuadCommand(
      new ShaderSource({
        defines: probe._logDepth ? ["LOG_DEPTH_READ_ONLY"] : [],
        sources: [depthShader],
      }),
      { uniformMap: { u_depth: () => probe._raw.getDepthStencilTexture() } },
    );
  }
}

/** Native material-buffer experiment; not a public renderer selection API. @private */
class _SceneGISGBuffer {
  static _isGlobeDepth(command) {
    return isGlobeDepth(command);
  }

  static _validate(scene, range, passState, isDeferredModel, isDeferredGlobe) {
    validate(scene, range, passState, isDeferredModel, isDeferredGlobe);
  }

  constructor(scene) {
    if (!scene || scene.isDestroyed() || scene._sceneGISGBuffer) {
      throw new DeveloperError(
        "G-buffer prototype requires an unbound live Scene.",
      );
    }
    this._scene = scene;
    this._enabled = false;
    this._ready = false;
    this._capturing = false;
    this._commands = new WeakMap();
    this._programs = new WeakMap();
    this._clear = new ClearCommand({
      color: Color.TRANSPARENT,
      depth: 1,
      stencil: 0,
    });
    this._clearColor = new ClearCommand({ color: Color.TRANSPARENT });
    this.debugView = 0;
    this.drawCount = 0;
    this.byteLength = 0;
    const texture = (index) =>
      this._raw?.getColorTexture(index) ?? scene.context.defaultTexture;
    this._debug = scene.postProcessStages.add(
      new PostProcessStage({
        fragmentShader: debugShader,
        uniforms: {
          u_diffuse: () => texture(0),
          u_normal: () => texture(1),
          u_specular: () => texture(2),
          u_emission: () => texture(3),
          u_depth: () =>
            this._depth?.getColorTexture() ?? scene.context.defaultTexture,
          u_view: () => this.debugView,
          u_ready: () => this.ready,
        },
      }),
    );
    this._debug.enabled = false;
    this._removePreRender = scene.preRender.addEventListener(() => {
      this._ready = false;
      this.drawCount = 0;
      this._debug.enabled = this.enabled && this.debugView !== 0;
    });
    this._removePostRender = scene.postRender.addEventListener(() => {
      // Native Scene skips the frustum loop when no commands remain.
      if (this.enabled && !this._ready && this._raw) {
        this._clear.framebuffer = this._raw.framebuffer;
        this._clear.execute(scene.context);
        if (this._resolve) {
          this._clear.framebuffer = this._resolve;
          this._clear.execute(scene.context);
        }
        this._clear.framebuffer = undefined;
        this._clearColor.framebuffer = this._depth.framebuffer;
        this._clearColor.execute(scene.context);
        this._clearColor.framebuffer = undefined;
      }
    });
    scene._sceneGISGBuffer = this;
  }

  get enabled() {
    return this._enabled;
  }
  set enabled(value) {
    this._enabled = value;
    if (!value) {
      this._debug.enabled = false;
      release(this);
    }
    this._scene.requestRender();
  }
  get ready() {
    return this._enabled && this._ready;
  }

  capture(passState, range, executeCommand) {
    this._ready = false;
    this._debug.enabled = this.enabled && this.debugView !== 0;
    if (!this.enabled) {
      return;
    }
    validate(this._scene, range, passState);
    allocate(this);
    const scene = this._scene;
    const context = scene.context;
    const previousFramebuffer = passState.framebuffer;
    const previousPass = context.uniformState.pass;
    this.drawCount = 0;
    try {
      passState.framebuffer = this._raw.framebuffer;
      this._clear.execute(context, passState);
      this._capturing = true;
      for (const pass of opaquePasses) {
        context.uniformState.updatePass(pass);
        for (let i = 0; i < range.indices[pass]; ++i) {
          const command = range.commands[pass][i];
          if (eligible(command)) {
            executeCommand(command, scene, passState);
          }
        }
      }
      if (this._resolve) {
        resolveMrt(
          context,
          this._raw.framebuffer,
          this._resolve,
          context.drawingBufferWidth,
          context.drawingBufferHeight,
          4,
        );
      }
      passState.framebuffer = this._depth.framebuffer;
      this._clearColor.execute(context, passState);
      this._copyDepth.execute(context, passState);
      this._ready = true;
    } finally {
      this._capturing = false;
      passState.framebuffer = previousFramebuffer;
      context.uniformState.updatePass(previousPass);
    }
  }

  draw(command, passState) {
    if (!this._capturing) {
      return false;
    }
    const scene = this._scene;
    command = SurfaceWeather.receiver(scene, command);
    const shader = command.shaderProgram;
    let program = this._programs.get(shader);
    if (!program) {
      const name = "sceneGIS_gbuffer_prototype";
      program = scene.context.shaderCache.getDerivedShaderProgram(shader, name);
      if (!program) {
        const fs = shader.fragmentShaderSource.clone();
        if (
          fs.sources.some((source) => source.includes("SCENEGIS_GBUFFER_MODEL"))
        ) {
          fs.defines.push("SCENEGIS_GBUFFER_MODEL_CAPTURE");
        }
        fs.sources = fs.sources.map((source) =>
          ShaderSource.replaceMain(source, "sceneGISGBufferMain"),
        );
        fs.sources.unshift(captureShader);
        fs.sources.push(
          "void main() { sceneGISGBufferMain(); sceneGISWriteGBuffer(); }",
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
      this._programs.set(shader, program);
    }
    const derived = DrawCommand.shallowClone(
      command,
      this._commands.get(command),
    );
    this._commands.set(command, derived);
    derived.shaderProgram = program;
    derived.framebuffer = this._raw.framebuffer;
    derived.execute(scene.context, passState);
    ++this.drawCount;
    return true;
  }

  isDestroyed() {
    return false;
  }
  destroy() {
    this._removePreRender();
    this._removePostRender();
    release(this);
    this._scene.postProcessStages.remove(this._debug);
    this._scene._sceneGISGBuffer = undefined;
    return destroyObject(this);
  }
}
export default _SceneGISGBuffer;
