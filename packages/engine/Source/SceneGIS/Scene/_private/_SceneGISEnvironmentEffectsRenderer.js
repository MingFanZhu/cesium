import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import defined from "../../../Core/defined.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import PassState from "../../../Renderer/PassState.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import Texture3D from "../../../Renderer/Texture3D.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureWrap from "../../../Renderer/TextureWrap.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import brunetonCommonSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonCommon.js";
import brunetonDefinitionsSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonDefinitions.js";
import brunetonRuntimeSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonRuntime.js";
import aerialFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS.js";
import atmosphereSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import backgroundFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsBackgroundFS.js";
import cloudFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudFS.js";
import cloudResolveFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.js";
import heightFogSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISExponentialHeightFog.js";
import globeCloudSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeClouds.js";
import cloudSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.js";
import vertexSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsVS.js";
import SceneGISAtmosphereReferenceFrame from "./_SceneGISAtmosphereReferenceFrame.js";
import SceneGISEnvironmentEffectsPipeline from "./_SceneGISEnvironmentEffectsPipeline.js";

const attributeLocations = { position: 0 };
const fullscreenQuad = new Float32Array([
  -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0,
]);
const linearSampler = new Sampler();
const volumeSampler = new Sampler({
  wrapS: TextureWrap.REPEAT,
  wrapT: TextureWrap.REPEAT,
  wrapR: TextureWrap.REPEAT,
  minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});
const volumeBaseLevelSampler = new Sampler({
  wrapS: TextureWrap.REPEAT,
  wrapT: TextureWrap.REPEAT,
  wrapR: TextureWrap.REPEAT,
  minificationFilter: TextureMinificationFilter.LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});
const volumeMaximumSampler = new Sampler({
  wrapS: TextureWrap.REPEAT,
  wrapT: TextureWrap.REPEAT,
  wrapR: TextureWrap.REPEAT,
  minificationFilter: TextureMinificationFilter.NEAREST_MIPMAP_NEAREST,
  magnificationFilter: TextureMagnificationFilter.NEAREST,
});
const blueNoiseSampler = new Sampler({
  wrapS: TextureWrap.REPEAT,
  wrapT: TextureWrap.REPEAT,
  wrapR: TextureWrap.REPEAT,
  minificationFilter: TextureMinificationFilter.NEAREST,
  magnificationFilter: TextureMagnificationFilter.NEAREST,
});
const cloudQualityProfiles = Object.freeze({
  low: {
    scale: 0.375,
    primarySteps: 32,
    fineSteps: 1,
    sunSteps: 2,
    detail: false,
  },
  medium: {
    scale: 0.5,
    primarySteps: 64,
    fineSteps: 4,
    sunSteps: 3,
    detail: true,
  },
  high: {
    scale: 0.75,
    primarySteps: 64,
    fineSteps: 4,
    sunSteps: 4,
    detail: true,
  },
});
const cloudTileMeters = 200000.0;
const cloudPresetIndices = Object.freeze({
  cumulus: 0,
  stratus: 1,
  cirrus: 2,
  mixed: 3,
});

function destroyResource(resource) {
  if (
    defined(resource) &&
    (typeof resource.isDestroyed !== "function" || !resource.isDestroyed())
  ) {
    resource.destroy();
  }
}

function destroyResources(resources) {
  if (!defined(resources)) {
    return;
  }
  destroyResource(resources.aerialFramebuffer);
  destroyResource(resources.cloudFramebuffer);
  destroyResource(resources.cloudHistoryFramebuffer0);
  destroyResource(resources.cloudHistoryFramebuffer1);
  destroyResource(resources.backgroundProgram);
  destroyResource(resources.aerialProgram);
  destroyResource(resources.aerialLogDepthProgram);
  destroyResource(resources.cloudProgram);
  destroyResource(resources.cloudLogDepthProgram);
  destroyResource(resources.cloudResolveProgram);
  destroyResource(resources.cloudResolveLogDepthProgram);
  destroyResource(resources.vertexArray);
  destroyResource(resources.vertexBuffer);
  destroyResource(resources.transmittanceTexture);
  destroyResource(resources.scatteringTexture);
  destroyResource(resources.irradianceTexture);
  destroyResource(resources.cloudShapeTexture);
  destroyResource(resources.cloudOccupancyTexture);
  destroyResource(resources.cloudDetailTexture);
  destroyResource(resources.cloudWeatherTexture);
  destroyResource(resources.cloudTurbulenceTexture);
  destroyResource(resources.cloudStbnTexture);
}

function createTexture2D(context, width, height, buffer) {
  return new Texture({
    context,
    width,
    height,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
    source: { arrayBufferView: new Uint16Array(buffer) },
    sampler: linearSampler,
    flipY: false,
  });
}

function createTexture3D(context, width, height, depth, buffer) {
  return new Texture3D({
    context,
    width,
    height,
    depth,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
    source: { arrayBufferView: new Uint16Array(buffer) },
    sampler: linearSampler,
    flipY: false,
  });
}

