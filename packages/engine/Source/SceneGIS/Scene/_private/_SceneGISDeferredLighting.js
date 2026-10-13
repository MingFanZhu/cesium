import Color from "../../../Core/Color.js";
import combine from "../../../Core/combine.js";
import destroyObject from "../../../Core/destroyObject.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderBuilder from "../../../Renderer/ShaderBuilder.js";
import ShaderDestination from "../../../Renderer/ShaderDestination.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import ImageBasedLightingPipelineStage from "../../../Scene/Model/ImageBasedLightingPipelineStage.js";
import LightingPipelineStage from "../../../Scene/Model/LightingPipelineStage.js";
import ModelColorPipelineStage from "../../../Scene/Model/ModelColorPipelineStage.js";
import LightingModel from "../../../Scene/Model/LightingModel.js";
import StencilConstants from "../../../Scene/StencilConstants.js";
import StencilFunction from "../../../Scene/StencilFunction.js";
import StencilOperation from "../../../Scene/StencilOperation.js";
import capture from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredCapture.js";
import classification from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredClassification.js";
import inputs from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredInputs.js";
import lighting from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredLighting.js";
import phongLighting from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredPhongLighting.js";
import globeLighting from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredGlobeLighting.js";
import globeOcean from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredGlobeOcean.js";
import atmosphereCommon from "../../../Shaders/AtmosphereCommon.js";
import groundAtmosphere from "../../../Shaders/GroundAtmosphere.js";
import globeAtmosphere from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredGlobeAtmosphere.js";
import restoreDepth from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredRestoreDepth.js";
import globeSurfaceLighting from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeSurfaceLighting.js";
import brunetonDefinitions from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonDefinitions.js";
import brunetonCommon from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonCommon.js";
import brunetonRuntime from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonRuntime.js";
import brunetonAtmosphere from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import cloudShadows from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadows.js";
import indirect from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOMain.js";
import depth from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODepth.js";
import common from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOCommon.js";
import GBuffer from "./_SceneGISGBuffer.js";
import DeferredInverse from "./_SceneGISDeferredInverse.js";
import LightingMrt from "./_SceneGISLightingMrt.js";
import LocalLights from "./_SceneGISLocalLights.js";
import SurfaceWeather from "./_SceneGISSurfaceWeather.js";
import WaterFrame from "./_SceneGISWaterFrame.js";

const opaquePasses = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
const classificationPasses = [
  Pass.TERRAIN_CLASSIFICATION,
  Pass.CESIUM_3D_TILE_CLASSIFICATION,
];
const lightingDefine =
  /^(LIGHTING_|HAS_MODEL_COLOR$|HAS_SELECTED_FEATURE_ID$|HAS_NORMALS$|USE_IBL_LIGHTING$|USE_CUSTOM_LIGHT_COLOR$|DIFFUSE_IBL$|SPECULAR_IBL$|CUSTOM_SPHERICAL_HARMONICS$|CUSTOM_SPECULAR_IBL$|SCENEGIS_MODEL_|SCENEGIS_SKY_REFLECTIONS$|SCENEGIS_GLOBE$)/;
const pendingGlobeBranches = ["TRANSLUCENT"];

function eligible(command) {
  return (
    command.owner?._sceneGISWater !== true && !GBuffer._isGlobeDepth(command)
  );
}

function shaderInfo(renderer, command) {
  const shader = command.shaderProgram;
  let info = renderer._shaders.get(shader);
  if (!info) {
    const fs = shader.fragmentShaderSource;
    info = {
      model: fs.sources.some((source) =>
        source.includes("SCENEGIS_GBUFFER_MODEL"),
      ),
      phong: fs.sources.some((source) =>
        source.includes("#define SCENEGIS_DEFERRED_PHONG_MATERIAL"),
      ),
      globe: fs.sources.some((source) =>
        source.includes("#define SCENEGIS_DEFERRED_GLOBE_MATERIAL"),
      ),
      globeDefines: fs.defines.filter((define) =>
        /^(FOG$|GROUND_ATMOSPHERE$|DYNAMIC_ATMOSPHERE_LIGHTING$|DYNAMIC_ATMOSPHERE_LIGHTING_FROM_SUN$|COLOR_CORRECT$|HIGHLIGHT_FILL_TILE$|UNDERGROUND_COLOR$|SCENEGIS_GLOBE$|SCENEGIS_GLOBE_SURFACE_LIGHTING$|COMBINED_SCATTERING_TEXTURES$|TRANSMITTANCE_TEXTURE_|SCATTERING_TEXTURE_|IRRADIANCE_TEXTURE_)/.test(
          define,
        ),
      ),
      globeWater:
        fs.defines.includes("HAS_WATER_MASK") &&
        (fs.defines.includes("SHOW_REFLECTIVE_OCEAN") ||
          fs.defines.includes("APPLY_MATERIAL")),
      globeOceanFabric:
        fs.defines.includes("SHOW_REFLECTIVE_OCEAN") &&
        fs.defines.includes("APPLY_MATERIAL"),
      globeVector: fs.defines.includes("HAS_VECTOR_LAYER"),
      pendingGlobeBranch: pendingGlobeBranches.find((name) =>
        fs.defines.includes(name),
      ),
      key: fs.defines.filter((define) => lightingDefine.test(define)).join(";"),
    };
    renderer._shaders.set(shader, info);
  }
  return info;
}

