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
import pointLighting from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredPointLighting.js";
import planarLighting from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredPlanarLighting.js";
import vectorLighting from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredVectorLighting.js";
import VectorEnvironmentResources from "../../Renderer/_private/_SceneGISVectorEnvironmentResources.js";
import globeLighting from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredGlobeLighting.js";
import globeOcean from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredGlobeOcean.js";
import restoreDepth from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredRestoreDepth.js";
import pickDepthSource from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredPickDepth.js";
import globeSurfaceLighting from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeSurfaceLighting.js";
import brunetonDefinitions from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonDefinitions.js";
import brunetonCommon from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonCommon.js";
import brunetonRuntime from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonRuntime.js";
import brunetonAtmosphere from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import cloudShadows from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadows.js";
import indirect from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOMain.js";
import depth from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODepth.js";
import common from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOCommon.js";
import DeferredLayout from "./_SceneGISDeferredLayout.js";
import VectorOverlays from "./_SceneGISDeferredVectorOverlays.js";
import PlanarVectorOverlays from "./_SceneGISPlanarVectorOverlays.js";
import Annotations from "./_SceneGISDeferredAnnotations.js";
import VectorSymbolOcclusion from "./_SceneGISVectorSymbolOcclusion.js";
import VectorSymbolPicking from "./_SceneGISVectorSymbolPicking.js";
import MaterialExtensions from "./_SceneGISDeferredMaterialExtensions.js";
import DepthFunction from "../../../Scene/DepthFunction.js";
import DeferredInverse from "./_SceneGISDeferredInverse.js";
import LightingMrt from "./_SceneGISLightingMrt.js";
import LocalLights from "./_SceneGISLocalLights.js";
import SurfaceWeather from "./_SceneGISSurfaceWeather.js";
import PlanarEnvironmentLighting from "./_SceneGISPlanarEnvironmentLighting.js";
import WaterFrame from "./_SceneGISWaterFrame.js";
import PointEDL from "./_SceneGISDeferredPointEDL.js";
import MaterialArray from "../../Renderer/_SceneGISMaterialArray.js";
import DeferredDebug from "./_SceneGISDeferredDebug.js";

const opaquePasses = [
  Pass.GLOBE,
  Pass.CESIUM_3D_TILE,
  Pass.OPAQUE,
  Pass.SCENEGIS_VECTOR,
];
const classificationPasses = [
  Pass.TERRAIN_CLASSIFICATION,
  Pass.CESIUM_3D_TILE_CLASSIFICATION,
];
const lightingDefine =
  /^(PRIMITIVE_TYPE_POINTS$|HAS_POINT_CLOUD_COLOR_STYLE$|HAS_PRIMITIVE_OUTLINE$|USE_CLEARCOAT$|USE_ANISOTROPY$|USE_SPECULAR$|LIGHTING_|HAS_MODEL_COLOR$|HAS_SELECTED_FEATURE_ID$|HAS_NORMALS$|USE_IBL_LIGHTING$|USE_CUSTOM_LIGHT_COLOR$|DIFFUSE_IBL$|SPECULAR_IBL$|CUSTOM_SPHERICAL_HARMONICS$|CUSTOM_SPECULAR_IBL$|SCENEGIS_MODEL_|SCENEGIS_SKY_REFLECTIONS$|SCENEGIS_GLOBE$)/;
const pendingGlobeBranches = ["TRANSLUCENT"];

function executeVoxel(renderer, command, passState) {
  const context = renderer._scene.context;
  const cache = (renderer._voxelCommands ??= new WeakMap());
  let cached = cache.get(command);
  if (!cached) {
    cached = { command: new DrawCommand() };
    cache.set(command, cached);
  }
  const source = command.shaderProgram;
  const key = "sceneGIS_voxel_linear_depth";
  let shader = context.shaderCache.getDerivedShaderProgram(source, key);
  if (!shader) {
    const fs = source.fragmentShaderSource.clone();
    fs.defines.push("SCENEGIS_DEFERRED_VOXEL_DEPTH");
    shader = context.shaderCache.createDerivedShaderProgram(source, key, {
      vertexShaderSource: source.vertexShaderSource,
      fragmentShaderSource: fs,
      attributeLocations: source._attributeLocations,
    });
  }
  const derived = DrawCommand.shallowClone(command, cached.command);
  if (cached.sourceUniforms !== command.uniformMap) {
    cached.uniformMap = combine(command.uniformMap, {
      u_sceneGISVoxelDepth: () => {
        const scene = renderer._scene;
        const temporal = scene._sceneGISTemporalAntialiasing?._state;
        if (temporal?.active && temporal.deferredCaptured) {
          return temporal.depth.getColorTexture();
        }
        const water = scene.frameState._sceneGISWater?.finalDepth;
        return water?.captured
          ? water.depth.getColorTexture()
          : renderer.opaqueDepthTexture;
      },
    });
    cached.sourceUniforms = command.uniformMap;
  }
  derived.shaderProgram = shader;
  derived.uniformMap = cached.uniformMap;
  DeferredDebug.receiver(renderer._scene, derived).execute(context, passState);
}

function eligible(command) {
  return (
    !(command instanceof ClearCommand) &&
    !DeferredLayout.isDebugOverlay(command) &&
    command.owner?._sceneGISWater !== true &&
    !DeferredLayout.isGlobeDepth(command) &&
    !DeferredLayout.isAnnotation(command)
  );
}