function createCloudMipLevelStorage(width, height, depth) {
  const levels = [];
  while (width > 1 || height > 1 || depth > 1) {
    width = Math.max(Math.floor(width / 2), 1);
    height = Math.max(Math.floor(height / 2), 1);
    depth = Math.max(Math.floor(depth / 2), 1);
    levels.push(new Uint8Array(width * height * depth * 4));
  }
  return levels;
}

function padCloudOccupancyMipLevel(
  level,
  width,
  height,
  depth,
  unpackAlignment,
) {
  const rowStride = Math.ceil(width / unpackAlignment) * unpackAlignment;
  if (rowStride === width) {
    return level;
  }
  const padded = new Uint8Array(rowStride * height * depth);
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < height; y++) {
      const sourceOffset = (z * height + y) * width;
      const targetOffset = (z * height + y) * rowStride;
      padded.set(
        level.subarray(sourceOffset, sourceOffset + width),
        targetOffset,
      );
    }
  }
  return padded;
}

function createCloudOccupancySource(buffer, width, height, depth) {
  const shape = new Uint8Array(buffer);
  let levelWidth = width;
  let levelHeight = height;
  let levelDepth = depth;
  let level = new Uint8Array(width * height * depth);
  const base = level;
  const unpackAlignment = PixelFormat.alignmentInBytes(
    PixelFormat.RED,
    PixelDatatype.UNSIGNED_BYTE,
    width,
  );
  for (let index = 0; index < level.length; index++) {
    const shapeIndex = index * 4;
    const shapeRed = shape[shapeIndex] / 255.0;
    const shapeFbm =
      (shape[shapeIndex + 1] * 0.625 +
        shape[shapeIndex + 2] * 0.25 +
        shape[shapeIndex + 3] * 0.125) /
      255.0;
    const baseShape = Math.min(
      Math.max(
        (shapeRed - (1.0 - shapeFbm) * 0.15) /
          Math.max(0.85 + shapeFbm * 0.15, 1.0e-3),
        0.0,
      ),
      1.0,
    );
    level[index] = Math.ceil(baseShape * 255.0);
  }

  const mipLevels = [];
  while (levelWidth > 1 || levelHeight > 1 || levelDepth > 1) {
    const nextWidth = Math.max(Math.floor(levelWidth / 2), 1);
    const nextHeight = Math.max(Math.floor(levelHeight / 2), 1);
    const nextDepth = Math.max(Math.floor(levelDepth / 2), 1);
    const next = new Uint8Array(nextWidth * nextHeight * nextDepth);
    for (let z = 0; z < nextDepth; z++) {
      for (let y = 0; y < nextHeight; y++) {
        for (let x = 0; x < nextWidth; x++) {
          let maximum = 0;
          // The one-source-texel halo makes each max cell conservative when a
          // ray interval straddles the nearest-mip cell boundary.
          for (let offsetZ = -1; offsetZ <= 2; offsetZ++) {
            const sourceZ = (z * 2 + offsetZ + levelDepth) % levelDepth;
            for (let offsetY = -1; offsetY <= 2; offsetY++) {
              const sourceY = (y * 2 + offsetY + levelHeight) % levelHeight;
              for (let offsetX = -1; offsetX <= 2; offsetX++) {
                const sourceX = (x * 2 + offsetX + levelWidth) % levelWidth;
                maximum = Math.max(
                  maximum,
                  level[
                    (sourceZ * levelHeight + sourceY) * levelWidth + sourceX
                  ],
                );
              }
            }
          }
          next[(z * nextHeight + y) * nextWidth + x] = maximum;
        }
      }
    }
    mipLevels.push(
      padCloudOccupancyMipLevel(
        next,
        nextWidth,
        nextHeight,
        nextDepth,
        unpackAlignment,
      ),
    );
    level = next;
    levelWidth = nextWidth;
    levelHeight = nextHeight;
    levelDepth = nextDepth;
  }
  return { arrayBufferView: base, mipLevels };
}

function createCloudOccupancyTexture3D(context, width, height, depth, buffer) {
  const source = createCloudOccupancySource(buffer, width, height, depth);
  // The explicit max hierarchy remains independent of
  // Texture3D.generateMipmap's averaging rule.
  const texture = new Texture3D({
    context,
    width,
    height,
    depth,
    pixelFormat: PixelFormat.RED,
    pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
    source,
    sampler: volumeMaximumSampler,
    flipY: false,
  });
  // Texture3D uploads explicit mip levels but currently only marks this flag
  // from generateMipmap(). The hierarchy is already complete and must not be
  // replaced with averaged levels.
  texture._hasMipmap = true;
  return texture;
}

function createCloudTexture3D(context, width, height, depth, buffer) {
  let texture;
  try {
    texture = new Texture3D({
      context,
      width,
      height,
      depth,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      source: {
        arrayBufferView: new Uint8Array(buffer),
        mipLevels: createCloudMipLevelStorage(width, height, depth),
      },
      sampler: volumeSampler,
      flipY: false,
    });
    texture.generateMipmap();
    return texture;
  } catch (error) {
    destroyResource(texture);
    throw error;
  }
}

function createCloudTexture2D(context, width, height, buffer) {
  return new Texture({
    context,
    width,
    height,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
    source: { arrayBufferView: new Uint8Array(buffer) },
    sampler: volumeBaseLevelSampler,
    flipY: false,
  });
}