function sharedState(scene) {
  return [
    scene._sceneGISScreenSpaceReflections?._state,
    scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion,
    scene._sceneGISScreenSpaceIndirectLighting?._state,
  ].find((state) => state?.mainActive);
}

function release(renderer) {
  WaterFrame.releaseFinalDepth(renderer._scene);
  renderer._inverse?.destroy();
  renderer._inverse = undefined;
  renderer._framebuffer?.destroy();
  renderer._framebuffer = undefined;
  renderer._globeBlend?.destroy();
  renderer._globeBlend = undefined;
  renderer._classificationView?.destroy();
  renderer._classificationView = undefined;
  renderer._classification?.destroy();
  renderer._classification = undefined;
  renderer._markUnclassified?.shaderProgram.destroy();
  renderer._markUnclassified = undefined;
  renderer._raw?.destroy();
  renderer._raw = undefined;
  renderer._style?.destroy();
  renderer._style = undefined;
  renderer._ocean?.destroy();
  renderer._ocean = undefined;
  renderer._depth?.destroy();
  renderer._depth = undefined;
  renderer._linearDepth = undefined;
  renderer._copyDepth?.shaderProgram.destroy();
  renderer._copyDepth = undefined;
  renderer._restoreDepth?.shaderProgram.destroy();
  renderer._restoreDepth = undefined;
  renderer._attachedDepth = undefined;
  renderer._waterColor?.destroy();
  renderer._waterColor = undefined;
  renderer._copyWater?.shaderProgram.destroy();
  renderer._copyWater = undefined;
  renderer._waterReady = false;
  for (const groups of renderer._models.values()) {
    for (const group of groups.values()) {
      group.command.shaderProgram.destroy();
    }
  }
  renderer._models.clear();
  renderer._globeBatches.clear();
  renderer._groups.length = 0;
  renderer._commands = new WeakMap();
  renderer._classificationCommands = new WeakMap();
  renderer._classificationLights = new WeakMap();
  renderer._passthrough?.command.shaderProgram.destroy();
  renderer._passthrough = undefined;
  renderer._phong?.command.shaderProgram.destroy();
  renderer._phong = undefined;
  renderer._globe?.command.shaderProgram.destroy();
  renderer._globe = undefined;
  renderer._active = renderer._ready = false;
  renderer.byteLength = 0;
}

function allocate(renderer, manager) {
  const { context, frameState } = renderer._scene;
  const width = context.drawingBufferWidth;
  const height = context.drawingBufferHeight;
  renderer._raw ??= new FramebufferManager({
    colorAttachmentsLength: 4,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
  });
  const source = manager.framebuffer;
  const styleChanged = renderer._hasStyleTarget !== !!renderer._style;
  const oceanChanged = renderer._hasOcean !== !!renderer._ocean;
  const classificationChanged =
    renderer._hasClassification !== !!renderer._classification;
  if (
    renderer._raw.isDirty(width, height, 1) ||
    renderer._source !== source ||
    renderer._allocatedMultiFrustum !== renderer._multiFrustum ||
    styleChanged ||
    classificationChanged ||
    oceanChanged
  ) {
    renderer._framebuffer?.destroy();
    renderer._attachedDepth = undefined;
    renderer._globeBlend?.destroy();
    renderer._globeBlend = undefined;
    renderer._classificationView?.destroy();
    renderer._classificationView = undefined;
    renderer._raw.update(context, width, height);
    const colors = [0, 1, 2, 3].map((i) => renderer._raw.getColorTexture(i));
    if (renderer._hasStyleTarget) {
      renderer._style ??= new FramebufferManager({
        pixelDatatype: PixelDatatype.HALF_FLOAT,
      });
      renderer._style.update(context, width, height);
      colors.push(renderer._style.getColorTexture());
    } else {
      renderer._style?.destroy();
      renderer._style = undefined;
    }
    if (renderer._hasOcean) {
      renderer._ocean ??= new FramebufferManager({
        pixelDatatype: PixelDatatype.HALF_FLOAT,
      });
      renderer._ocean.update(context, width, height);
      colors.push(renderer._ocean.getColorTexture());
    } else {
      renderer._ocean?.destroy();
      renderer._ocean = undefined;
    }
    if (renderer._hasClassification) {
      renderer._classification ??= new FramebufferManager({
        pixelDatatype: PixelDatatype.HALF_FLOAT,
      });
      renderer._classification.update(context, width, height);
      const overlay = renderer._classification.getColorTexture();
      colors.push(overlay);
      renderer._classificationView = new Framebuffer({
        context,
        colorTextures: [overlay],
        depthStencilTexture: source.depthStencilTexture,
        destroyAttachments: false,
      });
    } else {
      renderer._classification?.destroy();
      renderer._classification = undefined;
    }
    renderer._framebuffer = new Framebuffer({
      context,
      colorTextures: colors,
      depthStencilTexture: source.depthStencilTexture,
      destroyAttachments: false,
    });
    renderer._source = source;
    renderer._allocatedMultiFrustum = renderer._multiFrustum;
  }
  if (renderer._globe && !renderer._globeBlend) {
    renderer._globeBlend = new Framebuffer({
      context,
      colorTextures: [renderer._raw.getColorTexture(0)],
      depthStencilTexture: source.depthStencilTexture,
      destroyAttachments: false,
    });
  } else if (!renderer._globe) {
    renderer._globeBlend?.destroy();
    renderer._globeBlend = undefined;
  }
  renderer.byteLength =
    width *
    height *
    (32 +
      (renderer._hasStyleTarget ? 8 : 0) +
      (renderer._hasOcean ? 8 : 0) +
      (renderer._hasClassification ? 8 : 0));
  const logDepth = frameState.useLogDepth;
  if (!renderer._copyDepth || renderer._logDepth !== logDepth) {
    renderer._copyDepth?.shaderProgram.destroy();
    renderer._copyDepth = context.createViewportQuadCommand(
      new ShaderSource({
        defines: [
          "SCENEGIS_DEFERRED_SURFACE_DEPTH",
          ...(logDepth ? ["LOG_DEPTH_READ_ONLY"] : []),
        ],
        sources: [depth],
      }),
      {
        uniformMap: {
          u_depth: () => renderer._source.depthStencilTexture,
          u_sceneGISDeferredMaterial: () => renderer._raw.getColorTexture(2),
          u_sceneGISDeferredSkipGlobe: () => renderer._preservedGlobeDepth,
        },
      },
    );
    renderer._logDepth = logDepth;
  }
}