function shaderInfo(renderer, command) {
  const shader = command.shaderProgram;
  let info = renderer._shaders.get(shader);
  if (!info) {
    const fs = shader.fragmentShaderSource;
    const pointPosition =
      fs.defines.includes("PRIMITIVE_TYPE_POINTS") &&
      fs.defines.includes("LIGHTING_PBR") &&
      fs.defines.includes("HAS_NORMALS");
    const extensionDefines = fs.defines.filter(
      (name) =>
        [
          "USE_SPECULAR",
          "USE_CLEARCOAT",
          "USE_ANISOTROPY",
          "HAS_PRIMITIVE_OUTLINE",
        ].includes(name) ||
        (pointPosition && name === "PRIMITIVE_TYPE_POINTS"),
    );
    info = {
      model: fs.sources.some((source) =>
        source.includes("SCENEGIS_GBUFFER_MODEL"),
      ),
      phong: fs.sources.some((source) =>
        source.includes("#define SCENEGIS_DEFERRED_PHONG_MATERIAL"),
      ),
      sunPhong: fs.defines.includes("ONLY_SUN_LIGHTING"),
      point: fs.sources.some((source) =>
        source.includes("#define SCENEGIS_DEFERRED_POINT_MATERIAL"),
      ),
      featureStyle: fs.defines.includes("HAS_SELECTED_FEATURE_ID"),
      extensionDefines,
      extensions: extensionDefines.length > 0,
      unlitOverlay: fs.defines.some(
        (name) =>
          name === "HAS_CLIPPING_PLANES" ||
          name === "HAS_SILHOUETTE" ||
          name === "HAS_EDGE_VISIBILITY",
      ),
      planar: fs.sources.some((source) =>
        source.includes("#define SCENEGIS_DEFERRED_PLANAR_MATERIAL"),
      ),
      vector: fs.sources.some((source) =>
        source.includes("#define SCENEGIS_DEFERRED_VECTOR_MATERIAL"),
      ),
      vectorDefines: fs.defines.filter((define) =>
        /^(SCENEGIS_VECTOR_ENVIRONMENT$|SCENEGIS_VECTOR_SHADOWS$|SCENEGIS_VECTOR_SHADOW_CASCADES$|USE_SHADOW_DEPTH_TEXTURE$|USE_SOFT_SHADOWS$|SCENEGIS_GLOBE$|COMBINED_SCATTERING_TEXTURES$|TRANSMITTANCE_TEXTURE_|SCATTERING_TEXTURE_|IRRADIANCE_TEXTURE_)/.test(
          define,
        ),
      ),
      planarDefines: ["SCENEGIS_ADVANCED_LIGHTING"].filter((name) =>
        fs.sources.some((source) => source.includes(`#define ${name}`)),
      ),
      globe: fs.sources.some((source) =>
        source.includes("#define SCENEGIS_DEFERRED_GLOBE_MATERIAL"),
      ),
      globeDefines: fs.defines.filter((define) =>
        /^(HIGHLIGHT_FILL_TILE$|UNDERGROUND_COLOR$|SCENEGIS_GLOBE$|SCENEGIS_GLOBE_SURFACE_LIGHTING$|COMBINED_SCATTERING_TEXTURES$|TRANSMITTANCE_TEXTURE_|SCATTERING_TEXTURE_|IRRADIANCE_TEXTURE_)/.test(
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

function groupKey(info, edl) {
  return `${info.point ? "point;" : ""}${info.key}${edl ? ";EDL" : ""}`;
}

function release(renderer) {
  DeferredDebug.release(renderer);
  PointEDL.release(renderer);
  renderer._planarVectors?.destroy();
  renderer._planarVectors = undefined;
  renderer._vectorOverlays?.destroy();
  renderer._vectorOverlays = undefined;
  Annotations.release(renderer);
  VectorSymbolOcclusion.release(renderer);
  VectorSymbolPicking.release(renderer);
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
  renderer._extensionView?.destroy();
  renderer._extensionView = undefined;
  renderer._extensions?.destroy();
  renderer._extensions = undefined;
  renderer._allocatedExtensionKey = undefined;
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
  renderer._pickDepthCopy?.shaderProgram.destroy();
  renderer._pickDepthCopy = undefined;
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
  renderer._sunPhong?.command.shaderProgram.destroy();
  renderer._sunPhong = undefined;
  renderer._point?.command.shaderProgram.destroy();
  renderer._point = undefined;
  renderer._planar?.command.shaderProgram.destroy();
  renderer._planar = undefined;
  renderer._vector?.command.shaderProgram.destroy();
  renderer._vector = undefined;
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
  const extensionChanged =
    renderer._allocatedExtensionKey !== renderer._extensionLayout.key ||
    renderer._allocatedExtensionCombined !== renderer._extensionCombined;
  const styleChanged = renderer._hasStyleTarget !== !!renderer._style;
  const oceanChanged = renderer._hasOcean !== !!renderer._ocean;
  const classificationChanged =
    renderer._hasClassification !== !!renderer._classification;
  const vector = renderer._vectorOverlays;
  vector?.raw.update(context, width, height);
  const vectorTexture = vector?.raw.getColorTexture();
  const vectorChanged =
    renderer._allocatedVectorTarget !== vectorTexture ||
    renderer._allocatedVectorCombined !== vector?.combined;
  if (
    renderer._raw.isDirty(width, height, 1) ||
    renderer._source !== source ||
    renderer._allocatedMultiFrustum !== renderer._multiFrustum ||
    extensionChanged ||
    styleChanged ||
    classificationChanged ||
    oceanChanged ||
    vectorChanged
  ) {
    renderer._framebuffer?.destroy();
    renderer._attachedDepth = undefined;
    renderer._globeBlend?.destroy();
    renderer._globeBlend = undefined;
    renderer._classificationView?.destroy();
    renderer._classificationView = undefined;
    renderer._raw.update(context, width, height);
    renderer._extensionView?.destroy();
    renderer._extensionView = undefined;
    const extensionCount = renderer._extensionLayout.count;
    if (renderer._extensions?._colorAttachmentsLength !== extensionCount) {
      renderer._extensions?.destroy();
      renderer._extensions = undefined;
    }
    if (extensionCount) {
      renderer._extensions ??= new MaterialArray(extensionCount);
      renderer._extensions.update(context, width, height);
      renderer._extensionView = new Framebuffer({
        context,
        colorTextures: Array.from({ length: extensionCount }, (_, i) =>
          renderer._extensions.getColorTexture(i),
        ),
        depthStencilTexture: source.depthStencilTexture,
        destroyAttachments: false,
      });
    }
    renderer._allocatedExtensionKey = renderer._extensionLayout.key;
    renderer._allocatedExtensionCombined = renderer._extensionCombined;
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
        colorTextures: vectorTexture ? [overlay, vectorTexture] : [overlay],
        depthStencilTexture: source.depthStencilTexture,
        destroyAttachments: false,
      });
    } else {
      renderer._classification?.destroy();
      renderer._classification = undefined;
    }
    if (renderer._extensionCombined) {
      for (let i = 0; i < renderer._extensionLayout.count; ++i) {
        colors.push(renderer._extensions.getColorTexture(i));
      }
    }
    if (vector?.combined) {
      colors.push(vectorTexture);
    }
    renderer._framebuffer = new Framebuffer({
      context,
      colorTextures: colors,
      depthStencilTexture: source.depthStencilTexture,
      destroyAttachments: false,
    });
    renderer._source = source;
    renderer._allocatedMultiFrustum = renderer._multiFrustum;
    renderer._allocatedVectorTarget = vectorTexture;
    renderer._allocatedVectorCombined = vector?.combined;
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
        renderer._extensionLayout.count * 8 +
        (renderer._hasStyleTarget ? 8 : 0) +
        (renderer._hasOcean ? 8 : 0) +
        (renderer._hasClassification ? 8 : 0) +
        (vector ? 8 : 0)) +
    (renderer._planarVectors?.byteLength ?? 0);
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

function createGroup(renderer, model, key, family, edl) {
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
    for (const define of [
      "HAS_POINT_CLOUD_COLOR_STYLE",
      "PRIMITIVE_TYPE_POINTS",
      "USE_SPECULAR",
      "USE_CLEARCOAT",
      "USE_ANISOTROPY",
      "HAS_PRIMITIVE_OUTLINE",
    ]) {
      if (key.includes(define)) {
        builder.addDefine(define, undefined, fragment);
      }
    }
    if (key.includes("HAS_PRIMITIVE_OUTLINE")) {
      builder.addUniform("vec4", "model_outlineColor", fragment);
      if (renderer._extensionLayout.outlineInStyle) {
        builder.addDefine(
          "SCENEGIS_DEFERRED_OUTLINE_STYLE",
          undefined,
          fragment,
        );
      }
    }
    if (renderer._extensionLayout.count) {
      builder.addDefine("SCENEGIS_DEFERRED_EXTENSIONS", undefined, fragment);
      builder.addFragmentLines(
        MaterialExtensions.lightingSource(renderer._extensionLayout),
      );
    }
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
    if (key === "sun") {
      builder.addDefine("ONLY_SUN_LIGHTING", undefined, fragment);
    }
  } else if (family === "point") {
    builder.addDefine("SCENEGIS_DEFERRED_POINT_LIGHTING", undefined, fragment);
  } else if (family === "planar") {
    for (const define of key) {
      builder.addDefine(define, undefined, fragment);
    }
    if (key.includes("SCENEGIS_ADVANCED_LIGHTING")) {
      builder.addFragmentLines(PlanarEnvironmentLighting.source);
    }
  } else if (family === "vector") {
    for (const define of key) {
      builder.addDefine(define, undefined, fragment);
    }
    if (key.includes("SCENEGIS_VECTOR_ENVIRONMENT")) {
      builder.addFragmentLines(
        VectorEnvironmentResources.lightingSource(
          key.includes("SCENEGIS_GLOBE"),
        ),
      );
    }
  } else if (family === "globe") {
    builder.addDefine("SCENEGIS_DEFERRED_GLOBE_LIGHTING", undefined, fragment);
    for (const define of key) {
      builder.addDefine(define, undefined, fragment);
    }
    if (key.includes("SCENEGIS_DEFERRED_GLOBE_WATER")) {
      builder.addFragmentLines(globeOcean);
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
  let lightingSource =
    family === "globe"
      ? globeLighting
      : family === "phong"
        ? phongLighting
        : family === "point"
          ? pointLighting
          : family === "planar"
            ? planarLighting
            : family === "vector"
              ? vectorLighting
              : lighting;
  if (edl) {
    builder.addDefine("SCENEGIS_DEFERRED_POINT_EDL", undefined, fragment);
    lightingSource = ShaderSource.replaceMain(
      lightingSource,
      "sceneGISPointLitMain",
    );
  }
  builder.addFragmentLines(lightingSource);
  if (edl) {
    builder.addFragmentLines(PointEDL.lighting);
  }
  const group = {
    id: -1,
    seen: false,
    sourceUniforms: undefined,
    extensionKey: renderer._extensionLayout.key,
    edl,
  };
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
  group.uniforms.u_sceneGISExtensions = () => source()._extensions.texture;
  if (edl) {
    group.uniforms = PointEDL.uniforms(edl, group.uniforms);
  }
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
  const extensionDefines = new Set();
  let extensionStyleTarget = false;
  for (const range of ranges) {
    for (const pass of opaquePasses) {
      for (let i = 0; i < range.indices[pass]; ++i) {
        const command = range.commands[pass][i];
        if (eligible(command)) {
          const info = shaderInfo(renderer, command);
          extensionStyleTarget ||= info.globeOceanFabric;
          if (info.model) {
            extensionStyleTarget ||= info.featureStyle;
            info.extensionDefines.forEach((name) => extensionDefines.add(name));
          }
        }
      }
    }
  }
  const extensionKey = `${[...extensionDefines].sort().join(";")}_${extensionStyleTarget}`;
  if (!renderer._extensionLayouts.has(extensionKey)) {
    renderer._extensionLayouts.set(
      extensionKey,
      MaterialExtensions.layout(extensionDefines, extensionStyleTarget),
    );
  }
  renderer._extensionLayout = renderer._extensionLayouts.get(extensionKey);
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
  let hasSunPhong = false;
  let hasPoint = false;
  let planarCommand;
  let vectorCommand;
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
        const edl = renderer._pointEDLOwners.get(command.owner);
        if (info.point && !edl) {
          hasPoint = true;
          continue;
        }
        if (info.vector) {
          vectorCommand ??= command;
          continue;
        }
        if (info.planar) {
          planarCommand ??= command;
          continue;
        }
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
          if (info.sunPhong) {
            hasSunPhong = true;
          } else {
            hasPhong = true;
          }
          continue;
        }
        if (!info.model && !edl) {
          renderer._hasPassthrough = true;
          continue;
        }
        renderer._hasPassthrough ||= info.unlitOverlay && !edl;
        const model = command.owner;
        let groups = renderer._models.get(model);
        if (!groups) {
          groups = new Map();
          renderer._models.set(model, groups);
        }
        const key = groupKey(info, edl);
        renderer._hasFeatureStyle ||= key.includes("HAS_SELECTED_FEATURE_ID");
        let group = groups.get(key);
        if (
          group &&
          (group.extensionKey !== renderer._extensionLayout.key ||
            group.edl !== edl)
        ) {
          group.command.shaderProgram.destroy();
          group = undefined;
        }
        if (!group) {
          group = createGroup(
            renderer,
            info.model ? model : undefined,
            key,
            info.point ? "point" : undefined,
            edl,
          );
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
  if (hasPoint) {
    renderer._point ??= createGroup(renderer, undefined, undefined, "point");
    renderer._point.id = -7;
    renderer._groups.push(renderer._point);
  } else {
    renderer._point?.command.shaderProgram.destroy();
    renderer._point = undefined;
  }
  if (hasSunPhong) {
    renderer._sunPhong ??= createGroup(renderer, undefined, "sun", "phong");
    renderer._sunPhong.id = -4;
    renderer._groups.push(renderer._sunPhong);
  } else {
    renderer._sunPhong?.command.shaderProgram.destroy();
    renderer._sunPhong = undefined;
  }
  if (planarCommand) {
    const defines = shaderInfo(renderer, planarCommand).planarDefines;
    const key = defines.join(";");
    if (renderer._planar?.key !== key) {
      renderer._planar?.command.shaderProgram.destroy();
      renderer._planar = createGroup(renderer, undefined, defines, "planar");
      renderer._planar.key = key;
      renderer._planar.id = -5;
    }
    const group = renderer._planar;
    if (group.sourceUniforms !== planarCommand.uniformMap) {
      group.sourceUniforms = planarCommand.uniformMap;
      group.command.uniformMap = combine(
        group.uniforms,
        planarCommand.uniformMap,
      );
    }
    renderer._groups.push(group);
  } else {
    renderer._planar?.command.shaderProgram.destroy();
    renderer._planar = undefined;
  }
  if (vectorCommand) {
    const defines = shaderInfo(renderer, vectorCommand).vectorDefines;
    const key = defines.join(";");
    if (renderer._vector?.key !== key) {
      renderer._vector?.command.shaderProgram.destroy();
      renderer._vector = createGroup(renderer, undefined, defines, "vector");
      renderer._vector.key = key;
      renderer._vector.id = -6;
    }
    const group = renderer._vector;
    if (group.sourceUniforms !== vectorCommand.uniformMap) {
      group.sourceUniforms = vectorCommand.uniformMap;
      group.command.uniformMap = combine(
        group.uniforms,
        vectorCommand.uniformMap,
      );
    }
    renderer._groups.push(group);
  } else {
    renderer._vector?.command.shaderProgram.destroy();
    renderer._vector = undefined;
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

/** Scene-owned native-material deferred lighting. @private */
class _SceneGISDeferredLighting {
  constructor(scene) {
    if (!scene || scene.isDestroyed() || scene._sceneGISDeferred) {
      throw new DeveloperError(
        "Deferred lighting requires an unbound live Scene.",
      );
    }
    this._scene = scene;
    this._active = this._ready = false;
    this._models = new Map();
    this._extensionLayouts = new Map();
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
    this.annotationDrawCount = this.annotationDepthCopyCount = 0;
    this.drawCount =
      this.materialExtensionDrawCount =
      this.colorCorrectionDrawCount =
      this.classificationDrawCount =
      this.groupCount =
      this.lightDrawCount =
      this.byteLength =
        0;
    scene._sceneGISDeferred = this;
  }

  get ready() {
    return this._ready;
  }

  get opaqueDepthTexture() {
    return this._annotations?.ready
      ? this._annotations.depth.getColorTexture()
      : this._linearDepth;
  }

  prepareAnnotationCommands() {
    Annotations.prepareCommands(this);
  }

  preparePlanarVectors(passState) {
    PlanarVectorOverlays.prepare(this, passState);
  }

  classifyPlanarVectors(range, passState, executeCommand) {
    if (!this._planarVectors) {
      return false;
    }
    this._planarVectors.classify(range, passState, executeCommand);
    return true;
  }

  drawPlanarVectors(range, passState, executePass) {
    if (!this._planarVectors || this._scene.frameState.passes.pick) {
      return false;
    }
    this._planarVectors.translucent(range, passState, executePass);
    return true;
  }

  prepareAnnotations(passState) {
    Annotations.captureDepth(this, passState);
  }

  debugCommand(command) {
    return DeferredDebug.receiver(this._scene, command);
  }

  clear(command, passState) {
    const passes = this._scene.frameState.passes;
    if (
      !this._active ||
      !this._inverse ||
      !passes.render ||
      passes.pick ||
      passes.depth ||
      command.pass !== Pass.CESIUM_3D_TILE ||
      command.framebuffer !== undefined
    ) {
      return false;
    }
    const original = passState.framebuffer;
    try {
      passState.framebuffer = this._inverse.framebuffer;
      command.execute(this._scene.context, passState);
    } finally {
      passState.framebuffer = original;
    }
    return true;
  }

  drawDebugOverlays(range, passState, executeCommand) {
    this._drawingDebugOverlays = true;
    try {
      const pass = Pass.OPAQUE;
      for (let i = 0; i < range.indices[pass]; ++i) {
        const command = range.commands[pass][i];
        if (DeferredLayout.isDebugOverlay(command)) {
          executeCommand(command, this._scene, passState);
        }
      }
    } finally {
      this._drawingDebugOverlays = false;
    }
  }

  drawAnnotations(range, index, passState, executeCommand) {
    Annotations.draw(this, range, index, passState, executeCommand);
  }

  drawVectorAnnotations(passState, frustum, executeCommand) {
    Annotations.drawVectors(this, passState, frustum, executeCommand);
  }

  drawVectorMaterials(range, passState, executeCommand) {
    const scene = this._scene;
    if (!scene.frameState.passes.pick && !scene.frameState.passes.depth) {
      if (!this._active) {
        return;
      }
      VectorSymbolOcclusion.capture(this, passState);
    }
    scene.context.uniformState.updatePass(Pass.SCENEGIS_VECTOR);
    for (let i = 0; i < range.indices[Pass.SCENEGIS_VECTOR]; ++i) {
      const command = range.commands[Pass.SCENEGIS_VECTOR][i];
      if (
        this._vectorSymbolPicking?.active &&
        command.shaderProgram.fragmentShaderSource.defines.includes(
          "SCENEGIS_VECTOR_SYMBOL",
        )
      ) {
        continue;
      }
      executeCommand(command, scene, passState);
    }
  }

  drawVectorSymbolPicks(passState, frustum) {
    VectorSymbolPicking.draw(this, passState, frustum);
  }

  prepareVectorPicks(passState) {
    VectorSymbolPicking.begin(this, passState);
  }

  drawVectorPickObject(command, passState) {
    return VectorSymbolPicking.object(this, command, passState, shaderInfo);
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

  prepare() {
    DeferredLayout.validateScene(this._scene);
  }

  begin(passState) {
    this._active = this._ready = this._waterReady = false;
    this._linearDepth = undefined;
    this._preservedGlobeDepth = false;
    this.annotationDrawCount = this.annotationDepthCopyCount = 0;
    this.drawCount =
      this.materialExtensionDrawCount =
      this.colorCorrectionDrawCount =
      this.classificationDrawCount =
      this.lightDrawCount =
      this.groupCount =
        0;
    if (!this._scene.frameState.passes.render) {
      return;
    }
    const scene = this._scene;
    const ranges = scene._view.frustumCommandsList;
    this._multiFrustum = ranges.length > 1;
    if (ranges.length === 0) {
      release(this);
      return;
    }
    for (const range of ranges) {
      DeferredLayout.validate(
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
    if (!layout) {
      throw new DeveloperError(
        "Deferred lighting requires a supported opaque lighting layout.",
      );
    }
    PointEDL.prepare(this, ranges);
    prepareGroups(this, ranges);
    VectorOverlays.prepare(this, ranges);
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
    this._extensionLocation = targetCount;
    this._extensionCombined =
      targetCount + this._extensionLayout.count <=
      Math.min(
        ContextLimits.maximumDrawBuffers,
        ContextLimits.maximumColorAttachments,
      );
    if (this._vectorOverlays) {
      const location =
        targetCount +
        (this._extensionCombined ? this._extensionLayout.count : 0);
      this._vectorOverlays.combined =
        location <
        Math.min(
          ContextLimits.maximumDrawBuffers,
          ContextLimits.maximumColorAttachments,
        );
      this._vectorOverlayLocation = this._vectorOverlays.combined
        ? location
        : undefined;
    } else {
      this._vectorOverlayLocation = undefined;
    }
    allocate(this, layout.manager);
    DeferredDebug.update(this, ranges, passState);
    PointEDL.draw(this, passState);
    this.byteLength += this.pointEDLByteLength;
    Annotations.update(this, ranges);
    VectorSymbolOcclusion.update(this, ranges, passState, eligible, shaderInfo);
    WaterFrame.updateFinalDepth(scene);
    if (
      this._hasInverseClassification &&
      scene.frameState.invertClassificationColor.alpha < 1
    ) {
      this._inverse ??= new DeferredInverse(scene);
      this._inverse.update(this, passState);
      this.byteLength += this._inverse.byteLength;
      if (this._debugTint) {
        this.debugTintByteLength +=
          scene.drawingBufferWidth * scene.drawingBufferHeight * 4;
      }
    } else {
      this._inverse?.destroy();
      this._inverse = undefined;
    }
    const original = passState.framebuffer;
    try {
      // Clear owned colors only; native Scene owns the shared depth clear.
      passState.framebuffer = this._raw.framebuffer;
      this._clear.execute(scene.context, passState);
      if (this._extensions) {
        passState.framebuffer = this._extensions.framebuffer;
        this._clear.execute(scene.context, passState);
      }
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
      if (this._vectorOverlays) {
        passState.framebuffer = this._vectorOverlays.raw.framebuffer;
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
      if (this._extensionCombined) {
        for (let i = 0; i < this._extensionLayout.count; ++i) {
          colors.push(this._extensions.getColorTexture(i));
        }
      }
      if (this._vectorOverlays?.combined) {
        colors.push(this._vectorOverlays.raw.getColorTexture());
      }
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
            u_linearDepth: () => this.opaqueDepthTexture,
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

  copyPickDepth(pickDepth, depthTexture, index, passState) {
    const scene = this._scene;
    const passes = scene.frameState.passes;
    if (!this._multiFrustum || !passes.render || passes.pick || passes.depth) {
      return false;
    }
    if (
      !this._pickDepthCopy ||
      this._pickDepthLog !== scene.frameState.useLogDepth
    ) {
      this._pickDepthCopy?.shaderProgram.destroy();
      this._pickDepthCopy = scene.context.createViewportQuadCommand(
        new ShaderSource({
          defines: scene.frameState.useLogDepth ? ["LOG_DEPTH_READ_ONLY"] : [],
          sources: [pickDepthSource],
        }),
        {
          uniformMap: {
            u_currentDepth: () => this._pickDepthSource,
            u_linearDepth: () => this.opaqueDepthTexture,
            u_frustumTag: () => this._pickDepthTag,
            u_pickNear: () => this._pickDepthNear,
          },
          renderState: RenderState.fromCache(),
        },
      );
      this._pickDepthLog = scene.frameState.useLogDepth;
    }
    this._pickDepthSource = depthTexture;
    this._pickDepthTag = index + 1;
    this._pickDepthNear =
      scene._view.frustumCommandsList[index].near *
      (index === 0 ? 1 : scene.opaqueFrustumNearOffset);
    this._pickDepthCopy.framebuffer = pickDepth.framebuffer;
    this._pickDepthCopy.execute(scene.context, passState);
    return true;
  }

  draw(command, passState) {
    const scene = this._scene;
    const passes = scene.frameState.passes;
    if (
      this._ready &&
      passes.render &&
      !passes.pick &&
      !passes.depth &&
      !passes.pickVoxel &&
      command.pass === Pass.VOXELS
    ) {
      executeVoxel(this, command, passState);
      return true;
    }
    if (
      passes.render &&
      !passes.pick &&
      !passes.depth &&
      !passes.pickVoxel &&
      DeferredLayout.isDebugOverlay(command)
    ) {
      if (this._drawingDebugOverlays) {
        DeferredDebug.receiver(scene, command).execute(
          scene.context,
          passState,
        );
      }
      return true;
    }
    if (
      passes.render &&
      !passes.pick &&
      !passes.depth &&
      !passes.pickVoxel &&
      DeferredLayout.isAnnotation(command)
    ) {
      if (this._annotations?.drawing) {
        Annotations.execute(this, command, passState);
      }
      return true;
    }
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
      (passState.framebuffer !== this._source &&
        (command.pass === Pass.GLOBE ||
          command.pass === Pass.TERRAIN_CLASSIFICATION)) ||
      (command.pass === Pass.TERRAIN_CLASSIFICATION &&
        this._directSurfaceOverlays?.has(command.owner))
    ) {
      // Native translucent classification owns its depth peel and color target.
      DeferredDebug.receiver(scene, command).execute(scene.context, passState);
      return true;
    }
    if (classificationPasses.includes(command.pass)) {
      command = DeferredDebug.receiver(scene, command);
      if (this._vectorOverlays) {
        this._vectorOverlays.draw(command, passState);
        ++this.classificationDrawCount;
        return true;
      }
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
    const edl = this._pointEDLOwners.get(command.owner);
    const group =
      model || edl
        ? this._models.get(command.owner).get(groupKey(info, edl))
        : info.phong
          ? info.sunPhong
            ? this._sunPhong
            : this._phong
          : info.point
            ? this._point
            : info.globe
              ? this._globe
              : info.planar
                ? this._planar
                : info.vector
                  ? this._vector
                  : undefined;
    if (
      scene.frameState.shadowState.lightShadowsEnabled &&
      command.receiveShadows &&
      command.derivedCommands.shadows
    ) {
      command = command.derivedCommands.shadows.receiveCommand;
    }
    if (
      !model &&
      !info.phong &&
      !info.point &&
      !info.globe &&
      !info.planar &&
      !info.vector
    ) {
      command = LocalLights.receiver(scene, command);
    }
    if (!info.globe && !info.planar && !info.vector) {
      command = SurfaceWeather.receiver(scene, command);
    }
    const shader = command.shaderProgram;
    const inverseMaterial =
      !!this._inverse && command.pass === Pass.CESIUM_3D_TILE;
    const vectorLocation = inverseMaterial
      ? undefined
      : this._vectorOverlayLocation;
    let cached = this._commands.get(command);
    if (
      !cached ||
      cached.shader !== shader ||
      cached.edl !== !!edl ||
      cached.inverseMaterial !== inverseMaterial ||
      cached.extensionKey !== this._extensionLayout.key ||
      cached.extensionCombined !== this._extensionCombined ||
      cached.styleTarget !== this._hasStyleTarget ||
      cached.ocean !== this._hasOcean ||
      cached.classification !== this._hasClassification ||
      cached.multiFrustum !== this._multiFrustum ||
      cached.vectorLocation !== vectorLocation ||
      cached.globeBlend !== globeBlend ||
      cached.sourceUniforms !== command.uniformMap
    ) {
      const name = `sceneGIS_deferred_material_${inverseMaterial}_${this._extensionLayout.key}_${this._extensionCombined}_${this._hasStyleTarget ? 5 : 4}${this._hasOcean ? "_ocean" : ""}${this._hasClassification ? "_classification" : ""}${this._multiFrustum ? "_frusta" : ""}${globeBlend ? "_imagery" : ""}_vector_${vectorLocation}_edl_${!!edl}`;
      let program = scene.context.shaderCache.getDerivedShaderProgram(
        shader,
        name,
      );
      if (!program) {
        const fs = shader.fragmentShaderSource.clone();
        let vs = shader.vertexShaderSource;
        if (edl) {
          fs.defines.push("SCENEGIS_DEFERRED_POINT_EDL");
        }
        if (vectorLocation !== undefined && !globeBlend) {
          fs.defines.push(
            `SCENEGIS_DEFERRED_VECTOR_OVERLAY_LOCATION ${vectorLocation}`,
          );
        }
        if (this._multiFrustum && !inverseMaterial) {
          fs.defines.push(
            `SCENEGIS_DEFERRED_DEPTH_LOCATION ${4 + Number(this._hasStyleTarget) + Number(this._hasOcean) + Number(this._hasClassification)}`,
          );
        }
        if (this._hasStyleTarget) {
          fs.defines.push("SCENEGIS_DEFERRED_STYLE_TARGET");
        }
        if (this._hasOcean && !inverseMaterial) {
          fs.defines.push(
            `SCENEGIS_DEFERRED_OCEAN_LOCATION ${4 + (this._hasStyleTarget ? 1 : 0)}`,
          );
        }
        if (this._hasClassification && !inverseMaterial) {
          fs.defines.push(
            `SCENEGIS_DEFERRED_CLASSIFICATION_LOCATION ${4 + (this._hasStyleTarget ? 1 : 0) + (this._hasOcean ? 1 : 0)}`,
          );
        }
        if (model) {
          fs.defines.push(
            "SCENEGIS_DEFERRED_CAPTURE",
            "CESIUM_REDIRECTED_COLOR_OUTPUT",
          );
        } else if (info.phong) {
          fs.defines.push("SCENEGIS_DEFERRED_PHONG_CAPTURE");
        } else if (info.point) {
          fs.defines.push(
            "SCENEGIS_DEFERRED_POINT_CAPTURE",
            "SCENEGIS_DIRECT_SHADOW_RECEIVER",
          );
          vs = vs.clone();
          vs.defines.push("SCENEGIS_DEFERRED_POINT_CAPTURE");
        } else if (info.vector) {
          fs.defines.push("SCENEGIS_DEFERRED_VECTOR_CAPTURE");
        } else if (info.planar) {
          fs.defines.push("SCENEGIS_DEFERRED_PLANAR_CAPTURE");
          vs = vs.clone();
          vs.defines.push("SCENEGIS_DEFERRED_PLANAR_CAPTURE");
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
        if (this._extensionLayout.count) {
          fs.defines.push("SCENEGIS_DEFERRED_EXTENSIONS");
          fs.sources.push(
            MaterialExtensions.captureSource(
              this._extensionLayout,
              this._extensionCombined
                ? inverseMaterial
                  ? 4 + Number(this._hasStyleTarget)
                  : this._extensionLocation
                : undefined,
            ),
          );
        }
        fs.sources.push(
          `void main() { sceneGISDeferredMaterialMain(); sceneGISWriteDeferredMaterial(); ${this._extensionCombined && this._extensionLayout.count ? "sceneGISWriteExtensions();" : ""} }`,
        );
        program = scene.context.shaderCache.createDerivedShaderProgram(
          shader,
          name,
          {
            vertexShaderSource: vs,
            fragmentShaderSource: fs,
            attributeLocations: shader._attributeLocations,
          },
        );
      }
      let extensionProgram;
      if (info.extensions && !this._extensionCombined) {
        const extensionName = `${name}_extensions`;
        extensionProgram = scene.context.shaderCache.getDerivedShaderProgram(
          shader,
          extensionName,
        );
        if (!extensionProgram) {
          const fs = program.fragmentShaderSource.clone();
          fs.defines.push("SCENEGIS_DEFERRED_EXTENSION_ONLY");
          fs.sources[fs.sources.length - 2] = MaterialExtensions.captureSource(
            this._extensionLayout,
            0,
          );
          fs.sources[fs.sources.length - 1] =
            "uniform sampler2D u_sceneGISVisibleMaterial; void main() { if (texelFetch(u_sceneGISVisibleMaterial, ivec2(gl_FragCoord.xy), 0).a != u_sceneGISDeferredGroup) { discard; } sceneGISDeferredMaterialMain(); sceneGISWriteExtensions(); }";
          extensionProgram =
            scene.context.shaderCache.createDerivedShaderProgram(
              shader,
              extensionName,
              {
                vertexShaderSource: program.vertexShaderSource,
                fragmentShaderSource: fs,
                attributeLocations: shader._attributeLocations,
              },
            );
        }
      }
      cached = {
        edl: !!edl,
        vectorLocation,
        inverseMaterial,
        extensionProgram,
        extensionCommand: new DrawCommand(),
        extensionKey: this._extensionLayout.key,
        extensionCombined: this._extensionCombined,
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
            u_sceneGISVisibleMaterial: () =>
              (this._inverse && command.pass === Pass.CESIUM_3D_TILE
                ? this._inverse
                : this
              )._raw.getColorTexture(2),
            u_sceneGISFinalImageryBatch: () => cached.finalGlobeBatch,
            u_sceneGISDeferredFrustumTag: () => this._frustumTag,
            u_sceneGISPlanarFillDepth: () =>
              scene._view.planarFillIdFramebuffer.depthStencilTexture,
            u_sceneGISRasterSubpixelSize: () =>
              (this._rasterSubpixelSize ??=
                2 **
                -scene.context._gl.getParameter(
                  scene.context._gl.SUBPIXEL_BITS,
                )),
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
      if (info.unlitOverlay && !edl) {
        this._inverse.groups.add(this._passthrough);
      }
    }
    derived.execute(scene.context, passState);
    if (!globeBlend || finalGlobeBatch) {
      DeferredDebug.capture(this, derived, command, !!inverse, passState);
    }
    if (this._vectorOverlays && !globeBlend) {
      this._vectorOverlays.dirty = true;
    }
    ++this.drawCount;
    if (
      cached.extensionProgram &&
      !command.uniformMap.model_silhouettePass?.()
    ) {
      const extra = DrawCommand.shallowClone(derived, cached.extensionCommand);
      extra.shaderProgram = cached.extensionProgram;
      if (cached.sourceRenderState !== derived.renderState) {
        const state = RenderState.getState(derived.renderState);
        state.depthTest = { enabled: true, func: DepthFunction.EQUAL };
        state.depthMask = false;
        state.stencilTest.enabled = false;
        state.stencilMask = 0;
        state.blending.enabled = false;
        cached.extensionRenderState = RenderState.fromCache(state);
        cached.sourceRenderState = derived.renderState;
      }
      extra.renderState = cached.extensionRenderState;
      extra.framebuffer = inverse
        ? this._inverse._extensionView
        : this._extensionView;
      extra.execute(scene.context, passState);
      ++this.materialExtensionDrawCount;
    }
    return true;
  }

  preserveGlobeDepth(passState) {
    if (this._active) {
      VectorSymbolOcclusion.capture(this, passState, true);
    }
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
    let sharedCommand;
    let command =
      group === this._globe || group === this._planar
        ? SurfaceWeather.receiver(scene, group.command)
        : group.command;
    command = LocalLights.receiver(scene, command);
    if (inverse) {
      command = this._inverse.lightCommand(command);
    } else {
      if (!group.vectorOverlay) {
        command = DeferredDebug.lighting(this, command);
        command = classificationLighting(this, command);
      }
      if (shared) {
        sharedCommand = command;
        command = LightingMrt.command(scene, shared, command);
      }
    }
    command.execute(scene.context, passState);
    ++this.lightDrawCount;
    if (shared?.main.split) {
      LightingMrt.command(scene, shared, sharedCommand, true).execute(
        scene.context,
        passState,
      );
      ++this.lightDrawCount;
    }
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
      if (this._vectorOverlays) {
        this._drawLight(this._vectorOverlays.group, passState, shared);
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
    const displayHdr = this._scene.highDynamicRange;
    this._scene._sceneGISDeferred = undefined;
    this._scene.highDynamicRange = displayHdr;
    this._scene.requestRender();
    this._scene = undefined;
    return destroyObject(this);
  }
}

export default _SceneGISDeferredLighting;