function createCloudStbnTexture(context, buffer) {
  return new Texture3D({
    context,
    width: 128,
    height: 128,
    depth: 64,
    pixelFormat: PixelFormat.RED,
    pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
    source: { arrayBufferView: new Uint8Array(buffer) },
    sampler: blueNoiseSampler,
    flipY: false,
  });
}

function createProgram(
  context,
  fragmentSource,
  globe,
  additionalDefines,
  cloudLibrarySource = cloudSource,
  globeCloudLibrarySource = globeCloudSource,
) {
  const defines = globe
    ? [
        "SCENEGIS_GLOBE",
        "COMBINED_SCATTERING_TEXTURES",
        "TRANSMITTANCE_TEXTURE_WIDTH 256",
        "TRANSMITTANCE_TEXTURE_HEIGHT 64",
        "SCATTERING_TEXTURE_R_SIZE 32",
        "SCATTERING_TEXTURE_MU_SIZE 128",
        "SCATTERING_TEXTURE_MU_S_SIZE 32",
        "SCATTERING_TEXTURE_NU_SIZE 8",
        "IRRADIANCE_TEXTURE_WIDTH 64",
        "IRRADIANCE_TEXTURE_HEIGHT 16",
      ]
    : [];
  if (defined(additionalDefines)) {
    defines.push(...additionalDefines);
  }
  const sources = globe
    ? [
        brunetonDefinitionsSource,
        brunetonCommonSource,
        brunetonRuntimeSource,
        atmosphereSource,
        heightFogSource,
        globeCloudLibrarySource,
        cloudLibrarySource,
        fragmentSource,
      ]
    : [atmosphereSource, heightFogSource, cloudLibrarySource, fragmentSource];
  const fragmentShaderSource = new ShaderSource({
    defines,
    sources,
  });
  const program = ShaderProgram.fromCache({
    context,
    vertexShaderSource: vertexSource,
    fragmentShaderSource,
    attributeLocations,
  });
  try {
    program._bind();
  } catch (error) {
    destroyResource(program);
    throw error;
  }
  return program;
}

function createResources(renderer, context, buffers) {
  const candidate = {};
  try {
    candidate.vertexBuffer = Buffer.createVertexBuffer({
      context,
      typedArray: fullscreenQuad,
      usage: BufferUsage.STATIC_DRAW,
    });
    candidate.vertexArray = new VertexArray({
      context,
      attributes: [
        {
          index: attributeLocations.position,
          vertexBuffer: candidate.vertexBuffer,
          componentsPerAttribute: 2,
          componentDatatype: ComponentDatatype.FLOAT,
        },
      ],
    });
    // VertexArray owns its vertex buffers after successful construction.
    candidate.vertexBuffer = undefined;
    const globe = renderer._mode === SceneGISAtmosphereReferenceFrame.GLOBE;
    candidate.backgroundProgram = createProgram(
      context,
      backgroundFragmentSource,
      globe,
    );
    candidate.aerialProgram = createProgram(
      context,
      aerialFragmentSource,
      globe,
    );
    candidate.aerialLogDepthProgram = createProgram(
      context,
      aerialFragmentSource,
      globe,
      ["LOG_DEPTH", "LOG_DEPTH_READ_ONLY"],
    );
    candidate.cloudProgram = createProgram(context, cloudFragmentSource, globe);
    candidate.cloudLogDepthProgram = createProgram(
      context,
      cloudFragmentSource,
      globe,
      ["LOG_DEPTH", "LOG_DEPTH_READ_ONLY"],
    );
    candidate.cloudResolveProgram = createProgram(
      context,
      cloudResolveFragmentSource,
      globe,
    );
    candidate.cloudResolveLogDepthProgram = createProgram(
      context,
      cloudResolveFragmentSource,
      globe,
      ["LOG_DEPTH", "LOG_DEPTH_READ_ONLY"],
    );
    candidate.transmittanceTexture = createTexture2D(
      context,
      256,
      64,
      buffers.transmittance,
    );
    candidate.scatteringTexture = createTexture3D(
      context,
      256,
      128,
      32,
      buffers.scattering,
    );
    candidate.irradianceTexture = createTexture2D(
      context,
      64,
      16,
      buffers.irradiance,
    );
    candidate.cloudShapeTexture = createCloudTexture3D(
      context,
      128,
      128,
      128,
      buffers.cloudShape,
    );
    candidate.cloudOccupancyTexture = createCloudOccupancyTexture3D(
      context,
      128,
      128,
      128,
      buffers.cloudShape,
    );
    candidate.cloudDetailTexture = createCloudTexture3D(
      context,
      64,
      64,
      64,
      buffers.cloudDetail,
    );
    candidate.cloudWeatherTexture = createCloudTexture2D(
      context,
      256,
      256,
      buffers.cloudWeather,
    );
    candidate.cloudTurbulenceTexture = createCloudTexture3D(
      context,
      64,
      64,
      64,
      buffers.cloudTurbulence,
    );
    candidate.cloudStbnTexture = createCloudStbnTexture(
      context,
      buffers.cloudStbn,
    );
    const renderState = RenderState.fromCache({
      cull: { enabled: false },
      depthTest: { enabled: false },
      depthMask: false,
    });
    candidate.backgroundCommand = new DrawCommand({
      vertexArray: candidate.vertexArray,
      shaderProgram: candidate.backgroundProgram,
      uniformMap: renderer._uniformMap,
      renderState,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    });
    candidate.aerialCommand = new DrawCommand({
      vertexArray: candidate.vertexArray,
      shaderProgram: candidate.aerialProgram,
      uniformMap: renderer._uniformMap,
      renderState,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    });
    candidate.cloudCommand = new DrawCommand({
      vertexArray: candidate.vertexArray,
      shaderProgram: candidate.cloudProgram,
      uniformMap: renderer._uniformMap,
      renderState,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    });
    candidate.cloudResolveCommand = new DrawCommand({
      vertexArray: candidate.vertexArray,
      shaderProgram: candidate.cloudResolveProgram,
      uniformMap: renderer._uniformMap,
      renderState,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    });
  } catch (error) {
    destroyResources(candidate);
    throw error;
  }
  return candidate;
}