function createGroup(renderer, model, key, family) {
  const scene = renderer._scene;
  const builder = new ShaderBuilder();
  const fragment = ShaderDestination.FRAGMENT;
  builder.setPositionAttribute("vec4", "position");
  builder.addVertexLines("void main() { gl_Position = position; }");
  builder.addDefine("HDR", undefined, fragment);
  builder.addDefine("SCENEGIS_DEFERRED_LIGHTING", undefined, fragment);
  builder.addDefine("SCENEGIS_GEOMETRY_SHADOW", undefined, fragment);
  builder.addFragmentLines([inputs, common]);
  if (model) {
    const resources = {
      model,
      shaderBuilder: builder,
      uniformMap: {},
      renderStateOptions: {},
      alphaOptions: {},
      lightingOptions: {
        lightingModel: key.includes("LIGHTING_PBR")
          ? LightingModel.PBR
          : LightingModel.UNLIT,
      },
    };
    if (key.includes("HAS_NORMALS")) {
      builder.addDefine("HAS_NORMALS", undefined, fragment);
    }
    if (key.includes("USE_IBL_LIGHTING")) {
      ImageBasedLightingPipelineStage.process(
        resources,
        model,
        scene.frameState,
      );
    }
    LightingPipelineStage.process(resources, undefined, scene.frameState);
    if (key.includes("HAS_MODEL_COLOR")) {
      ModelColorPipelineStage.process(resources, model, scene.frameState);
    }
    if (key.includes("HAS_SELECTED_FEATURE_ID")) {
      builder.addDefine("SCENEGIS_DEFERRED_FEATURE_STYLE", undefined, fragment);
    }
  } else if (family === "phong") {
    builder.addDefine("SCENEGIS_DEFERRED_PHONG_LIGHTING", undefined, fragment);
  } else if (family === "globe") {
    builder.addDefine("SCENEGIS_DEFERRED_GLOBE_LIGHTING", undefined, fragment);
    for (const define of key) {
      builder.addDefine(define, undefined, fragment);
    }
    if (key.includes("SCENEGIS_DEFERRED_GLOBE_WATER")) {
      builder.addFragmentLines(globeOcean);
    }
    if (key.includes("GROUND_ATMOSPHERE") || key.includes("FOG")) {
      builder.addFragmentLines([
        atmosphereCommon,
        groundAtmosphere,
        globeAtmosphere,
      ]);
    }
    if (key.includes("SCENEGIS_GLOBE_SURFACE_LIGHTING")) {
      builder.addFragmentLines([
        brunetonDefinitions,
        brunetonCommon,
        brunetonRuntime,
        brunetonAtmosphere,
        cloudShadows,
        globeSurfaceLighting,
      ]);
    }
  } else {
    builder.addDefine("SCENEGIS_DEFERRED_PASSTHROUGH", undefined, fragment);
  }
  builder.addFragmentLines(
    family === "globe"
      ? globeLighting
      : family === "phong"
        ? phongLighting
        : lighting,
  );
  const group = { id: -1, seen: false, sourceUniforms: undefined };
  const source = () => renderer._lightingInputs ?? renderer;
  group.uniforms = {
    u_sceneGISDeferredDiffuse: () => source()._raw.getColorTexture(0),
    u_sceneGISDeferredNormal: () => source()._raw.getColorTexture(1),
    u_sceneGISDeferredSpecular: () => source()._raw.getColorTexture(2),
    u_sceneGISDeferredEmission: () => source()._raw.getColorTexture(3),
    u_sceneGISDeferredStyle: () => source()._style.getColorTexture(),
    u_sceneGISDeferredOcean: () => renderer._ocean.getColorTexture(),
    u_linearDepth: () => source()._linearDepth,
    u_sceneGISDeferredGroup: () => group.id,
  };
  if (family === "globe") {
    // The first tile in a group may be a loaded tile without a fill-color uniform.
    group.uniforms.u_fillHighlightColor = () => scene.globe.fillHighlightColor;
  }
  group.command = new DrawCommand({
    owner: renderer,
    vertexArray: scene.context.getViewportQuadVertexArray(),
    primitiveType: PrimitiveType.TRIANGLES,
    shaderProgram: builder.buildShaderProgram(scene.context),
    uniformMap: group.uniforms,
    renderState: RenderState.fromCache({ depthMask: false }),
    pass: Pass.OPAQUE,
  });
  return group;
}

function prepareGroups(renderer, ranges) {
  renderer._hasInverseClassification =
    renderer._scene._environmentState.useInvertClassification &&
    ranges.some((range) => range.indices[Pass.CESIUM_3D_TILE] > 0);
  renderer._hasClassification =
    renderer._hasInverseClassification ||
    ranges.some((range) =>
      classificationPasses.some((pass) => range.indices[pass] > 0),
    );
  for (const groups of renderer._models.values()) {
    for (const group of groups.values()) {
      group.seen = false;
    }
  }
  renderer._groups.length = 0;
  renderer._hasPassthrough = false;
  renderer._globeBatches.clear();
  renderer._hasFeatureStyle = false;
  renderer._hasOcean = false;
  let hasOceanFabric = false;
  let hasPhong = false;
  let globeCommand;
  const globeDefines = new Set();
  for (const range of ranges) {
    for (const pass of opaquePasses) {
      for (let i = 0; i < range.indices[pass]; ++i) {
        const command = range.commands[pass][i];
        if (!eligible(command)) {
          continue;
        }
        const info = shaderInfo(renderer, command);
        if (info.globe) {
          if (info.pendingGlobeBranch) {
            throw new DeveloperError(
              `Deferred Globe material integration has not yet qualified ${info.pendingGlobeBranch}.`,
            );
          }
          globeCommand ??= command;
          renderer._hasClassification ||= info.globeVector;
          renderer._hasOcean ||= info.globeWater;
          hasOceanFabric ||= info.globeOceanFabric;
          renderer._globeBatches.set(
            command.owner,
            command.uniformMap.properties,
          );
          info.globeDefines.forEach((define) => globeDefines.add(define));
          continue;
        }
        if (info.phong) {
          hasPhong = true;
          continue;
        }
        if (!info.model) {
          renderer._hasPassthrough = true;
          continue;
        }
        const model = command.owner;
        let groups = renderer._models.get(model);
        if (!groups) {
          groups = new Map();
          renderer._models.set(model, groups);
        }
        const key = info.key;
        renderer._hasFeatureStyle ||= key.includes("HAS_SELECTED_FEATURE_ID");
        let group = groups.get(key);
        if (!group) {
          group = createGroup(renderer, model, key);
          groups.set(key, group);
        }
        if (group.seen) {
          continue;
        }
        group.seen = true;
        group.id = renderer._groups.length + 1;
        if (group.id > 2048) {
          throw new DeveloperError(
            "Deferred lighting exceeds the exact half-float group capacity (2048).",
          );
        }
        if (group.sourceUniforms !== command.uniformMap) {
          group.sourceUniforms = command.uniformMap;
          group.command.uniformMap = combine(
            group.uniforms,
            command.uniformMap,
          );
        }
        renderer._groups.push(group);
      }
    }
  }
  for (const [model, groups] of renderer._models) {
    for (const [key, group] of groups) {
      if (!group.seen) {
        group.command.shaderProgram.destroy();
        groups.delete(key);
      }
    }
    if (groups.size === 0) {
      renderer._models.delete(model);
    }
  }
  if (renderer._hasPassthrough) {
    renderer._passthrough ??= createGroup(renderer);
  }
  if (hasPhong) {
    renderer._phong ??= createGroup(renderer, undefined, undefined, "phong");
    renderer._phong.id = -2;
    renderer._groups.push(renderer._phong);
  } else {
    renderer._phong?.command.shaderProgram.destroy();
    renderer._phong = undefined;
  }
  if (globeCommand) {
    if (renderer._hasOcean) {
      globeDefines.add("SCENEGIS_DEFERRED_GLOBE_WATER");
    }
    if (hasOceanFabric) {
      globeDefines.add("SCENEGIS_DEFERRED_GLOBE_FABRIC");
    }
    const defines = [...globeDefines].sort();
    const key = defines.join(";");
    if (renderer._globe?.key !== key) {
      renderer._globe?.command.shaderProgram.destroy();
      renderer._globe = createGroup(renderer, undefined, defines, "globe");
      renderer._globe.key = key;
    }
    const group = renderer._globe;
    if (group.sourceUniforms !== globeCommand.uniformMap) {
      group.sourceUniforms = globeCommand.uniformMap;
      group.command.uniformMap = combine(
        group.uniforms,
        globeCommand.uniformMap,
      );
    }
    renderer._globe.id = -3;
    renderer._groups.push(renderer._globe);
  } else {
    renderer._globe?.command.shaderProgram.destroy();
    renderer._globe = undefined;
  }
  renderer._hasStyleTarget = renderer._hasFeatureStyle || hasOceanFabric;
  renderer.groupCount = renderer._groups.length;
}