function updateFrustum(renderer, camera) {
  void camera.frustum.projectionMatrix;
  const frustum = camera.frustum.offCenterFrustum ?? camera.frustum;
  const perspective = renderer._frame.projection === "perspective";
  renderer._perspective = perspective;
  const divisor = perspective ? frustum.near : 1.0;
  Cartesian4.fromElements(
    frustum.left / divisor,
    frustum.right / divisor,
    frustum.bottom / divisor,
    frustum.top / divisor,
    renderer._frustum,
  );
}

function updateFrame(renderer, scene, frameState) {
  SceneGISAtmosphereReferenceFrame.publish(
    {
      mode: renderer._mode,
      scene,
      world: renderer._world,
      baseHeight: 0.0,
    },
    renderer._frame,
    renderer._scratchFrame,
  );
  updateFrustum(renderer, frameState.camera);
  const sunDirection =
    renderer._mode === SceneGISAtmosphereReferenceFrame.GLOBE
      ? frameState.context.uniformState.sunDirectionWC
      : renderer._world.environment._effectiveSunDirection;
  Cartesian3.clone(sunDirection, renderer._sunDirection);
  const owner = renderer._owner;
  const wrappedDistance =
    (((owner._cloudTime * owner._cloudWindSpeed) % cloudTileMeters) +
      cloudTileMeters) %
    cloudTileMeters;
  renderer._cloudOffset.x =
    Math.sin(owner._cloudWindDirection) * wrappedDistance;
  renderer._cloudOffset.y =
    Math.cos(owner._cloudWindDirection) * wrappedDistance;
}

function isUnderground(renderer) {
  if (renderer._mode === SceneGISAtmosphereReferenceFrame.GLOBE) {
    return renderer._frame.altitude < 0.0;
  }
  const terrainHeight =
    renderer._world.getTerrainHeight(renderer._frame.cameraPosition) ?? 0.0;
  return renderer._frame.cameraPosition.z < terrainHeight;
}

/**
 * A2 renderer and resource owner for the A1 advanced-environment slots.
 *
 * @private
 */