function classificationLighting(renderer, command) {
  if (!renderer._hasClassification) {
    return command;
  }
  const context = renderer._scene.context;
  const shader = command.shaderProgram;
  let cached = renderer._classificationLights.get(command);
  if (
    !cached ||
    cached.shader !== shader ||
    cached.sourceUniforms !== command.uniformMap
  ) {
    const name = "sceneGIS_deferred_classification";
    let program = context.shaderCache.getDerivedShaderProgram(shader, name);
    if (!program) {
      const fs = shader.fragmentShaderSource.clone();
      fs.sources = fs.sources.map((source) =>
        ShaderSource.replaceMain(source, "sceneGISClassifiedLightingMain"),
      );
      fs.sources.push(classification);
      program = context.shaderCache.createDerivedShaderProgram(shader, name, {
        vertexShaderSource: shader.vertexShaderSource,
        fragmentShaderSource: fs,
        attributeLocations: shader._attributeLocations,
      });
    }
    cached = {
      shader,
      program,
      sourceUniforms: command.uniformMap,
      command: new DrawCommand(),
      uniformMap: combine(
        {
          u_sceneGISClassification: () =>
            renderer._classification.getColorTexture(),
        },
        command.uniformMap,
      ),
    };
    renderer._classificationLights.set(command, cached);
  }
  const derived = DrawCommand.shallowClone(command, cached.command);
  derived.shaderProgram = cached.program;
  derived.uniformMap = cached.uniformMap;
  return derived;
}

/** Private native-material lighting experiment, with no public selection API. @private */
class _SceneGISDeferredLighting {
  constructor(scene) {
    if (!scene || scene.isDestroyed() || scene._sceneGISDeferred) {
      throw new DeveloperError(
        "Deferred lighting requires an unbound live Scene.",
      );
    }
    this._scene = scene;
    this._enabled = this._active = this._ready = false;
    this._models = new Map();
    this._globeBatches = new Map();
    this._groups = [];
    this._commands = new WeakMap();
    this._classificationCommands = new WeakMap();
    this._classificationLights = new WeakMap();
    this._shaders = new WeakMap();
    this._isModelCommand = (command) => shaderInfo(this, command).model;
    this._isGlobeCommand = (command) =>
      command.pass === Pass.GLOBE && shaderInfo(this, command).globe;
    this._clear = new ClearCommand({ color: Color.TRANSPARENT });
    this.drawCount =
      this.classificationDrawCount =
      this.groupCount =
      this.lightDrawCount =
      this.byteLength =
        0;
    scene._sceneGISDeferred = this;
  }

  get enabled() {
    return this._enabled;
  }
  set enabled(value) {
    if (typeof value !== "boolean") {
      throw new DeveloperError("enabled must be boolean.");
    }
    this._enabled = value;
    if (!value) {
      release(this);
    }
    this._scene.requestRender();
  }
  get ready() {
    return this._enabled && this._ready;
  }

  get handlesInvertClassification() {
    return (
      this._active && this._scene._environmentState.useInvertClassification
    );
  }

  get inverseClassification() {
    return this.ready && this._inverse?._blendLayer ? this._inverse : undefined;
  }

  get tilesDepthTexture() {
    return this._inverse?._raw.getDepthStencilTexture();
  }

  applyInvertClassification(passState, range, executeCommand) {
    if (!this.handlesInvertClassification || !this._hasInverseClassification) {
      return;
    }
    const scene = this._scene;
    const context = scene.context;
    const pass = context.uniformState.pass;
    const original = passState.framebuffer;
    const ignoreShow = Pass.CESIUM_3D_TILE_CLASSIFICATION_IGNORE_SHOW;
    try {
      if (this._inverse) {
        passState.framebuffer = this._inverse.framebuffer;
      }
      context.uniformState.updatePass(ignoreShow);
      for (let i = 0; i < range.indices[ignoreShow]; ++i) {
        executeCommand(range.commands[ignoreShow][i], scene, passState);
        ++this.classificationDrawCount;
      }
      if (this._inverse) {
        passState.framebuffer = original;
        this._inverse.merge(this, passState);
        this.classificationDrawCount += 2;
        if (this._multiFrustum) {
          this._lightInverse(passState);
        }
        return;
      }
      this._markUnclassified ??= context.createViewportQuadCommand(
        "void main() { out_FragColor = vec4(czm_invertClassificationColor.rgb, -1.0); }",
        {
          renderState: RenderState.fromCache({
            depthMask: false,
            stencilMask: 0,
            stencilTest: {
              enabled: true,
              frontFunction: StencilFunction.EQUAL,
              backFunction: StencilFunction.EQUAL,
              reference: StencilConstants.CESIUM_3D_TILE_MASK,
              mask:
                StencilConstants.CESIUM_3D_TILE_MASK |
                StencilConstants.CLASSIFICATION_MASK,
              frontOperation: {
                fail: StencilOperation.KEEP,
                zFail: StencilOperation.KEEP,
                zPass: StencilOperation.KEEP,
              },
              backOperation: {
                fail: StencilOperation.KEEP,
                zFail: StencilOperation.KEEP,
                zPass: StencilOperation.KEEP,
              },
            },
          }),
        },
      );
      passState.framebuffer = this._classificationView;
      this._markUnclassified.execute(context, passState);
      ++this.classificationDrawCount;
      // Preserve the Tiles bit for the ordinary classification commands.
      scene._classificationStencilClearCommand.execute(context, passState);
    } finally {
      passState.framebuffer = original;
      context.uniformState.updatePass(pass);
    }
  }

  begin(passState) {
    this._active = this._ready = this._waterReady = false;
    this._linearDepth = undefined;
    this._preservedGlobeDepth = false;
    this.drawCount =
      this.classificationDrawCount =
      this.lightDrawCount =
      this.groupCount =
        0;
    if (!this.enabled || !this._scene.frameState.passes.render) {
      return;
    }
    const scene = this._scene;
    if (scene.msaaSamples > 1) {
      throw new DeveloperError(
        "Deferred lighting requires msaaSamples = 1. Select TAA or FXAA explicitly.",
      );
    }
    if (scene._sceneGISGBuffer?.enabled) {
      throw new DeveloperError(
        "Disable diagnostic G-buffer replay before enabling deferred lighting.",
      );
    }
    const ranges = scene._view.frustumCommandsList;
    this._multiFrustum = ranges.length > 1;
    if (ranges.length === 0) {
      release(this);
      return;
    }
    for (const range of ranges) {
      GBuffer._validate(
        scene,
        range,
        passState,
        this._isModelCommand,
        this._isGlobeCommand,
      );
    }
    const layout = LightingMrt.layout(
      scene,
      passState,
      eligible,
      scene._sceneGISScreenSpaceReflections?.enabled === true,
    );
    if (!layout || scene.shadowMap.debugCascadeColors) {
      throw new DeveloperError(
        "Deferred lighting requires a supported opaque lighting layout without cascade debug tint.",
      );
    }
    prepareGroups(this, ranges);
    const targetCount =
      4 +
      Number(this._hasStyleTarget) +
      Number(this._hasOcean) +
      Number(this._hasClassification) +
      Number(this._multiFrustum);
    if (
      targetCount > ContextLimits.maximumDrawBuffers ||
      targetCount > ContextLimits.maximumColorAttachments
    ) {
      throw new RuntimeError(
        `Deferred material layout requires ${targetCount} floating-point color attachments.`,
      );
    }
    allocate(this, layout.manager);
    WaterFrame.updateFinalDepth(scene);
    if (
      this._hasInverseClassification &&
      scene.frameState.invertClassificationColor.alpha < 1
    ) {
      this._inverse ??= new DeferredInverse(scene);
      this._inverse.update(this, passState);
      this.byteLength += this._inverse.byteLength;
    } else {
      this._inverse?.destroy();
      this._inverse = undefined;
    }
    const original = passState.framebuffer;
    try {
      // Clear owned colors only; native Scene owns the shared depth clear.
      passState.framebuffer = this._raw.framebuffer;
      this._clear.execute(scene.context, passState);
      if (this._style) {
        passState.framebuffer = this._style.framebuffer;
        this._clear.execute(scene.context, passState);
      }
      if (this._ocean) {
        passState.framebuffer = this._ocean.framebuffer;
        this._clear.execute(scene.context, passState);
      }
      if (this._classification) {
        passState.framebuffer = this._classification.framebuffer;
        this._clear.execute(scene.context, passState);
      }
    } finally {
      passState.framebuffer = original;
    }
    this._active = true;
  }

  beginFrustum(index, passState) {
    this._frustumTag = index + 1;
    this._inverse?.beginFrustum(index, passState);
    if (!this._multiFrustum || this._linearDepth) {
      return;
    }
    const scene = this._scene;
    const shared = sharedState(scene);
    let target;
    if (shared) {
      this._depth?.destroy();
      this._depth = undefined;
      target = shared.depth;
    } else {
      this._depth ??= new FramebufferManager({
        pixelFormat: PixelFormat.RG,
        pixelDatatype: PixelDatatype.FLOAT,
      });
      this._depth.update(
        scene.context,
        scene.drawingBufferWidth,
        scene.drawingBufferHeight,
        1,
        PixelDatatype.FLOAT,
        PixelFormat.RG,
      );
      target = this._depth;
      this.byteLength +=
        scene.drawingBufferWidth * scene.drawingBufferHeight * 8;
    }
    this._linearDepth = target.getColorTexture();
    if (this._attachedDepth !== this._linearDepth) {
      this._framebuffer.destroy();
      const colors = [0, 1, 2, 3].map((i) => this._raw.getColorTexture(i));
      for (const buffer of [this._style, this._ocean, this._classification]) {
        if (buffer) {
          colors.push(buffer.getColorTexture());
        }
      }
      colors.push(this._linearDepth);
      this._framebuffer = new Framebuffer({
        context: scene.context,
        colorTextures: colors,
        depthStencilTexture: this._source.depthStencilTexture,
        destroyAttachments: false,
      });
      this._attachedDepth = this._linearDepth;
    }
    target.clear(scene.context, this._clear, passState);
  }

  restoreFrustumDepth(index, passState) {
    const scene = this._scene;
    this._frustumTag = index + 1;
    this._inverse?.selectFrustum(index);
    if (
      !this._restoreDepth ||
      this._restoreLogDepth !== scene.frameState.useLogDepth
    ) {
      this._restoreDepth?.shaderProgram.destroy();
      this._restoreDepth = scene.context.createViewportQuadCommand(
        new ShaderSource({
          defines: scene.frameState.useLogDepth ? ["LOG_DEPTH_READ_ONLY"] : [],
          sources: [restoreDepth],
        }),
        {
          uniformMap: {
            u_linearDepth: () => this._linearDepth,
            u_material: () => this._raw.getColorTexture(2),
            u_frustumTag: () => this._frustumTag,
            u_clearGlobeDepth: () => scene._environmentState.clearGlobeDepth,
          },
          renderState: RenderState.fromCache({
            colorMask: { red: false, green: false, blue: false, alpha: false },
            depthTest: { enabled: true },
            depthMask: true,
          }),
        },
      );
      this._restoreLogDepth = scene.frameState.useLogDepth;
    }
    this._restoreDepth.execute(scene.context, passState);
  }