function SceneGISEnvironmentEffectsRenderer(options) {
  SceneGISEnvironmentEffectsPipeline.call(this);
  this._mode = options.mode;
  this._world = options.world;
  this._owner = options.owner;
  this._resources = undefined;
  this._showAtmosphere = true;
  this._showAerialPerspective = true;
  this._showHeightFog = true;
  this._showClouds = true;
  this._cloudPassActive = false;
  this._frame = SceneGISAtmosphereReferenceFrame.createSnapshot();
  this._scratchFrame = SceneGISAtmosphereReferenceFrame.createSnapshot();
  this._frustum = new Cartesian4();
  this._sunDirection = new Cartesian3();
  this._cloudOffset = new Cartesian2();
  this._perspective = true;
  this._inputColorTexture = undefined;
  this._depthTexture = undefined;
  this._aerialPassState = undefined;
  this._cloudPassState = undefined;
  this._cloudResolvePassState = undefined;
  this._cloudColorTexture = undefined;
  this._cloudDistanceTexture = undefined;
  this._cloudLowColorTexture = undefined;
  this._cloudLowDistanceTexture = undefined;
  this._cloudHistoryColorTexture = undefined;
  this._cloudHistoryDistanceTexture = undefined;
  this._cloudHistoryValid = false;
  this._cloudHistoryReadIndex = 0;
  this._cloudHistoryKey = undefined;
  this._cloudHistoryTime = undefined;
  this._cloudHistoryWeight = 0.0;
  this._cloudHistoryStationary = false;
  this._cloudHistoryDiagnostics = {
    key: undefined,
    stationary: false,
    compatibility: "full-attachments",
    resetReason: "initial",
    historyValid: false,
    weight: 0.0,
  };
  this._cloudHistoryPendingResetReason = "initial";
  this._cloudHistorySunDirection = new Cartesian3();
  this._cloudBufferDimensions = new Cartesian2();

  const that = this;
  this._uniformMap = {
    u_perspective: () => that._perspective,
    u_frustum: () => that._frustum,
    u_cameraDirection: () => that._frame.cameraDirection,
    u_cameraPosition: () => that._frame.cameraPosition,
    u_surfacePosition: () => that._frame.surfacePosition,
    u_cameraRight: () => that._frame.cameraRight,
    u_cameraUp: () => that._frame.cameraUp,
    u_east: () => that._frame.east,
    u_north: () => that._frame.north,
    u_vertical: () => that._frame.vertical,
    u_sunDirection: () => that._sunDirection,
    u_altitude: () => that._frame.altitude,
    u_baseHeight: () => that._frame.baseHeight,
    u_ellipsoidCenter: () => that._frame.ellipsoidCenter,
    u_ellipsoidRadii: () => that._frame.ellipsoidRadii,
    u_backgroundRadianceScale: () => that._owner._backgroundRadianceScale,
    u_aerialRadianceScale: () => that._owner._aerialRadianceScale,
    u_showAerialPerspective: () => that._showAerialPerspective,
    u_showHeightFog: () => that._showHeightFog,
    u_showClouds: () => that._cloudPassActive,
    u_cloudCoverage: () => that._owner._cloudCoverage,
    u_cloudDensity: () => that._owner._cloudDensity,
    u_cloudBaseHeight: () => that._owner._cloudBaseHeight,
    u_cloudThickness: () => that._owner._cloudThickness,
    u_cloudOffset: () => that._cloudOffset,
    u_cloudRadianceScale: () => that._owner._cloudRadianceScale,
    u_cloudPreset: () => cloudPresetIndices[that._owner._cloudPreset],
    u_cloudStbnSlice: () => {
      const slice =
        ((Math.floor(that._owner._cloudTime * 60.0) % 64) + 64) % 64;
      return (slice + 0.5) / 64.0;
    },
    u_cloudPrimarySteps: () =>
      cloudQualityProfiles[that._owner._cloudQuality].primarySteps,
    u_cloudFineSteps: () =>
      cloudQualityProfiles[that._owner._cloudQuality].fineSteps,
    u_cloudSunSteps: () =>
      cloudQualityProfiles[that._owner._cloudQuality].sunSteps,
    u_cloudUseDetail: () =>
      cloudQualityProfiles[that._owner._cloudQuality].detail,
    u_cloudBufferDimensions: () => that._cloudBufferDimensions,
    u_heightFogDensity: () => that._owner._heightFogDensity,
    u_heightFogHeightFalloff: () => that._owner._heightFogHeightFalloff,
    u_heightFogBaseHeight: () => that._owner._heightFogBaseHeight,
    u_heightFogStartDistance: () => that._owner._heightFogStartDistance,
    u_heightFogMaximumOpacity: () => that._owner._heightFogMaximumOpacity,
    u_heightFogInscatteringScale: () => that._owner._heightFogInscatteringScale,
    u_heightFogDirectionalInscatteringScale: () =>
      that._owner._heightFogDirectionalInscatteringScale,
    u_heightFogDirectionalInscatteringExponent: () =>
      that._owner._heightFogDirectionalInscatteringExponent,
    u_colorTexture: () => that._inputColorTexture,
    u_depthTexture: () => that._depthTexture,
    u_transmittanceTexture: () => that._resources?.transmittanceTexture,
    u_scatteringTexture: () => that._resources?.scatteringTexture,
    u_irradianceTexture: () => that._resources?.irradianceTexture,
    u_cloudShapeTexture: () => that._resources?.cloudShapeTexture,
    u_cloudOccupancyTexture: () => that._resources?.cloudOccupancyTexture,
    u_cloudDetailTexture: () => that._resources?.cloudDetailTexture,
    u_cloudWeatherTexture: () => that._resources?.cloudWeatherTexture,
    u_cloudTurbulenceTexture: () => that._resources?.cloudTurbulenceTexture,
    u_cloudStbnTexture: () => that._resources?.cloudStbnTexture,
    u_cloudLowColorTexture: () => that._cloudLowColorTexture,
    u_cloudLowDistanceTexture: () => that._cloudLowDistanceTexture,
    u_cloudHistoryColorTexture: () =>
      that._cloudHistoryColorTexture ?? that._cloudLowColorTexture,
    u_cloudHistoryDistanceTexture: () =>
      that._cloudHistoryDistanceTexture ?? that._cloudLowDistanceTexture,
    // Stationary history publishes the current spatial result. Present the
    // same shader-facing state as an invalid first frame so both paths execute
    // one identical RGBA16F store; the JS history authority remains valid.
    u_cloudHistoryValid: () =>
      that._cloudHistoryValid && !that._cloudHistoryStationary,
    u_cloudHistoryWeight: () =>
      that._cloudHistoryStationary ? 0.0 : that._cloudHistoryWeight,
    u_cloudColorTexture: () =>
      that._cloudColorTexture ?? that._resources?.transmittanceTexture,
    u_cloudDistanceTexture: () =>
      that._cloudDistanceTexture ?? that._resources?.transmittanceTexture,
  };
}

SceneGISEnvironmentEffectsRenderer.prototype = Object.create(
  SceneGISEnvironmentEffectsPipeline.prototype,
);
SceneGISEnvironmentEffectsRenderer.prototype.constructor =
  SceneGISEnvironmentEffectsRenderer;

SceneGISEnvironmentEffectsRenderer.prototype.publishResources = function (
  context,
  buffers,
) {
  const candidate = createResources(this, context, buffers);
  const previous = this._resources;
  this._resources = candidate;
  this.invalidateCloudHistory("generation-replacement");
  destroyResources(previous);
};

SceneGISEnvironmentEffectsRenderer.prototype.hasResources = function () {
  return defined(this._resources);
};

SceneGISEnvironmentEffectsRenderer.prototype.setShow = function (
  showAtmosphere,
  showAerialPerspective,
  showHeightFog,
  showClouds,
) {
  if (this._showClouds !== showClouds) {
    this.invalidateCloudHistory("show-clouds");
  }
  this._showAtmosphere = showAtmosphere;
  this._showAerialPerspective = showAerialPerspective;
  this._showHeightFog = showHeightFog;
  this._showClouds = showClouds;
};

SceneGISEnvironmentEffectsRenderer.prototype.invalidateCloudHistory = function (
  reason = "explicit",
) {
  this._cloudHistoryValid = false;
  this._cloudHistoryKey = undefined;
  this._cloudHistoryTime = undefined;
  this._cloudHistoryWeight = 0.0;
  this._cloudHistoryStationary = false;
  this._cloudHistoryDiagnostics.key = undefined;
  this._cloudHistoryDiagnostics.stationary = false;
  this._cloudHistoryDiagnostics.resetReason = reason;
  this._cloudHistoryDiagnostics.historyValid = false;
  this._cloudHistoryDiagnostics.weight = 0.0;
  this._cloudHistoryPendingResetReason = reason;
};

SceneGISEnvironmentEffectsRenderer.prototype.renderBackground = function (
  frameState,
  passState,
) {
  if (!this._showAtmosphere || !defined(this._resources)) {
    return;
  }
  if (!this._owner._validateRenderFrame()) {
    return;
  }
  updateFrame(this, this._scene, frameState);
  if (isUnderground(this)) {
    return;
  }
  this._resources.backgroundCommand.execute(frameState.context, passState);
};

function ensureAerialFramebuffer(renderer, context, width, height) {
  const current = renderer._resources.aerialFramebuffer;
  if (
    defined(current) &&
    !current.isDirty(
      width,
      height,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    )
  ) {
    return current;
  }
  const candidate = new FramebufferManager({
    depth: false,
    depthStencil: false,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
    pixelFormat: PixelFormat.RGBA,
  });
  try {
    candidate.update(
      context,
      width,
      height,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    );
  } catch (error) {
    candidate.destroy();
    throw error;
  }
  renderer._resources.aerialFramebuffer = candidate;
  destroyResource(current);
  return candidate;
}

function ensureCloudFramebuffer(renderer, context, width, height) {
  const current = renderer._resources.cloudFramebuffer;
  if (
    defined(current) &&
    !current.isDirty(
      width,
      height,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    )
  ) {
    return current;
  }
  const candidate = new FramebufferManager({
    colorAttachmentsLength: 2,
    depth: false,
    depthStencil: false,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
    pixelFormat: PixelFormat.RGBA,
  });
  try {
    candidate.update(
      context,
      width,
      height,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    );
  } catch (error) {
    candidate.destroy();
    throw error;
  }
  renderer._resources.cloudFramebuffer = candidate;
  destroyResource(current);
  return candidate;
}

function createCloudHistoryFramebuffer(context, width, height) {
  const candidate = new FramebufferManager({
    colorAttachmentsLength: 2,
    depth: false,
    depthStencil: false,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
    pixelFormat: PixelFormat.RGBA,
  });
  try {
    candidate.update(
      context,
      width,
      height,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    );
  } catch (error) {
    candidate.destroy();
    throw error;
  }
  return candidate;
}

function ensureCloudHistoryFramebuffers(renderer, context, width, height) {
  const first = renderer._resources.cloudHistoryFramebuffer0;
  const second = renderer._resources.cloudHistoryFramebuffer1;
  const firstClean =
    defined(first) &&
    !first.isDirty(
      width,
      height,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    );
  const secondClean =
    defined(second) &&
    !second.isDirty(
      width,
      height,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    );
  if (firstClean && secondClean) {
    return [first, second];
  }
  let candidate0;
  let candidate1;
  try {
    candidate0 = createCloudHistoryFramebuffer(context, width, height);
    candidate1 = createCloudHistoryFramebuffer(context, width, height);
  } catch (error) {
    destroyResource(candidate0);
    destroyResource(candidate1);
    throw error;
  }
  renderer._resources.cloudHistoryFramebuffer0 = candidate0;
  renderer._resources.cloudHistoryFramebuffer1 = candidate1;
  destroyResource(first);
  destroyResource(second);
  renderer.invalidateCloudHistory("viewport-resize");
  renderer._cloudHistoryReadIndex = 0;
  return [candidate0, candidate1];
}