  draw(command, passState) {
    const scene = this._scene;
    const passes = scene.frameState.passes;
    if (
      !this._active ||
      !passes.render ||
      passes.pick ||
      passes.depth ||
      passes.pickVoxel
    ) {
      return false;
    }
    if (
      passState.framebuffer !== this._source &&
      (command.pass === Pass.GLOBE ||
        command.pass === Pass.TERRAIN_CLASSIFICATION)
    ) {
      // Native translucent classification owns its depth peel and color target.
      command.execute(scene.context, passState);
      return true;
    }
    if (classificationPasses.includes(command.pass)) {
      const derived = DrawCommand.shallowClone(
        command,
        this._classificationCommands.get(command),
      );
      this._classificationCommands.set(command, derived);
      derived.framebuffer = this._classificationView;
      derived.execute(scene.context, passState);
      ++this.classificationDrawCount;
      return true;
    }
    if (!opaquePasses.includes(command.pass) || !eligible(command)) {
      return false;
    }
    const info = shaderInfo(this, command);
    const model = info.model;
    const globeBlend = info.globe && command.renderState.blending.enabled;
    const finalGlobeBatch =
      info.globe &&
      this._globeBatches.get(command.owner) === command.uniformMap.properties;
    const group = model
      ? this._models.get(command.owner).get(info.key)
      : info.phong
        ? this._phong
        : info.globe
          ? this._globe
          : undefined;
    if (
      scene.frameState.shadowState.lightShadowsEnabled &&
      command.receiveShadows &&
      command.derivedCommands.shadows
    ) {
      command = command.derivedCommands.shadows.receiveCommand;
    }
    if (!model && !info.phong && !info.globe) {
      command = LocalLights.receiver(scene, command);
    }
    if (!info.globe) {
      command = SurfaceWeather.receiver(scene, command);
    }
    const shader = command.shaderProgram;
    let cached = this._commands.get(command);
    if (
      !cached ||
      cached.shader !== shader ||
      cached.styleTarget !== this._hasStyleTarget ||
      cached.ocean !== this._hasOcean ||
      cached.classification !== this._hasClassification ||
      cached.multiFrustum !== this._multiFrustum ||
      cached.globeBlend !== globeBlend ||
      cached.sourceUniforms !== command.uniformMap
    ) {
      const name = `sceneGIS_deferred_material_${this._hasStyleTarget ? 5 : 4}${this._hasOcean ? "_ocean" : ""}${this._hasClassification ? "_classification" : ""}${this._multiFrustum ? "_frusta" : ""}${globeBlend ? "_imagery" : ""}`;
      let program = scene.context.shaderCache.getDerivedShaderProgram(
        shader,
        name,
      );
      if (!program) {
        const fs = shader.fragmentShaderSource.clone();
        if (this._multiFrustum) {
          fs.defines.push(
            `SCENEGIS_DEFERRED_DEPTH_LOCATION ${4 + Number(this._hasStyleTarget) + Number(this._hasOcean) + Number(this._hasClassification)}`,
          );
        }
        if (this._hasStyleTarget) {
          fs.defines.push("SCENEGIS_DEFERRED_STYLE_TARGET");
        }
        if (this._hasOcean) {
          fs.defines.push(
            `SCENEGIS_DEFERRED_OCEAN_LOCATION ${4 + (this._hasStyleTarget ? 1 : 0)}`,
          );
        }
        if (this._hasClassification) {
          fs.defines.push(
            `SCENEGIS_DEFERRED_CLASSIFICATION_LOCATION ${4 + (this._hasStyleTarget ? 1 : 0) + (this._hasOcean ? 1 : 0)}`,
          );
        }
        if (model) {
          fs.defines.push(
            "SCENEGIS_GBUFFER_MODEL_CAPTURE",
            "SCENEGIS_DEFERRED_CAPTURE",
          );
        } else if (info.phong) {
          fs.defines.push("SCENEGIS_DEFERRED_PHONG_CAPTURE");
        } else if (info.globe) {
          fs.defines.push("SCENEGIS_DEFERRED_GLOBE_CAPTURE");
          if (globeBlend) {
            fs.defines.push("SCENEGIS_DEFERRED_GLOBE_BLEND");
          }
        } else {
          fs.defines.push("SCENEGIS_AO_MAIN", "SCENEGIS_AO_LOCATION 2");
          fs.sources.unshift(indirect);
        }
        fs.sources = fs.sources.map((source) =>
          ShaderSource.replaceMain(source, "sceneGISDeferredMaterialMain"),
        );
        fs.sources.push(capture);
        fs.sources.push(
          "void main() { sceneGISDeferredMaterialMain(); sceneGISWriteDeferredMaterial(); }",
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
      cached = {
        shader,
        styleTarget: this._hasStyleTarget,
        ocean: this._hasOcean,
        classification: this._hasClassification,
        multiFrustum: this._multiFrustum,
        globeBlend,
        sourceUniforms: command.uniformMap,
        uniformMap: combine(
          {
            u_sceneGISDeferredGroup: () => cached.group.id,
            u_sceneGISFinalImageryBatch: () => cached.finalGlobeBatch,
            u_sceneGISDeferredFrustumTag: () => this._frustumTag,
          },
          command.uniformMap,
        ),
        command: new DrawCommand(),
        program,
      };
      this._commands.set(command, cached);
    }
    cached.group = group ?? this._passthrough;
    cached.finalGlobeBatch = finalGlobeBatch;
    const derived = DrawCommand.shallowClone(command, cached.command);
    derived.shaderProgram = cached.program;
    derived.uniformMap = cached.uniformMap;
    const inverse = this._inverse && command.pass === Pass.CESIUM_3D_TILE;
    derived.framebuffer = inverse
      ? this._inverse.framebuffer
      : globeBlend
        ? this._globeBlend
        : this._framebuffer;
    if (inverse) {
      this._inverse.groups.add(cached.group);
    }
    derived.execute(scene.context, passState);
    ++this.drawCount;
    return true;
  }

  preserveGlobeDepth(passState) {
    if (
      this._active &&
      !this._multiFrustum &&
      this._scene._environmentState.clearGlobeDepth
    ) {
      this._captureDepth(passState);
      this._preservedGlobeDepth = true;
    }
  }

  _captureDepth(passState) {
    const scene = this._scene;
    const shared = sharedState(scene);
    if (this._multiFrustum) {
      return shared;
    }
    let target;
    if (shared) {
      // The lighting-MRT owner retains lifetime responsibility for this target.
      this._depth?.destroy();
      this._depth = undefined;
      target = shared.depth;
    } else {
      this._depth ??= new FramebufferManager({
        pixelFormat: PixelFormat.RED,
        pixelDatatype: PixelDatatype.FLOAT,
      });
      this._depth.update(
        scene.context,
        scene.drawingBufferWidth,
        scene.drawingBufferHeight,
        1,
        PixelDatatype.FLOAT,
        PixelFormat.RED,
      );
      target = this._depth;
      if (!this._linearDepth) {
        this.byteLength +=
          scene.drawingBufferWidth * scene.drawingBufferHeight * 4;
      }
    }
    const original = passState.framebuffer;
    try {
      passState.framebuffer = target.framebuffer;
      // Clear once per frame; preserve terrain across the native depth clear.
      if (!this._linearDepth) {
        this._clear.execute(scene.context, passState);
      }
      this._linearDepth = target.getColorTexture();
      this._copyDepth.execute(scene.context, passState);
    } finally {
      passState.framebuffer = original;
    }
    return shared;
  }

  _drawLight(group, passState, shared, inverse = false) {
    const scene = this._scene;
    let command =
      group === this._globe
        ? SurfaceWeather.receiver(scene, group.command)
        : group.command;
    command = LocalLights.receiver(scene, command);
    if (inverse) {
      command = this._inverse.lightCommand(command);
    } else {
      command = classificationLighting(this, command);
      if (shared) {
        command = LightingMrt.command(scene, shared, command);
      }
    }
    command.execute(scene.context, passState);
    ++this.lightDrawCount;
  }

  _lightInverse(passState) {
    const scene = this._scene;
    const original = passState.framebuffer;
    const pass = scene.context.uniformState.pass;
    try {
      passState.framebuffer = this._inverse.prepareLight(passState);
      this._lightingInputs = this._inverse;
      scene.context.uniformState.updatePass(Pass.OPAQUE);
      for (const group of this._inverse.groups) {
        this._drawLight(group, passState, undefined, true);
      }
    } finally {
      this._lightingInputs = undefined;
      passState.framebuffer = original;
      scene.context.uniformState.updatePass(pass);
    }
  }

  light(passState) {
    if (!this._active) {
      return;
    }
    const scene = this._scene;
    const original = passState.framebuffer;
    const pass = scene.context.uniformState.pass;
    try {
      const shared = this._captureDepth(passState);
      scene.context.uniformState.updatePass(Pass.OPAQUE);
      if (this._inverse && !this._multiFrustum) {
        this._lightInverse(passState);
      }
      if (this._hasPassthrough) {
        this._drawLight(this._passthrough, passState, shared);
      }
      for (const group of this._groups) {
        this._drawLight(group, passState, shared);
      }
      if (!shared && scene.frameState._sceneGISWater.surfaces.length > 0) {
        this._waterColor ??= new FramebufferManager({
          pixelDatatype: PixelDatatype.HALF_FLOAT,
        });
        this._waterColor.update(
          scene.context,
          scene.drawingBufferWidth,
          scene.drawingBufferHeight,
        );
        this._copyWater ??= scene.context.createViewportQuadCommand(
          "uniform sampler2D u_color; uniform sampler2D u_depth; void main() { ivec2 p=ivec2(gl_FragCoord.xy); out_FragColor=texelFetch(u_depth,p,0).r>0.0 ? vec4(texelFetch(u_color,p,0).rgb,1.0) : vec4(0.0); }",
          {
            uniformMap: {
              u_color: () => this._source.getColorTexture(0),
              u_depth: () => this._linearDepth,
            },
          },
        );
        passState.framebuffer = this._waterColor.framebuffer;
        this._copyWater.execute(scene.context, passState);
        this._waterReady = true;
      }
      this._ready = true;
    } finally {
      this._lightingInputs = undefined;
      this._active = false;
      passState.framebuffer = original;
      scene.context.uniformState.updatePass(pass);
    }
    return true;
  }

  isDestroyed() {
    return false;
  }
  destroy() {
    release(this);
    this._scene._sceneGISDeferred = undefined;
    this._scene.requestRender();
    this._scene = undefined;
    return destroyObject(this);
  }
}

export default _SceneGISDeferredLighting;