function cloudHistoryNumber(value) {
  if (!Number.isFinite(value)) {
    return value;
  }
  const scale = Math.abs(value) <= 1.0 ? 1.0e12 : 1.0e4;
  return Math.round(value * scale) / scale;
}

function cloudHistoryKey(renderer, width, height) {
  const frame = renderer._frame;
  const values = [
    renderer._mode,
    frame.projection,
    width,
    height,
    renderer._owner._cloudQuality,
    renderer._owner._cloudPreset,
    renderer._owner._cloudBaseHeight,
    renderer._owner._cloudThickness,
    renderer._owner._cloudCoverage,
    renderer._owner._cloudDensity,
    renderer._owner._cloudWindDirection,
    renderer._owner._cloudWindSpeed,
    renderer._owner._cloudRadianceScale,
    renderer._scene.frameState.useLogDepth,
    frame.mode,
    frame.altitude,
    frame.baseHeight,
    renderer._frustum.x,
    renderer._frustum.y,
    renderer._frustum.z,
    renderer._frustum.w,
  ].map(cloudHistoryNumber);
  for (const vector of [
    frame.cameraPosition,
    frame.cameraDirection,
    frame.cameraUp,
    frame.cameraRight,
    frame.surfacePosition,
    frame.east,
    frame.north,
    frame.vertical,
    frame.ellipsoidCenter,
    frame.ellipsoidRadii,
  ]) {
    values.push(
      cloudHistoryNumber(vector.x),
      cloudHistoryNumber(vector.y),
      cloudHistoryNumber(vector.z),
    );
  }
  return values.join("|");
}

function executeCloudResolve(renderer, context, depthTexture) {
  const width = depthTexture.width;
  const height = depthTexture.height;
  const histories = ensureCloudHistoryFramebuffers(
    renderer,
    context,
    width,
    height,
  );
  const key = cloudHistoryKey(renderer, width, height);
  const time = renderer._owner._cloudTime;
  const continuousTime =
    defined(renderer._cloudHistoryTime) &&
    Number.isFinite(time) &&
    Math.abs(time - renderer._cloudHistoryTime) <= 1.0;
  const continuousSun =
    !renderer._cloudHistoryValid ||
    Cartesian3.dot(
      renderer._cloudHistorySunDirection,
      renderer._sunDirection,
    ) >= 0.99999;
  renderer._cloudHistoryValid =
    renderer._cloudHistoryValid &&
    renderer._cloudHistoryKey === key &&
    continuousTime &&
    continuousSun;
  renderer._cloudHistoryWeight = renderer._cloudHistoryValid ? 0.82 : 0.0;
  renderer._cloudHistoryStationary =
    renderer._cloudHistoryValid && time === renderer._cloudHistoryTime;
  renderer._cloudHistoryDiagnostics.key = key;
  renderer._cloudHistoryDiagnostics.stationary =
    renderer._cloudHistoryStationary;
  if (!renderer._cloudHistoryValid) {
    renderer._cloudHistoryDiagnostics.resetReason =
      renderer._cloudHistoryPendingResetReason ??
      (renderer._cloudHistoryKey !== key
        ? "history-key"
        : !continuousTime
          ? "cloud-time"
          : !continuousSun
            ? "sun-direction"
            : renderer._cloudHistoryDiagnostics.resetReason);
  }
  renderer._cloudHistoryDiagnostics.historyValid = renderer._cloudHistoryValid;
  renderer._cloudHistoryDiagnostics.weight = renderer._cloudHistoryWeight;
  // Spatial-only publication always targets framebuffer 0. This makes the
  // invalid and stationary paths byte-stable instead of re-quantizing the same
  // spatial result through alternating RGBA16F owners. The unused framebuffer
  // remains bound as the history sampler, avoiding a texture feedback loop.
  const spatialOnly =
    !renderer._cloudHistoryValid || renderer._cloudHistoryStationary;
  const writeIndex = spatialOnly ? 0 : 1 - renderer._cloudHistoryReadIndex;
  const readIndex = spatialOnly ? 1 : renderer._cloudHistoryReadIndex;
  const read = histories[readIndex];
  const write = histories[writeIndex];
  renderer._cloudHistoryColorTexture = read.getColorTexture(0);
  renderer._cloudHistoryDistanceTexture = read.getColorTexture(1);
  const command = renderer._resources.cloudResolveCommand;
  command.shaderProgram = renderer._scene.frameState.useLogDepth
    ? renderer._resources.cloudResolveLogDepthProgram
    : renderer._resources.cloudResolveProgram;
  command.framebuffer = write.framebuffer;
  if (!defined(renderer._cloudResolvePassState)) {
    renderer._cloudResolvePassState = new PassState(context);
    renderer._cloudResolvePassState.viewport = new BoundingRectangle();
  }
  const viewport = renderer._cloudResolvePassState.viewport;
  viewport.x = 0;
  viewport.y = 0;
  viewport.width = width;
  viewport.height = height;
  command.execute(context, renderer._cloudResolvePassState);
  renderer._cloudHistoryReadIndex = writeIndex;
  renderer._cloudHistoryKey = key;
  renderer._cloudHistoryTime = time;
  Cartesian3.clone(renderer._sunDirection, renderer._cloudHistorySunDirection);
  renderer._cloudHistoryValid = true;
  renderer._cloudHistoryPendingResetReason = undefined;
  renderer._cloudColorTexture = write.getColorTexture(0);
  renderer._cloudDistanceTexture = write.getColorTexture(1);
}

function executeCloudPass(renderer, context, depthTexture) {
  const owner = renderer._owner;
  if (
    !renderer._showClouds ||
    owner._cloudDensity <= 0.0 ||
    owner._cloudThickness <= 0.0
  ) {
    renderer._cloudColorTexture = undefined;
    renderer._cloudDistanceTexture = undefined;
    renderer._cloudLowColorTexture = undefined;
    renderer._cloudLowDistanceTexture = undefined;
    renderer.invalidateCloudHistory("inactive-cloud-pass");
    renderer._cloudPassActive = false;
    return false;
  }
  const profile = cloudQualityProfiles[owner._cloudQuality];
  const width = Math.max(1, Math.ceil(depthTexture.width * profile.scale));
  const height = Math.max(1, Math.ceil(depthTexture.height * profile.scale));
  const framebuffer = ensureCloudFramebuffer(renderer, context, width, height);
  renderer._depthTexture = depthTexture;
  renderer._cloudBufferDimensions.x = width;
  renderer._cloudBufferDimensions.y = height;
  const command = renderer._resources.cloudCommand;
  command.shaderProgram = renderer._scene.frameState.useLogDepth
    ? renderer._resources.cloudLogDepthProgram
    : renderer._resources.cloudProgram;
  command.framebuffer = framebuffer.framebuffer;
  if (!defined(renderer._cloudPassState)) {
    renderer._cloudPassState = new PassState(context);
    renderer._cloudPassState.viewport = new BoundingRectangle();
  }
  const viewport = renderer._cloudPassState.viewport;
  viewport.x = 0;
  viewport.y = 0;
  viewport.width = width;
  viewport.height = height;
  command.execute(context, renderer._cloudPassState);
  renderer._cloudLowColorTexture = framebuffer.getColorTexture(0);
  renderer._cloudLowDistanceTexture = framebuffer.getColorTexture(1);
  executeCloudResolve(renderer, context, depthTexture);
  renderer._cloudPassActive = true;
  return true;
}

SceneGISEnvironmentEffectsRenderer.prototype.executeHdr = function (
  context,
  colorTexture,
  depthTexture,
  idTexture,
) {
  if (
    (!this._showAerialPerspective &&
      !this._showHeightFog &&
      !this._showClouds) ||
    !defined(this._resources)
  ) {
    return colorTexture;
  }
  if (!this._owner._validateRenderFrame()) {
    return colorTexture;
  }
  updateFrame(this, this._scene, this._scene.frameState);
  if (isUnderground(this)) {
    return colorTexture;
  }
  void idTexture;
  let cloudPassExecuted;
  try {
    cloudPassExecuted = executeCloudPass(this, context, depthTexture);
  } catch (error) {
    this._cloudColorTexture = undefined;
    this._cloudDistanceTexture = undefined;
    this._cloudPassActive = false;
    this.invalidateCloudHistory("cloud-pass-failure");
    this._depthTexture = undefined;
    throw error;
  }
  if (
    !cloudPassExecuted &&
    !this._showAerialPerspective &&
    !this._showHeightFog
  ) {
    return colorTexture;
  }
  const framebuffer = ensureAerialFramebuffer(
    this,
    context,
    colorTexture.width,
    colorTexture.height,
  );
  this._inputColorTexture = colorTexture;
  this._depthTexture = depthTexture;
  const command = this._resources.aerialCommand;
  command.shaderProgram = this._scene.frameState.useLogDepth
    ? this._resources.aerialLogDepthProgram
    : this._resources.aerialProgram;
  command.framebuffer = framebuffer.framebuffer;
  if (!defined(this._aerialPassState)) {
    this._aerialPassState = new PassState(context);
    this._aerialPassState.viewport = new BoundingRectangle();
  }
  const viewport = this._aerialPassState.viewport;
  viewport.x = 0;
  viewport.y = 0;
  viewport.width = colorTexture.width;
  viewport.height = colorTexture.height;
  try {
    command.execute(context, this._aerialPassState);
  } finally {
    this._inputColorTexture = undefined;
    this._depthTexture = undefined;
    this._cloudColorTexture = undefined;
    this._cloudDistanceTexture = undefined;
    this._cloudLowColorTexture = undefined;
    this._cloudLowDistanceTexture = undefined;
    this._cloudHistoryColorTexture = undefined;
    this._cloudHistoryDistanceTexture = undefined;
    this._cloudPassActive = false;
  }
  return framebuffer.getColorTexture(0);
};

SceneGISEnvironmentEffectsRenderer.prototype.releaseResources = function () {
  destroyResources(this._resources);
  this._resources = undefined;
};

SceneGISEnvironmentEffectsRenderer.prototype.destroy = function () {
  this.releaseResources();
  return SceneGISEnvironmentEffectsPipeline.prototype.destroy.call(this);
};

export default SceneGISEnvironmentEffectsRenderer;
export { createProgram as createEnvironmentEffectsProgramForSpecs };
