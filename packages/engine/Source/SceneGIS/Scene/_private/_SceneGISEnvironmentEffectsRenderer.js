import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import Color from "../../../Core/Color.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import defined from "../../../Core/defined.js";
import JulianDate from "../../../Core/JulianDate.js";
import Matrix3 from "../../../Core/Matrix3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import Simon1994PlanetaryPositions from "../../../Core/Simon1994PlanetaryPositions.js";
import Transforms from "../../../Core/Transforms.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import CubeMap from "../../../Renderer/CubeMap.js";
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
import cloudShadowFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadowFS.js";
import cloudShadowResolveFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadowResolveFS.js";
import cloudShadowSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadows.js";
import aerialFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS.js";
import atmosphereSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import backgroundFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsBackgroundFS.js";
import bloomBlurFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsBloomBlurFS.js";
import bloomCompositeFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsBloomCompositeFS.js";
import bloomThresholdFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsBloomThresholdFS.js";
import cloudFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudFS.js";
import cloudResolveFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.js";
import heightFogSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISExponentialHeightFog.js";
import globeCloudSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeClouds.js";
import cloudSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.js";
import planarCloudTransportSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISPlanarCloudTransport.js";
import vertexSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsVS.js";
import SceneGISAtmosphereReferenceFrame from "./_SceneGISAtmosphereReferenceFrame.js";
import SceneGISEnvironmentEffectsPipeline from "./_SceneGISEnvironmentEffectsPipeline.js";
import SceneGISSkyReflections from "./_SceneGISSkyReflections.js";

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
    shadowCascades: 2,
    shadowResolution: 256,
    shadowSteps: 25,
  },
  medium: {
    scale: 0.5,
    globeScale: 0.5,
    primarySteps: 64,
    fineSteps: 4,
    sunSteps: 3,
    detail: true,
    shadowCascades: 3,
    shadowResolution: 512,
    shadowSteps: 50,
  },
  high: {
    scale: 0.75,
    globeScale: 1.0,
    primarySteps: 64,
    fineSteps: 4,
    sunSteps: 4,
    detail: true,
    shadowCascades: 3,
    shadowResolution: 768,
    shadowSteps: 50,
  },
});
const cloudTileMeters = 200000.0;
const cloudShadowMaximumDistance = 200000.0;
const cloudShadowSplitLambda = 0.5;
const cloudShadowStableRadiusScale = 1.05;
const globeCloudBottomRadius = 6360000.0;
const cloudHistoryMaximumTranslation = 25000.0;
const cloudHistoryMinimumOrientationDot = 0.984807753;
const cloudHistoryMinimumSunDot = 0.99999;
const cloudHistoryMaximumFrustumChange = 0.25;
const cloudPresetIndices = Object.freeze({
  cumulus: 0,
  stratus: 1,
  cirrus: 2,
  mixed: 3,
});
const globeCloudShadowLayerProfiles = Object.freeze({
  cumulus: Object.freeze([
    Object.freeze([0.0, 650.0 / 4500.0]),
    Object.freeze([250.0, 1200.0 / 4500.0]),
  ]),
  stratus: Object.freeze([Object.freeze([250.0, 1200.0 / 4500.0])]),
  cirrus: Object.freeze([]),
  mixed: Object.freeze([
    Object.freeze([0.0, 650.0 / 4500.0]),
    Object.freeze([250.0, 1200.0 / 4500.0]),
  ]),
});

// Every authored Planar texture period divides 240 km. Reduce the origin in
// CPU double precision before adding local ray offsets in the shader.
function planarCloudMaterialOrigin(position, result) {
  const period = 240000.0;
  result.x = ((position.x % period) + period) % period;
  result.y = ((position.y % period) + period) % period;
  return result;
}

function updateGlobeCloudShadowSupport(renderer) {
  const cloudBaseHeight =
    renderer._frame.baseHeight + renderer._owner._cloudBaseHeight;
  const layers = globeCloudShadowLayerProfiles[renderer._owner._cloudPreset];
  let bottom = Number.POSITIVE_INFINITY;
  let top = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    const layerBottom = cloudBaseHeight + layer[0];
    bottom = Math.min(bottom, layerBottom);
    top = Math.max(
      top,
      layerBottom + renderer._owner._cloudThickness * layer[1],
    );
  }
  renderer._shadowCloudSupport.x = layers.length > 0 ? bottom : cloudBaseHeight;
  renderer._shadowCloudSupport.y = layers.length > 0 ? top : cloudBaseHeight;
  renderer._shadowCloudCasterActive = layers.length > 0;
}

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
  destroyResource(resources.starTexture);
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

function createCloudMipLevelStorage(width, height, depth, channels) {
  const levels = [];
  // Texture3D retains the base-level unpack alignment for explicit mip uploads.
  const alignment = PixelFormat.alignmentInBytes(
    channels === 1 ? PixelFormat.RED : PixelFormat.RGBA,
    PixelDatatype.UNSIGNED_BYTE,
    width,
  );
  while (width > 1 || height > 1 || depth > 1) {
    width = Math.max(Math.floor(width / 2), 1);
    height = Math.max(Math.floor(height / 2), 1);
    depth = Math.max(Math.floor(depth / 2), 1);
    const rowBytes = Math.ceil((width * channels) / alignment) * alignment;
    levels.push(new Uint8Array(rowBytes * height * depth));
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

function createCloudOccupancySource(
  buffer,
  width,
  height,
  depth,
  sourceChannels,
) {
  const shape = new Uint8Array(buffer);
  let levelWidth = width;
  let levelHeight = height;
  let levelDepth = depth;
  let level = new Uint8Array(width * height * depth);
  const base = level;
  let allPositive = sourceChannels === 1;
  const unpackAlignment = PixelFormat.alignmentInBytes(
    PixelFormat.RED,
    PixelDatatype.UNSIGNED_BYTE,
    width,
  );
  for (let index = 0; index < level.length; index++) {
    if (sourceChannels === 1) {
      level[index] = shape[index];
      allPositive = allPositive && level[index] > 0;
      continue;
    }
    const shapeIndex = index * sourceChannels;
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
  return { arrayBufferView: base, mipLevels, allPositive };
}

function createCloudOccupancyTexture3D(
  context,
  width,
  height,
  depth,
  buffer,
  sourceChannels,
) {
  const source = createCloudOccupancySource(
    buffer,
    width,
    height,
    depth,
    sourceChannels,
  );
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
  return { texture, allPositive: source.allPositive };
}

function createCloudTexture3D(context, width, height, depth, buffer, channels) {
  let texture;
  try {
    texture = new Texture3D({
      context,
      width,
      height,
      depth,
      pixelFormat: channels === 1 ? PixelFormat.RED : PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      source: {
        arrayBufferView: new Uint8Array(buffer),
        mipLevels: createCloudMipLevelStorage(width, height, depth, channels),
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

function createCloudBaseLevelTexture3D(
  context,
  width,
  height,
  depth,
  buffer,
  channels,
) {
  return new Texture3D({
    context,
    width,
    height,
    depth,
    pixelFormat: channels === 1 ? PixelFormat.RED : PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
    source: { arrayBufferView: new Uint8Array(buffer) },
    sampler: volumeBaseLevelSampler,
    flipY: false,
  });
}

function createCloudMipmappedTexture2D(context, width, height, buffer) {
  let texture;
  try {
    texture = new Texture({
      context,
      width,
      height,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      source: { arrayBufferView: new Uint8Array(buffer) },
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
        cloudShadowSource,
        heightFogSource,
        globeCloudLibrarySource,
        cloudLibrarySource,
        fragmentSource,
      ]
    : [
        atmosphereSource,
        cloudShadowSource,
        heightFogSource,
        globeCloudLibrarySource,
        cloudLibrarySource,
        planarCloudTransportSource,
        fragmentSource,
      ];
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

function createPostProgram(context, fragmentSource) {
  const program = ShaderProgram.fromCache({
    context,
    vertexShaderSource: vertexSource,
    fragmentShaderSource: fragmentSource,
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

function destroyBloomResources(resources) {
  if (!defined(resources)) {
    return;
  }
  destroyResource(resources.thresholdFramebuffer);
  destroyResource(resources.blurFramebuffer);
  destroyResource(resources.compositeFramebuffer);
  destroyResource(resources.thresholdProgram);
  destroyResource(resources.blurProgram);
  destroyResource(resources.compositeProgram);
}

function createBloomFramebuffer(context, width, height, sampler) {
  const framebuffer = new FramebufferManager({
    colorAttachmentsLength: 1,
    depth: false,
    depthStencil: false,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
    pixelFormat: PixelFormat.RGBA,
  });
  try {
    framebuffer.update(
      context,
      width,
      height,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    );
    if (defined(sampler)) {
      framebuffer.getColorTexture(0).sampler = sampler;
    }
  } catch (error) {
    framebuffer.destroy();
    throw error;
  }
  return framebuffer;
}

function createBloomResources(renderer, context, width, height) {
  const halfWidth = Math.max(1, Math.ceil(width * 0.5));
  const halfHeight = Math.max(1, Math.ceil(height * 0.5));
  const candidate = {};
  const renderState = RenderState.fromCache({
    cull: { enabled: false },
    depthTest: { enabled: false },
    depthMask: false,
  });
  try {
    candidate.thresholdProgram = createPostProgram(
      context,
      bloomThresholdFragmentSource,
    );
    candidate.blurProgram = createPostProgram(context, bloomBlurFragmentSource);
    candidate.compositeProgram = createPostProgram(
      context,
      bloomCompositeFragmentSource,
    );
    candidate.thresholdFramebuffer = createBloomFramebuffer(
      context,
      halfWidth,
      halfHeight,
      linearSampler,
    );
    candidate.blurFramebuffer = createBloomFramebuffer(
      context,
      halfWidth,
      halfHeight,
      linearSampler,
    );
    candidate.compositeFramebuffer = createBloomFramebuffer(
      context,
      width,
      height,
    );
    const options = {
      vertexArray: renderer._resources.vertexArray,
      uniformMap: renderer._uniformMap,
      renderState,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    };
    candidate.thresholdCommand = new DrawCommand({
      ...options,
      shaderProgram: candidate.thresholdProgram,
    });
    candidate.horizontalBlurCommand = new DrawCommand({
      ...options,
      shaderProgram: candidate.blurProgram,
    });
    candidate.verticalBlurCommand = new DrawCommand({
      ...options,
      shaderProgram: candidate.blurProgram,
    });
    candidate.compositeCommand = new DrawCommand({
      ...options,
      shaderProgram: candidate.compositeProgram,
    });
    candidate.width = width;
    candidate.height = height;
    candidate.halfWidth = halfWidth;
    candidate.halfHeight = halfHeight;
  } catch (error) {
    destroyBloomResources(candidate);
    throw error;
  }
  return candidate;
}

function ensureBloomResources(renderer, context, width, height) {
  const current = renderer._bloomResources;
  const halfWidth = Math.max(1, Math.ceil(width * 0.5));
  const halfHeight = Math.max(1, Math.ceil(height * 0.5));
  if (
    defined(current) &&
    current.width === width &&
    current.height === height &&
    current.halfWidth === halfWidth &&
    current.halfHeight === halfHeight
  ) {
    return current;
  }
  if (defined(current)) {
    let thresholdFramebuffer;
    let blurFramebuffer;
    let compositeFramebuffer;
    try {
      thresholdFramebuffer = createBloomFramebuffer(
        context,
        halfWidth,
        halfHeight,
        linearSampler,
      );
      blurFramebuffer = createBloomFramebuffer(
        context,
        halfWidth,
        halfHeight,
        linearSampler,
      );
      compositeFramebuffer = createBloomFramebuffer(context, width, height);
    } catch (error) {
      destroyResource(thresholdFramebuffer);
      destroyResource(blurFramebuffer);
      destroyResource(compositeFramebuffer);
      throw error;
    }
    const oldThreshold = current.thresholdFramebuffer;
    const oldBlur = current.blurFramebuffer;
    const oldComposite = current.compositeFramebuffer;
    current.thresholdFramebuffer = thresholdFramebuffer;
    current.blurFramebuffer = blurFramebuffer;
    current.compositeFramebuffer = compositeFramebuffer;
    current.width = width;
    current.height = height;
    current.halfWidth = halfWidth;
    current.halfHeight = halfHeight;
    destroyResource(oldThreshold);
    destroyResource(oldBlur);
    destroyResource(oldComposite);
    return current;
  }
  const candidate = createBloomResources(renderer, context, width, height);
  renderer._bloomResources = candidate;
  destroyBloomResources(current);
  return candidate;
}

function destroyGlobeShadowResources(renderer) {
  const shadow = renderer._globeShadowResources;
  if (!defined(shadow)) {
    return;
  }
  destroyResource(shadow.currentFramebuffer);
  destroyResource(shadow.historyFramebuffer0);
  destroyResource(shadow.historyFramebuffer1);
  destroyResource(shadow.program);
  destroyResource(shadow.resolveProgram);
  renderer._globeShadowResources = undefined;
}

function createGlobeShadowResources(renderer, context, resolution) {
  const atlasSize = resolution * 2;
  const candidate = {};
  try {
    candidate.program = createProgram(
      context,
      cloudShadowFragmentSource,
      renderer._mode === SceneGISAtmosphereReferenceFrame.GLOBE,
      ["SCENEGIS_CLOUD_SHADOW_PASS"],
    );
    candidate.resolveProgram = createPostProgram(
      context,
      cloudShadowResolveFragmentSource,
    );
    candidate.currentFramebuffer = new FramebufferManager({
      colorAttachmentsLength: 2,
      depth: false,
      depthStencil: false,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      pixelFormat: PixelFormat.RGBA,
    });
    candidate.currentFramebuffer.update(
      context,
      atlasSize,
      atlasSize,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    );
    candidate.historyFramebuffer0 = createBloomFramebuffer(
      context,
      atlasSize,
      atlasSize,
      linearSampler,
    );
    candidate.historyFramebuffer1 = createBloomFramebuffer(
      context,
      atlasSize,
      atlasSize,
      linearSampler,
    );
    candidate.resolution = resolution;
    candidate.command = new DrawCommand({
      vertexArray: renderer._resources.vertexArray,
      shaderProgram: candidate.program,
      uniformMap: renderer._uniformMap,
      renderState: RenderState.fromCache({
        cull: { enabled: false },
        depthTest: { enabled: false },
        depthMask: false,
      }),
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    });
    candidate.resolveCommand = new DrawCommand({
      vertexArray: renderer._resources.vertexArray,
      shaderProgram: candidate.resolveProgram,
      uniformMap: renderer._uniformMap,
      renderState: RenderState.fromCache({
        cull: { enabled: false },
        depthTest: { enabled: false },
        depthMask: false,
      }),
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    });
    candidate.clearCommand = new ClearCommand({
      color: Color.TRANSPARENT,
      framebuffer: candidate.currentFramebuffer.framebuffer,
      owner: renderer,
    });
    candidate.historyReadIndex = 0;
    candidate.historyWriteIndex = 1;
    candidate.historyValid = false;
    candidate.outputFramebuffer = candidate.historyFramebuffer1;
  } catch (error) {
    destroyResource(candidate.currentFramebuffer);
    destroyResource(candidate.historyFramebuffer0);
    destroyResource(candidate.historyFramebuffer1);
    destroyResource(candidate.program);
    destroyResource(candidate.resolveProgram);
    throw error;
  }
  return candidate;
}

function ensureGlobeShadowResources(renderer, context, resolution) {
  const current = renderer._globeShadowResources;
  if (defined(current) && current.resolution === resolution) {
    current.command.vertexArray = renderer._resources.vertexArray;
    current.resolveCommand.vertexArray = renderer._resources.vertexArray;
    return current;
  }
  const candidate = createGlobeShadowResources(renderer, context, resolution);
  renderer._globeShadowResources = candidate;
  if (defined(current)) {
    destroyResource(current.currentFramebuffer);
    destroyResource(current.historyFramebuffer0);
    destroyResource(current.historyFramebuffer1);
    destroyResource(current.program);
    destroyResource(current.resolveProgram);
  }
  renderer.invalidateCloudHistory("cloud-shadow-atlas");
  return candidate;
}

function toLocalDirection(frame, direction, result) {
  result.x = Cartesian3.dot(direction, frame.east);
  result.y = Cartesian3.dot(direction, frame.north);
  result.z = Cartesian3.dot(direction, frame.vertical);
  return Cartesian3.normalize(result, result);
}

function practicalSplit(near, far, index, count) {
  const fraction = index / count;
  const logarithmic = near * Math.pow(far / near, fraction);
  const uniform = near + (far - near) * fraction;
  return (
    cloudShadowSplitLambda * logarithmic +
    (1.0 - cloudShadowSplitLambda) * uniform
  );
}

function shadowCascadeFadeHalfWidth(near, far, splitDistance) {
  const normalizedSplit = splitDistance / far;
  return 0.25 * normalizedSplit * normalizedSplit * Math.max(far - near, 1.0);
}

function addFrustumCorner(
  renderer,
  cameraPosition,
  direction,
  right,
  up,
  distance,
  horizontal,
  vertical,
  corners,
) {
  const corner = new Cartesian3();
  Cartesian3.multiplyByScalar(direction, distance, corner);
  Cartesian3.add(cameraPosition, corner, corner);
  Cartesian3.multiplyByScalar(right, horizontal, renderer._shadowScratch0);
  Cartesian3.add(corner, renderer._shadowScratch0, corner);
  Cartesian3.multiplyByScalar(up, vertical, renderer._shadowScratch0);
  Cartesian3.add(corner, renderer._shadowScratch0, corner);
  const frame = renderer._frame;
  if (frame.mode === SceneGISAtmosphereReferenceFrame.PLANAR) {
    corners.push(corner);
    return;
  }
  Cartesian3.subtract(corner, frame.ellipsoidCenter, renderer._shadowScratch0);
  const centered = renderer._shadowScratch0;
  const radii = frame.ellipsoidRadii;
  const radiiSquared = renderer._shadowRadiiSquared;
  radiiSquared.x = radii.x * radii.x;
  radiiSquared.y = radii.y * radii.y;
  radiiSquared.z = radii.z * radii.z;
  const geodeticNormal = renderer._shadowGeodeticNormal;
  geodeticNormal.x = centered.x / radiiSquared.x;
  geodeticNormal.y = centered.y / radiiSquared.y;
  geodeticNormal.z = centered.z / radiiSquared.z;
  Cartesian3.normalize(geodeticNormal, geodeticNormal);
  const surfaceScale =
    1.0 /
    Math.sqrt(
      radiiSquared.x * geodeticNormal.x * geodeticNormal.x +
        radiiSquared.y * geodeticNormal.y * geodeticNormal.y +
        radiiSquared.z * geodeticNormal.z * geodeticNormal.z,
    );
  const ellipsoidSurface = renderer._shadowEllipsoidSurface;
  ellipsoidSurface.x = radiiSquared.x * geodeticNormal.x * surfaceScale;
  ellipsoidSurface.y = radiiSquared.y * geodeticNormal.y * surfaceScale;
  ellipsoidSurface.z = radiiSquared.z * geodeticNormal.z * surfaceScale;
  Cartesian3.subtract(centered, ellipsoidSurface, renderer._shadowScratch0);
  const height = Cartesian3.dot(renderer._shadowScratch0, geodeticNormal);
  Cartesian3.multiplyByScalar(
    geodeticNormal,
    globeCloudBottomRadius + height,
    corner,
  );
  corners.push(corner);
}

function buildCascadeCorners(renderer, camera, near, far) {
  const frame = renderer._frame;
  const cameraPosition = frame.cameraPosition;
  const direction = frame.cameraDirection;
  const right = frame.cameraRight;
  const up = frame.cameraUp;
  void camera.frustum.projectionMatrix;
  const frustum = camera.frustum.offCenterFrustum ?? camera.frustum;
  const perspective = frame.projection === "perspective";
  const corners = [];
  for (const distance of [near, far]) {
    const scale = perspective ? distance / frustum.near : 1.0;
    for (const horizontal of [frustum.left * scale, frustum.right * scale]) {
      for (const vertical of [frustum.bottom * scale, frustum.top * scale]) {
        addFrustumCorner(
          renderer,
          cameraPosition,
          direction,
          right,
          up,
          distance,
          horizontal,
          vertical,
          corners,
        );
      }
    }
  }
  return corners;
}

function computeStableCascadeRadius(camera, near, far, perspective) {
  void camera.frustum.projectionMatrix;
  const frustum = camera.frustum.offCenterFrustum ?? camera.frustum;
  const nearScale = perspective ? near / frustum.near : 1.0;
  const farScale = perspective ? far / frustum.near : 1.0;
  const centerHorizontal =
    (frustum.left + frustum.right) * (nearScale + farScale) * 0.25;
  const centerVertical =
    (frustum.bottom + frustum.top) * (nearScale + farScale) * 0.25;
  const nearHorizontal = Math.max(
    Math.abs(frustum.left * nearScale - centerHorizontal),
    Math.abs(frustum.right * nearScale - centerHorizontal),
  );
  const nearVertical = Math.max(
    Math.abs(frustum.bottom * nearScale - centerVertical),
    Math.abs(frustum.top * nearScale - centerVertical),
  );
  const farHorizontal = Math.max(
    Math.abs(frustum.left * farScale - centerHorizontal),
    Math.abs(frustum.right * farScale - centerHorizontal),
  );
  const farVertical = Math.max(
    Math.abs(frustum.bottom * farScale - centerVertical),
    Math.abs(frustum.top * farScale - centerVertical),
  );
  const distanceDelta = (far - near) * 0.5;
  const radiusSquared = Math.max(
    distanceDelta * distanceDelta +
      nearHorizontal * nearHorizontal +
      nearVertical * nearVertical,
    distanceDelta * distanceDelta +
      farHorizontal * farHorizontal +
      farVertical * farVertical,
  );
  return Math.max(Math.sqrt(radiusSquared) * cloudShadowStableRadiusScale, 1.0);
}

function buildShadowMatrix(
  right,
  up,
  rayDirection,
  center,
  halfWidth,
  halfHeight,
  halfDepth,
  result,
) {
  return Matrix4.fromRowMajorArray(
    [
      right.x / halfWidth,
      right.y / halfWidth,
      right.z / halfWidth,
      -Cartesian3.dot(right, center) / halfWidth,
      up.x / halfHeight,
      up.y / halfHeight,
      up.z / halfHeight,
      -Cartesian3.dot(up, center) / halfHeight,
      rayDirection.x / halfDepth,
      rayDirection.y / halfDepth,
      rayDirection.z / halfDepth,
      -Cartesian3.dot(rayDirection, center) / halfDepth,
      0.0,
      0.0,
      0.0,
      1.0,
    ],
    result,
  );
}

function updateGlobeShadowCascades(renderer, frameState, profile) {
  const camera = frameState.camera;
  const frustum = camera.frustum.offCenterFrustum ?? camera.frustum;
  const near = Math.max(frustum.near, 0.1);
  const far = Math.max(
    near + 1.0,
    Math.min(frustum.far, cloudShadowMaximumDistance),
  );
  toLocalDirection(
    renderer._frame,
    renderer._primaryLightDirection,
    renderer._shadowSunLocal,
  );
  Cartesian3.negate(
    renderer._primaryLightDirection,
    renderer._shadowRayDirectionWorld,
  );
  const reference =
    Math.abs(renderer._shadowRayDirectionWorld.z) > 0.95
      ? Cartesian3.UNIT_X
      : Cartesian3.UNIT_Z;
  Cartesian3.cross(
    reference,
    renderer._shadowRayDirectionWorld,
    renderer._shadowLightRightWorld,
  );
  Cartesian3.normalize(
    renderer._shadowLightRightWorld,
    renderer._shadowLightRightWorld,
  );
  Cartesian3.cross(
    renderer._shadowRayDirectionWorld,
    renderer._shadowLightRightWorld,
    renderer._shadowLightUpWorld,
  );
  Cartesian3.normalize(
    renderer._shadowLightUpWorld,
    renderer._shadowLightUpWorld,
  );
  toLocalDirection(
    renderer._frame,
    renderer._shadowRayDirectionWorld,
    renderer._shadowRayDirection,
  );
  toLocalDirection(
    renderer._frame,
    renderer._shadowLightRightWorld,
    renderer._shadowLightRight,
  );
  toLocalDirection(
    renderer._frame,
    renderer._shadowLightUpWorld,
    renderer._shadowLightUp,
  );
  renderer._shadowNear = near;
  renderer._shadowFar = far;
  renderer._shadowCascadeCount = profile.shadowCascades;
  for (let cascade = 0; cascade < profile.shadowCascades; cascade++) {
    const splitNear =
      cascade === 0
        ? near
        : practicalSplit(near, far, cascade, profile.shadowCascades);
    const splitFar = practicalSplit(
      near,
      far,
      cascade + 1,
      profile.shadowCascades,
    );
    const interval = renderer._shadowIntervals[cascade];
    interval.x = splitNear;
    interval.y = splitFar;
    const producerNear = Math.max(
      near,
      splitNear - shadowCascadeFadeHalfWidth(near, far, splitNear),
    );
    const producerFar = Math.min(
      far,
      splitFar + shadowCascadeFadeHalfWidth(near, far, splitFar),
    );
    const corners = buildCascadeCorners(
      renderer,
      camera,
      producerNear,
      producerFar,
    );
    const center = renderer._shadowCenters[cascade];
    Cartesian3.fromElements(0.0, 0.0, 0.0, center);
    for (const corner of corners) {
      Cartesian3.add(center, corner, center);
    }
    Cartesian3.multiplyByScalar(center, 1.0 / corners.length, center);
    const radius = computeStableCascadeRadius(
      camera,
      producerNear,
      producerFar,
      renderer._frame.projection === "perspective",
    );
    const centerX = Cartesian3.dot(center, renderer._shadowLightRightWorld);
    const centerY = Cartesian3.dot(center, renderer._shadowLightUpWorld);
    const texel = (radius * 2.0) / profile.shadowResolution;
    const gridCenter = renderer._shadowGridCenters[cascade];
    gridCenter.x = Math.round(centerX / texel);
    gridCenter.y = Math.round(centerY / texel);
    const snappedX = gridCenter.x * texel;
    const snappedY = gridCenter.y * texel;
    const centerDepth = Cartesian3.dot(
      center,
      renderer._shadowRayDirectionWorld,
    );
    Cartesian3.multiplyByScalar(
      renderer._shadowLightRightWorld,
      snappedX,
      center,
    );
    Cartesian3.multiplyByScalar(
      renderer._shadowLightUpWorld,
      snappedY,
      renderer._shadowScratch0,
    );
    Cartesian3.add(center, renderer._shadowScratch0, center);
    Cartesian3.multiplyByScalar(
      renderer._shadowRayDirectionWorld,
      centerDepth,
      renderer._shadowScratch0,
    );
    Cartesian3.add(center, renderer._shadowScratch0, center);
    renderer._shadowHalfSizes[cascade].x = radius;
    renderer._shadowHalfSizes[cascade].y = radius;
    buildShadowMatrix(
      renderer._shadowLightRightWorld,
      renderer._shadowLightUpWorld,
      renderer._shadowRayDirectionWorld,
      renderer._mode === SceneGISAtmosphereReferenceFrame.GLOBE
        ? center
        : Cartesian3.subtract(
            center,
            renderer._shadowOrigin,
            renderer._shadowScratch0,
          ),
      radius,
      radius,
      cloudShadowMaximumDistance,
      renderer._shadowMatrices[cascade],
    );
    Matrix4.inverse(
      renderer._shadowMatrices[cascade],
      renderer._shadowInverseMatrices[cascade],
    );
  }
}

function createShadowHistorySnapshot() {
  return {
    valid: false,
    projection: undefined,
    cameraPosition: new Cartesian3(),
    shadowOrigin: new Cartesian3(),
    cameraDirection: new Cartesian3(),
    cameraUp: new Cartesian3(),
    frustum: new Cartesian4(),
    sunDirection: new Cartesian3(),
    primaryLightScale: new Cartesian3(),
    ellipsoidCenter: new Cartesian3(),
    ellipsoidRadii: new Cartesian3(),
    cloudOffset: new Cartesian2(),
    shadowHalfSizes: new Cartesian3(),
    shadowResolution: 0,
    cloudTime: 0.0,
    quality: undefined,
    preset: undefined,
    coverage: 0.0,
    density: 0.0,
    cloudBaseHeight: 0.0,
    cloudThickness: 0.0,
    baseHeight: 0.0,
    detail: false,
  };
}

function shadowGridLatticeCompatible(renderer) {
  const snapshot = renderer._shadowHistorySnapshot;
  const shadow = renderer._globeShadowResources;
  return (
    snapshot.valid &&
    defined(shadow) &&
    snapshot.shadowResolution === shadow.resolution &&
    snapshot.shadowHalfSizes.x === renderer._shadowHalfSizes[0].x &&
    snapshot.shadowHalfSizes.y === renderer._shadowHalfSizes[1].x &&
    snapshot.shadowHalfSizes.z === renderer._shadowHalfSizes[2].x &&
    Cartesian3.equals(snapshot.sunDirection, renderer._primaryLightDirection)
  );
}

function shadowFrustumContinuous(previous, current) {
  return (
    Math.abs(current.x - previous.x) <=
      Math.max(Math.abs(previous.x), 1.0e-6) * 0.25 &&
    Math.abs(current.y - previous.y) <=
      Math.max(Math.abs(previous.y), 1.0e-6) * 0.25 &&
    Math.abs(current.z - previous.z) <=
      Math.max(Math.abs(previous.z), 1.0e-6) * 0.25 &&
    Math.abs(current.w - previous.w) <=
      Math.max(Math.abs(previous.w), 1.0e-6) * 0.25
  );
}

function shadowHistoryContinuous(renderer) {
  const snapshot = renderer._shadowHistorySnapshot;
  const frame = renderer._frame;
  const owner = renderer._owner;
  const cloudTime = owner._cloudTime;
  return (
    snapshot.valid &&
    snapshot.projection === frame.projection &&
    Cartesian3.distance(snapshot.cameraPosition, frame.cameraPosition) <=
      cloudHistoryMaximumTranslation &&
    shadowFrustumContinuous(snapshot.frustum, renderer._frustum) &&
    Math.abs(cloudTime - snapshot.cloudTime) < 1.0 &&
    Cartesian3.dot(snapshot.sunDirection, renderer._primaryLightDirection) >=
      cloudHistoryMinimumSunDot &&
    Cartesian3.equals(snapshot.ellipsoidCenter, frame.ellipsoidCenter) &&
    Cartesian3.equals(snapshot.ellipsoidRadii, frame.ellipsoidRadii) &&
    snapshot.quality === owner._cloudQuality &&
    snapshot.preset === owner._cloudPreset &&
    snapshot.coverage === owner._cloudCoverage &&
    snapshot.density === owner._cloudDensity &&
    snapshot.cloudBaseHeight === owner._cloudBaseHeight &&
    snapshot.cloudThickness === owner._cloudThickness &&
    snapshot.baseHeight === frame.baseHeight &&
    snapshot.detail === cloudQualityProfiles[owner._cloudQuality].detail &&
    Cartesian3.equals(snapshot.primaryLightScale, renderer._primaryLightScale)
  );
}

function publishShadowHistorySnapshot(renderer) {
  const snapshot = renderer._shadowHistorySnapshot;
  const frame = renderer._frame;
  snapshot.valid = true;
  snapshot.projection = frame.projection;
  Cartesian3.clone(frame.cameraPosition, snapshot.cameraPosition);
  Cartesian3.clone(renderer._shadowOrigin, snapshot.shadowOrigin);
  Cartesian3.clone(frame.cameraDirection, snapshot.cameraDirection);
  Cartesian3.clone(frame.cameraUp, snapshot.cameraUp);
  Cartesian4.clone(renderer._frustum, snapshot.frustum);
  Cartesian3.clone(renderer._primaryLightDirection, snapshot.sunDirection);
  Cartesian3.clone(renderer._primaryLightScale, snapshot.primaryLightScale);
  Cartesian3.clone(frame.ellipsoidCenter, snapshot.ellipsoidCenter);
  Cartesian3.clone(frame.ellipsoidRadii, snapshot.ellipsoidRadii);
  Cartesian2.clone(renderer._cloudOffset, snapshot.cloudOffset);
  snapshot.shadowHalfSizes.x = renderer._shadowHalfSizes[0].x;
  snapshot.shadowHalfSizes.y = renderer._shadowHalfSizes[1].x;
  snapshot.shadowHalfSizes.z = renderer._shadowHalfSizes[2].x;
  snapshot.shadowResolution = renderer._globeShadowResources.resolution;
  const owner = renderer._owner;
  snapshot.cloudTime = owner._cloudTime;
  snapshot.quality = owner._cloudQuality;
  snapshot.preset = owner._cloudPreset;
  snapshot.coverage = owner._cloudCoverage;
  snapshot.density = owner._cloudDensity;
  snapshot.cloudBaseHeight = owner._cloudBaseHeight;
  snapshot.cloudThickness = owner._cloudThickness;
  snapshot.baseHeight = frame.baseHeight;
  snapshot.detail = cloudQualityProfiles[owner._cloudQuality].detail;
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
    const createVolume = globe
      ? createCloudBaseLevelTexture3D
      : createCloudTexture3D;
    candidate.cloudShapeTexture = createVolume(
      context,
      128,
      128,
      128,
      buffers.cloudShape,
      1,
    );
    const occupancy = createCloudOccupancyTexture3D(
      context,
      128,
      128,
      128,
      buffers.cloudShape,
      1,
    );
    candidate.cloudOccupancyTexture = occupancy.texture;
    candidate.cloudOccupancyAllPositive = occupancy.allPositive;
    candidate.cloudDetailTexture = createVolume(
      context,
      32,
      32,
      32,
      buffers.cloudDetail,
      1,
    );
    candidate.cloudWeatherTexture = createCloudMipmappedTexture2D(
      context,
      512,
      512,
      buffers.cloudWeather,
    );
    candidate.cloudTurbulenceTexture = createCloudMipmappedTexture2D(
      context,
      128,
      128,
      buffers.cloudTurbulence,
    );
    candidate.cloudStbnTexture = createCloudStbnTexture(
      context,
      buffers.cloudStbn,
    );
    candidate.starTexture = new CubeMap({ context, source: buffers.stars });
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

const sunFixedTransform = new Matrix3();
const sunInertialPosition = new Cartesian3();
const sunFixedPosition = new Cartesian3();
const moonInertialPosition = new Cartesian3();
const moonToObserver = new Cartesian3();
const moonToSun = new Cartesian3();
const primaryWeightedDirection = new Cartesian3();
const solarIrradiance = new Cartesian3(1.474, 1.8504, 1.91198);
const moonFullPhaseIrradiance = new Cartesian3(0.12, 0.16, 0.22);
const sinNightStart = Math.sin((-6.0 * Math.PI) / 180.0);
const sinNightEnd = Math.sin((-12.0 * Math.PI) / 180.0);
const sinMoonHorizonEnd = Math.sin((3.0 * Math.PI) / 180.0);

function smoothStep01(value) {
  const t = Math.min(Math.max(value, 0.0), 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function luminance(value) {
  return value.x * 0.2126 + value.y * 0.7152 + value.z * 0.0722;
}

function computeGlobeSunDirection(time, result) {
  Transforms.computeIcrfToCentralBodyFixedMatrix(time, sunFixedTransform);
  Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
    time,
    sunInertialPosition,
  );
  Matrix3.multiplyByVector(
    sunFixedTransform,
    sunInertialPosition,
    sunFixedPosition,
  );
  return Cartesian3.normalize(sunFixedPosition, result);
}

function updateGlobeCelestialAuthority(renderer, frameState, time) {
  if (
    defined(frameState.frameNumber) &&
    renderer._celestialFrameNumber === frameState.frameNumber &&
    renderer._celestialTimeValid &&
    JulianDate.equals(renderer._celestialTime, time)
  ) {
    return;
  }
  renderer._celestialFrameNumber = frameState.frameNumber;
  JulianDate.clone(time, renderer._celestialTime);
  renderer._celestialTimeValid = true;
  computeGlobeSunDirection(time, renderer._sunDirection);
  Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
    time,
    moonInertialPosition,
  );
  Matrix3.multiplyByVector(
    sunFixedTransform,
    moonInertialPosition,
    renderer._moonPosition,
  );
  Cartesian3.subtract(
    renderer._moonPosition,
    renderer._frame.surfacePosition,
    renderer._moonDirection,
  );
  Cartesian3.normalize(renderer._moonDirection, renderer._moonDirection);

  const sunUp = Cartesian3.dot(
    renderer._frame.vertical,
    renderer._sunDirection,
  );
  const nightFactor = smoothStep01(
    (sinNightStart - sunUp) / (sinNightStart - sinNightEnd),
  );
  const moonUp = Cartesian3.dot(
    renderer._frame.vertical,
    renderer._moonDirection,
  );
  const moonHorizonFactor = smoothStep01(moonUp / sinMoonHorizonEnd);
  Cartesian3.subtract(
    renderer._frame.surfacePosition,
    renderer._moonPosition,
    moonToObserver,
  );
  Cartesian3.subtract(sunFixedPosition, renderer._moonPosition, moonToSun);
  Cartesian3.normalize(moonToObserver, moonToObserver);
  Cartesian3.normalize(moonToSun, moonToSun);
  const phaseAngle = Math.acos(
    Math.min(Math.max(Cartesian3.dot(moonToObserver, moonToSun), -1.0), 1.0),
  );
  const moonPhase =
    (Math.sin(phaseAngle) + (Math.PI - phaseAngle) * Math.cos(phaseAngle)) /
    Math.PI;
  updatePrimaryLight(
    renderer,
    nightFactor,
    moonHorizonFactor,
    moonPhase,
    renderer._owner._celestialSunColor,
    renderer._owner._celestialSunIntensity,
  );
}

function updatePlanarCelestialAuthority(renderer) {
  const environment = renderer._world.environment;
  Cartesian3.clone(environment._effectiveSunDirection, renderer._sunDirection);
  Cartesian3.clone(
    environment._effectiveMoonDirection,
    renderer._moonDirection,
  );
  const nightFactor = smoothStep01(
    (sinNightStart - renderer._sunDirection.z) / (sinNightStart - sinNightEnd),
  );
  const moonHorizonFactor = smoothStep01(
    renderer._moonDirection.z / sinMoonHorizonEnd,
  );
  // Directional phase is independent of projected XY and camera orientation.
  const phaseAngle = Math.acos(
    Math.min(
      Math.max(
        -Cartesian3.dot(renderer._sunDirection, renderer._moonDirection),
        -1.0,
      ),
      1.0,
    ),
  );
  const moonPhase =
    (Math.sin(phaseAngle) + (Math.PI - phaseAngle) * Math.cos(phaseAngle)) /
    Math.PI;
  updatePrimaryLight(
    renderer,
    nightFactor,
    moonHorizonFactor,
    moonPhase,
    environment._sunColor,
    environment._sunIntensity,
  );
}

function updatePrimaryLight(
  renderer,
  nightFactor,
  moonHorizonFactor,
  moonPhase,
  sunColor,
  sunIntensity,
) {
  const moonContribution =
    nightFactor *
    moonHorizonFactor *
    moonPhase *
    renderer._owner._moonlightIntensity *
    (renderer._owner._showMoonlight ? 1.0 : 0.0);
  renderer._nightFactor = nightFactor;
  renderer._moonHorizonFactor = moonHorizonFactor;
  renderer._moonPhase = moonPhase;
  renderer._moonContribution = moonContribution;
  Cartesian3.multiplyByScalar(
    moonFullPhaseIrradiance,
    moonContribution,
    renderer._moonIrradiance,
  );
  renderer._primaryLightScale.x =
    1.0 - nightFactor + renderer._moonIrradiance.x / solarIrradiance.x;
  renderer._primaryLightScale.y =
    1.0 - nightFactor + renderer._moonIrradiance.y / solarIrradiance.y;
  renderer._primaryLightScale.z =
    1.0 - nightFactor + renderer._moonIrradiance.z / solarIrradiance.z;

  const sunWeight = luminance(solarIrradiance) * (1.0 - nightFactor);
  const moonWeight = luminance(renderer._moonIrradiance);
  Cartesian3.multiplyByScalar(
    renderer._sunDirection,
    sunWeight,
    primaryWeightedDirection,
  );
  Cartesian3.multiplyByScalar(
    renderer._moonDirection,
    moonWeight,
    renderer._primaryLightDirectionScratch,
  );
  Cartesian3.add(
    primaryWeightedDirection,
    renderer._primaryLightDirectionScratch,
    primaryWeightedDirection,
  );
  if (Cartesian3.magnitudeSquared(primaryWeightedDirection) > 1.0e-24) {
    Cartesian3.normalize(
      primaryWeightedDirection,
      renderer._primaryLightDirection,
    );
  }

  if (nightFactor === 0.0) {
    Color.clone(sunColor, renderer._nativeLightColor);
    renderer._nativeLightIntensity = sunIntensity;
  } else if (nightFactor === 1.0) {
    renderer._nativeLightColor.red = renderer._moonIrradiance.x;
    renderer._nativeLightColor.green = renderer._moonIrradiance.y;
    renderer._nativeLightColor.blue = renderer._moonIrradiance.z;
    renderer._nativeLightColor.alpha = 1.0;
    renderer._nativeLightIntensity = 1.0;
  } else {
    renderer._nativeLightColor.red =
      sunColor.red * sunIntensity * (1.0 - nightFactor) +
      renderer._moonIrradiance.x;
    renderer._nativeLightColor.green =
      sunColor.green * sunIntensity * (1.0 - nightFactor) +
      renderer._moonIrradiance.y;
    renderer._nativeLightColor.blue =
      sunColor.blue * sunIntensity * (1.0 - nightFactor) +
      renderer._moonIrradiance.z;
    renderer._nativeLightColor.alpha = 1.0;
    renderer._nativeLightIntensity = 1.0;
  }
  renderer._primaryLightState.nativeIntensity = renderer._nativeLightIntensity;
  renderer._primaryLightState.moonContribution = moonContribution;
}

function updateFrame(renderer, scene, frameState, time) {
  SceneGISAtmosphereReferenceFrame.publish(
    {
      mode: renderer._mode,
      scene,
      world: renderer._world,
    },
    renderer._frame,
    renderer._scratchFrame,
  );
  updateFrustum(renderer, frameState.camera);
  if (renderer._mode === SceneGISAtmosphereReferenceFrame.GLOBE) {
    const celestialTime = defined(time)
      ? time
      : renderer._celestialTimeValid
        ? renderer._celestialTime
        : frameState.time;
    updateGlobeCelestialAuthority(renderer, frameState, celestialTime);
  }
  if (renderer._mode !== SceneGISAtmosphereReferenceFrame.GLOBE) {
    updatePlanarCelestialAuthority(renderer);
  }
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

function updateStarRotation(renderer, time) {
  const rotation = renderer._worldToStars;
  const environment = renderer._world?.environment;
  if (defined(environment) && environment.directionMode === "manual") {
    Matrix3.clone(Matrix3.IDENTITY, rotation);
    return;
  }
  Transforms.computeTemeToPseudoFixedMatrix(time, rotation);
  Matrix3.transpose(rotation, rotation);
  if (defined(environment)) {
    Cartesian3.fromRadians(
      environment.originLongitude,
      environment.originLatitude,
      0.0,
      undefined,
      renderer._starObserver,
    );
    Transforms.eastNorthUpToFixedFrame(
      renderer._starObserver,
      undefined,
      renderer._starEnuTransform,
    );
    Matrix4.getMatrix3(renderer._starEnuTransform, renderer._starEnuRotation);
    Matrix3.multiply(rotation, renderer._starEnuRotation, rotation);
  }
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
  this._bloomResources = undefined;
  this._worldToStars = Matrix3.clone(Matrix3.IDENTITY);
  this._starObserver = new Cartesian3();
  this._starEnuTransform = new Matrix4();
  this._starEnuRotation = new Matrix3();
  this._showAtmosphere = true;
  this._showAerialPerspective = true;
  this._showHeightFog = true;
  this._showClouds = true;
  this._cloudPassActive = false;
  this._frame = SceneGISAtmosphereReferenceFrame.createSnapshot();
  this._scratchFrame = SceneGISAtmosphereReferenceFrame.createSnapshot();
  this._frustum = new Cartesian4();
  this._sunDirection = new Cartesian3();
  this._moonPosition = new Cartesian3();
  this._moonDirection = new Cartesian3();
  this._primaryLightDirection = new Cartesian3(1.0, 0.0, 0.0);
  this._primaryLightDirectionScratch = new Cartesian3();
  this._primaryLightScale = new Cartesian3(1.0, 1.0, 1.0);
  this._moonIrradiance = new Cartesian3();
  this._nativeLightColor = new Color();
  this._nativeLightIntensity = 2.0;
  this._nightFactor = 0.0;
  this._moonHorizonFactor = 0.0;
  this._moonPhase = 0.0;
  this._moonContribution = 0.0;
  this._celestialFrameNumber = undefined;
  this._celestialTime = new JulianDate();
  this._celestialTimeValid = false;
  this._planarLightEnvironment = undefined;
  this._primaryLightState = {
    direction: this._primaryLightDirection,
    scale: this._primaryLightScale,
    nativeColor: this._nativeLightColor,
    nativeIntensity: this._nativeLightIntensity,
    moonContribution: 0.0,
  };
  this._cloudOffset = new Cartesian2();
  this._planarCloudMaterialOrigin = new Cartesian2();
  this._planarShadowMaterialOrigin = new Cartesian2();
  this._perspective = true;
  this._hasCurrentGlobeDepth = true;
  this._inputColorTexture = undefined;
  this._depthTexture = undefined;
  this._bloomTexture = undefined;
  this._bloomDirection = new Cartesian2();
  this._sunViewportCoordinates = new Cartesian2(0.5, 0.5);
  this._sunLensVisible = false;
  this._bloomHalfPassState = undefined;
  this._bloomFullPassState = undefined;
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
  this._cloudHistorySnapshot = createCloudHistorySnapshot();
  this._cloudCameraDelta = new Cartesian3();
  this._shadowOrigin = new Cartesian3();
  this._shadowOriginDelta = new Cartesian3();
  this._shadowCameraRelative = new Cartesian3();
  this._cloudHistoryWeight = 0.0;
  this._cloudHistoryStationary = false;
  this._cloudHistoryReprojection = false;
  this._cloudHistoryDiagnostics = {
    stationary: false,
    mode: "invalid-spatial-only",
    compatibility: "structured-full-attachments",
    resetReason: "initial",
    historyValid: false,
    weight: 0.0,
  };
  this._cloudHistoryPendingResetReason = "initial";
  this._cloudBufferDimensions = new Cartesian2();
  this._globeShadowResources = undefined;
  this._shadowCascadeIndex = 0;
  this._shadowCascadeCount = 0;
  this._shadowNear = 0.1;
  this._shadowFar = cloudShadowMaximumDistance;
  this._shadowMatrices = [new Matrix4(), new Matrix4(), new Matrix4()];
  this._shadowPreviousMatrices = [new Matrix4(), new Matrix4(), new Matrix4()];
  this._shadowInverseMatrices = [new Matrix4(), new Matrix4(), new Matrix4()];
  this._shadowIntervals = [
    new Cartesian2(),
    new Cartesian2(),
    new Cartesian2(),
  ];
  this._shadowCloudSupport = new Cartesian2();
  this._shadowCloudCasterActive = false;
  this._shadowCenters = [new Cartesian3(), new Cartesian3(), new Cartesian3()];
  this._shadowHalfSizes = [
    new Cartesian2(),
    new Cartesian2(),
    new Cartesian2(),
  ];
  this._shadowGridCenters = [
    new Cartesian2(),
    new Cartesian2(),
    new Cartesian2(),
  ];
  this._shadowSunLocal = new Cartesian3();
  this._shadowRayDirectionWorld = new Cartesian3();
  this._shadowLightRightWorld = new Cartesian3();
  this._shadowLightUpWorld = new Cartesian3();
  this._shadowRayDirection = new Cartesian3();
  this._shadowLightRight = new Cartesian3();
  this._shadowLightUp = new Cartesian3();
  this._shadowCameraLocal = new Cartesian3();
  this._shadowDirectionLocal = new Cartesian3();
  this._shadowRightLocal = new Cartesian3();
  this._shadowUpLocal = new Cartesian3();
  this._shadowScratch0 = new Cartesian3();
  this._shadowRadiiSquared = new Cartesian3();
  this._shadowGeodeticNormal = new Cartesian3();
  this._shadowEllipsoidSurface = new Cartesian3();
  this._shadowPassState = undefined;
  this._shadowHistorySnapshot = createShadowHistorySnapshot();
  this._globeLightingRecord = undefined;

  const that = this;
  this._uniformMap = {
    u_perspective: () => that._perspective,
    u_hasCurrentGlobeDepth: () => that._hasCurrentGlobeDepth,
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
    u_primaryLightDirection: () => that._primaryLightDirection,
    u_primaryLightScale: () => that._primaryLightScale,
    u_altitude: () => that._frame.altitude,
    u_baseHeight: () => that._frame.baseHeight,
    u_ellipsoidCenter: () => that._frame.ellipsoidCenter,
    u_ellipsoidRadii: () => that._frame.ellipsoidRadii,
    u_backgroundRadianceScale: () => that._owner._backgroundRadianceScale,
    u_showStars: () => that._owner._showStars,
    u_starIntensity: () => that._owner._starIntensity,
    u_starTexture: () => that._resources.starTexture,
    u_worldToStars: () => that._worldToStars,
    u_aerialRadianceScale: () => that._owner._aerialRadianceScale,
    u_surfaceRadianceScale: () => that._owner._surfaceRadianceScale,
    u_showAerialPerspective: () => that._showAerialPerspective,
    u_showHeightFog: () => that._showHeightFog,
    u_showClouds: () => that._cloudPassActive,
    u_cloudCoverage: () => that._owner._cloudCoverage,
    u_cloudDensity: () => that._owner._cloudDensity,
    u_cloudBaseHeight: () => that._owner._cloudBaseHeight,
    u_cloudThickness: () => that._owner._cloudThickness,
    u_cloudOffset: () => that._cloudOffset,
    u_planarCloudMaterialOrigin: () =>
      planarCloudMaterialOrigin(
        that._frame.cameraPosition,
        that._planarCloudMaterialOrigin,
      ),
    u_planarShadowMaterialOrigin: () =>
      planarCloudMaterialOrigin(
        that._shadowOrigin,
        that._planarShadowMaterialOrigin,
      ),
    u_cloudRadianceScale: () => that._owner._cloudRadianceScale,
    u_cloudPreset: () => cloudPresetIndices[that._owner._cloudPreset],
    u_cloudTracePhased: () => that._owner._cloudQuality === "medium",
    u_cloudStbnSlice: () => {
      const phase = that._scene.frameState.frameNumber;
      const slice = ((phase % 64) + 64) % 64;
      return (slice + 0.5) / 64.0;
    },
    // Preserve the accepted Beer atlas phase independently of view reconstruction.
    u_cloudShadowStbnSlice: () => {
      const phase =
        that._mode === SceneGISAtmosphereReferenceFrame.GLOBE
          ? that._scene.frameState.frameNumber
          : Math.floor(that._owner._cloudTime * 60.0);
      const slice = ((phase % 64) + 64) % 64;
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
    u_sceneGISGlobeCloudTurbulence: () => that._owner._cloudQuality === "high",
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
    u_bloomTexture: () => that._bloomTexture,
    u_bloomDirection: () => that._bloomDirection,
    u_sunViewportCoordinates: () => that._sunViewportCoordinates,
    u_sunLensVisible: () => that._sunLensVisible,
    u_showBloom: () => that._owner._showBloom,
    u_showLensFlare: () => that._owner._showLensFlare,
    u_bloomThreshold: () => that._owner._bloomThreshold,
    u_bloomIntensity: () => that._owner._bloomIntensity,
    u_lensFlareIntensity: () => that._owner._lensFlareIntensity,
    u_transmittanceTexture: () => that._resources?.transmittanceTexture,
    u_scatteringTexture: () => that._resources?.scatteringTexture,
    u_irradianceTexture: () => that._resources?.irradianceTexture,
    u_cloudShapeTexture: () => that._resources?.cloudShapeTexture,
    u_cloudOccupancyTexture: () => that._resources?.cloudOccupancyTexture,
    u_cloudOccupancyAllPositive: () =>
      that._resources?.cloudOccupancyAllPositive,
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
    u_cloudHistoryValid: () => that._cloudHistoryValid,
    u_cloudHistoryWeight: () => that._cloudHistoryWeight,
    u_cloudHistoryReprojection: () => that._cloudHistoryReprojection,
    u_cloudPreviousPerspective: () =>
      that._cloudHistorySnapshot.projection === "perspective",
    u_cloudPreviousFrustum: () => that._cloudHistorySnapshot.frustum,
    u_cloudPreviousCameraPosition: () =>
      that._cloudHistorySnapshot.frame.cameraPosition,
    u_cloudCameraDelta: () => that._cloudCameraDelta,
    u_cloudPreviousCameraDirection: () =>
      that._cloudHistorySnapshot.frame.cameraDirection,
    u_cloudPreviousCameraRight: () =>
      that._cloudHistorySnapshot.frame.cameraRight,
    u_cloudPreviousCameraUp: () => that._cloudHistorySnapshot.frame.cameraUp,
    u_cloudPreviousEast: () => that._cloudHistorySnapshot.frame.east,
    u_cloudPreviousNorth: () => that._cloudHistorySnapshot.frame.north,
    u_cloudPreviousCloudOffset: () => that._cloudHistorySnapshot.cloudOffset,
    u_cloudColorTexture: () =>
      that._cloudColorTexture ?? that._resources?.transmittanceTexture,
    u_cloudDistanceTexture: () =>
      that._cloudDistanceTexture ?? that._resources?.transmittanceTexture,
    u_sceneGISCloudShadowAtlas: () =>
      that._globeShadowResources?.outputFramebuffer?.getColorTexture(0) ??
      that._resources?.transmittanceTexture,
    u_sceneGISCloudShadowCurrentTexture: () =>
      that._globeShadowResources?.currentFramebuffer.getColorTexture(0) ??
      that._resources?.transmittanceTexture,
    u_sceneGISCloudShadowDepthVelocityTexture: () =>
      that._globeShadowResources?.currentFramebuffer.getColorTexture(1) ??
      that._resources?.transmittanceTexture,
    u_sceneGISCloudShadowHistoryTexture: () => {
      const shadow = that._globeShadowResources;
      if (!defined(shadow)) {
        return that._resources?.transmittanceTexture;
      }
      return (
        shadow.historyReadIndex === 0
          ? shadow.historyFramebuffer0
          : shadow.historyFramebuffer1
      ).getColorTexture(0);
    },
    u_sceneGISCloudShadowResolution: () =>
      that._globeShadowResources?.resolution ?? 1,
    u_sceneGISCloudShadowHistoryValid: () =>
      that._globeShadowResources?.historyValid ?? false,
    u_sceneGISCloudShadowGridLatticeCompatible: () =>
      shadowGridLatticeCompatible(that),
    u_sceneGISCloudShadowMatrices: () => that._shadowMatrices,
    u_sceneGISCloudShadowPreviousMatrices: () => that._shadowPreviousMatrices,
    u_sceneGISCloudShadowPreviousCloudOffset: () =>
      that._shadowHistorySnapshot.valid
        ? that._shadowHistorySnapshot.cloudOffset
        : that._cloudOffset,
    u_sceneGISCloudShadowInverseMatrices: () => that._shadowInverseMatrices,
    u_sceneGISCloudShadowIntervals: () => that._shadowIntervals,
    u_sceneGISCloudShadowCascadeCount: () => that._shadowCascadeCount,
    u_sceneGISShowCloudShadows: () =>
      that._showClouds &&
      that._owner._showCloudShadows &&
      that._shadowCloudCasterActive,
    u_sceneGISShowCrepuscularRays: () =>
      that._showClouds &&
      that._owner._showCrepuscularRays &&
      that._shadowCloudCasterActive,
    u_sceneGISShadowSurfacePosition: () => that._frame.surfacePosition,
    u_sceneGISShadowEast: () => that._frame.east,
    u_sceneGISShadowNorth: () => that._frame.north,
    u_sceneGISShadowVertical: () => that._frame.vertical,
    u_sceneGISShadowSunDirection: () => that._primaryLightDirection,
    u_sceneGISPrimaryLightScale: () => that._primaryLightScale,
    u_sceneGISShadowCameraPosition: () => that._frame.cameraPosition,
    u_sceneGISCloudShadowCameraRelativePosition: () =>
      that._shadowCameraRelative,
    u_sceneGISShadowCloudTop: () => that._shadowCloudSupport.y,
    u_sceneGISShadowOrigin: () => that._shadowOrigin,
    u_sceneGISShadowOriginDelta: () => that._shadowOriginDelta,
    u_sceneGISShadowCascadeIndex: () => that._shadowCascadeIndex,
    u_sceneGISShadowRayCenter: () =>
      that._shadowCenters[that._shadowCascadeIndex],
    u_sceneGISShadowRayRight: () => that._shadowLightRightWorld,
    u_sceneGISShadowRayUp: () => that._shadowLightUpWorld,
    u_sceneGISShadowRayDirection: () => that._shadowRayDirectionWorld,
    u_sceneGISShadowHalfSize: () =>
      that._shadowHalfSizes[that._shadowCascadeIndex],
    u_sceneGISShadowHalfSizes: () => that._shadowHalfSizes,
    u_sceneGISShadowGridCenter: () =>
      that._shadowGridCenters[that._shadowCascadeIndex],
    u_sceneGISShadowGridCenters: () => that._shadowGridCenters,
    u_sceneGISShadowRayOffset: () => cloudShadowMaximumDistance,
    u_sceneGISShadowFootprint: () => {
      const halfSize = that._shadowHalfSizes[that._shadowCascadeIndex];
      const resolution = that._globeShadowResources?.resolution ?? 1;
      return (Math.max(halfSize.x, halfSize.y) * 2.0) / resolution;
    },
    u_sceneGISShadowSteps: () =>
      cloudQualityProfiles[that._owner._cloudQuality].shadowSteps,
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

SceneGISEnvironmentEffectsRenderer.prototype.prepareGlobeLighting = function (
  frameState,
  time = frameState.time,
) {
  const globe = this._mode === SceneGISAtmosphereReferenceFrame.GLOBE;
  updateFrame(this, this._scene, frameState, time);
  if (!defined(this._resources) || !this._owner._ready) {
    this.releaseGlobeLighting();
    return;
  }
  updateGlobeCloudShadowSupport(this);
  if (!globe) {
    Cartesian3.clone(this._frame.surfacePosition, this._shadowOrigin);
    this._shadowCloudCasterActive =
      this._shadowCloudCasterActive &&
      this._primaryLightDirection.z > 0.0 &&
      Cartesian3.maximumComponent(this._primaryLightScale) > 0.0;
  }
  Cartesian3.subtract(
    this._frame.cameraPosition,
    this._shadowOrigin,
    this._shadowCameraRelative,
  );
  const profile = cloudQualityProfiles[this._owner._cloudQuality];
  const shadow = ensureGlobeShadowResources(
    this,
    frameState.context,
    profile.shadowResolution,
  );
  updateGlobeShadowCascades(this, frameState, profile);
  shadow.historyValid = shadowHistoryContinuous(this);
  Cartesian3.subtract(
    this._shadowOrigin,
    this._shadowHistorySnapshot.shadowOrigin,
    this._shadowOriginDelta,
  );
  shadow.historyWriteIndex = 1 - shadow.historyReadIndex;
  shadow.outputFramebuffer =
    shadow.historyWriteIndex === 0
      ? shadow.historyFramebuffer0
      : shadow.historyFramebuffer1;
  if (!shadow.historyValid) {
    Cartesian3.clone(Cartesian3.ZERO, this._shadowOriginDelta);
    for (let cascade = 0; cascade < 3; cascade++) {
      Matrix4.clone(
        this._shadowMatrices[cascade],
        this._shadowPreviousMatrices[cascade],
      );
    }
  }
  this._skyReflections ??= new SceneGISSkyReflections(this);
  const record = Object.freeze({
    active: true,
    skyReflections: this._skyReflections,
    atlasTexture: shadow.outputFramebuffer.getColorTexture(0),
    transmittanceTexture: this._resources.transmittanceTexture,
    irradianceTexture: this._resources.irradianceTexture,
    matrices: this._shadowMatrices,
    inverseMatrices: this._shadowInverseMatrices,
    intervals: this._shadowIntervals,
    cascadeCount: this._shadowCascadeCount,
    near: this._shadowNear,
    far: this._shadowFar,
    showCloudShadows:
      this._showClouds &&
      this._owner._showCloudShadows &&
      this._shadowCloudCasterActive,
    showCrepuscularRays:
      this._showClouds &&
      this._owner._showCrepuscularRays &&
      this._shadowCloudCasterActive,
    surfaceRadianceScale: this._owner._surfaceRadianceScale,
    surfacePosition: this._frame.surfacePosition,
    east: this._frame.east,
    north: this._frame.north,
    vertical: this._frame.vertical,
    sunDirection: this._sunDirection,
    primaryLightDirection: this._primaryLightDirection,
    primaryLightScale: this._primaryLightScale,
    moonIrradiance: this._moonIrradiance,
    cameraPosition: this._frame.cameraPosition,
    cloudTop: this._shadowCloudSupport.y,
    cameraRelativePosition: this._shadowCameraRelative,
    shadowOrigin: this._shadowOrigin,
  });
  this._globeLightingRecord = record;
  if (globe) {
    frameState._sceneGISGlobeLighting = record;
  } else {
    frameState._sceneGISPlanarLighting = record;
    this._planarLightEnvironment = this._world.environment;
    this._planarLightEnvironment._setAdvancedLight(
      this,
      this._primaryLightState,
    );
  }
};

SceneGISEnvironmentEffectsRenderer.prototype.getPrimaryLightState =
  function () {
    return this._mode === SceneGISAtmosphereReferenceFrame.GLOBE
      ? this._primaryLightState
      : undefined;
  };

SceneGISEnvironmentEffectsRenderer.prototype.releaseGlobeLighting =
  function () {
    if (defined(this._planarLightEnvironment)) {
      this._planarLightEnvironment._clearAdvancedLight(this);
      this._planarLightEnvironment = undefined;
    }
    if (
      defined(this._scene) &&
      this._scene.frameState._sceneGISPlanarLighting ===
        this._globeLightingRecord
    ) {
      this._scene.frameState._sceneGISPlanarLighting = undefined;
    }
    if (
      defined(this._scene) &&
      this._scene.frameState._sceneGISGlobeLighting ===
        this._globeLightingRecord
    ) {
      this._scene.frameState._sceneGISGlobeLighting = undefined;
    }
    this._globeLightingRecord = undefined;
    this._skyReflections = this._skyReflections?.destroy();
    this._shadowCascadeCount = 0;
    this._shadowHistorySnapshot.valid = false;
    destroyGlobeShadowResources(this);
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
  this._cloudHistorySnapshot.valid = false;
  this._cloudHistoryWeight = 0.0;
  this._cloudHistoryStationary = false;
  this._cloudHistoryReprojection = false;
  this._cloudHistoryDiagnostics.stationary = false;
  this._cloudHistoryDiagnostics.mode = "invalid-spatial-only";
  this._cloudHistoryDiagnostics.resetReason = reason;
  this._cloudHistoryDiagnostics.historyValid = false;
  this._cloudHistoryDiagnostics.weight = 0.0;
  this._cloudHistoryPendingResetReason = reason;
};

SceneGISEnvironmentEffectsRenderer.prototype.renderBackground = function (
  frameState,
  passState,
) {
  if (!defined(this._resources)) {
    return;
  }
  if (!this._owner._validateRenderFrame()) {
    return;
  }
  updateFrame(this, this._scene, frameState);
  if (isUnderground(this)) {
    return;
  }
  const record =
    this._mode === SceneGISAtmosphereReferenceFrame.GLOBE
      ? frameState._sceneGISGlobeLighting
      : frameState._sceneGISPlanarLighting;
  if (
    defined(record) &&
    record === this._globeLightingRecord &&
    (record.showCloudShadows || record.showCrepuscularRays)
  ) {
    const shadow = this._globeShadowResources;
    shadow.command.vertexArray = this._resources.vertexArray;
    shadow.resolveCommand.vertexArray = this._resources.vertexArray;
    shadow.clearCommand.framebuffer = shadow.currentFramebuffer.framebuffer;
    shadow.clearCommand.execute(frameState.context, passState);
    shadow.command.framebuffer = shadow.currentFramebuffer.framebuffer;
    if (!defined(this._shadowPassState)) {
      this._shadowPassState = new PassState(frameState.context);
      this._shadowPassState.viewport = new BoundingRectangle();
    }
    const viewport = this._shadowPassState.viewport;
    for (let cascade = 0; cascade < this._shadowCascadeCount; cascade++) {
      this._shadowCascadeIndex = cascade;
      viewport.x = (cascade % 2) * shadow.resolution;
      viewport.y = Math.floor(cascade / 2) * shadow.resolution;
      viewport.width = shadow.resolution;
      viewport.height = shadow.resolution;
      shadow.command.execute(frameState.context, this._shadowPassState);
    }
    viewport.x = 0;
    viewport.y = 0;
    viewport.width = shadow.resolution * 2;
    viewport.height = shadow.resolution * 2;
    shadow.resolveCommand.framebuffer = shadow.outputFramebuffer.framebuffer;
    shadow.resolveCommand.execute(frameState.context, this._shadowPassState);
    shadow.historyReadIndex = shadow.historyWriteIndex;
    shadow.historyValid = true;
    for (let cascade = 0; cascade < 3; cascade++) {
      Matrix4.clone(
        this._shadowMatrices[cascade],
        this._shadowPreviousMatrices[cascade],
      );
    }
    publishShadowHistorySnapshot(this);
  }
  if (this._showAtmosphere) {
    if (this._owner._showStars) {
      updateStarRotation(this, frameState.time);
    }
    this._resources.backgroundCommand.execute(frameState.context, passState);
  }
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
    return;
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
}

function cloudHistoryNumber(value) {
  if (!Number.isFinite(value)) {
    return value;
  }
  const scale = Math.abs(value) <= 1.0 ? 1.0e12 : 1.0e4;
  return Math.round(value * scale) / scale;
}

function createCloudHistorySnapshot() {
  return {
    valid: false,
    mode: undefined,
    projection: undefined,
    width: 0,
    height: 0,
    quality: undefined,
    preset: undefined,
    cloudBaseHeight: 0.0,
    cloudThickness: 0.0,
    cloudCoverage: 0.0,
    cloudDensity: 0.0,
    cloudWindDirection: 0.0,
    cloudWindSpeed: 0.0,
    cloudRadianceScale: 0.0,
    useLogDepth: false,
    cloudTime: 0.0,
    frustum: new Cartesian4(),
    cloudOffset: new Cartesian2(),
    sunDirection: new Cartesian3(),
    primaryLightScale: new Cartesian3(),
    frame: SceneGISAtmosphereReferenceFrame.createSnapshot(),
  };
}

function cloudHistoryLightDirection(renderer) {
  return renderer._primaryLightDirection;
}

function cloudHistoryNumbersEqual(left, right) {
  return cloudHistoryNumber(left) === cloudHistoryNumber(right);
}

function cloudHistoryVectorEqual(left, right) {
  return (
    cloudHistoryNumbersEqual(left.x, right.x) &&
    cloudHistoryNumbersEqual(left.y, right.y) &&
    cloudHistoryNumbersEqual(left.z, right.z)
  );
}

function cloudHistoryVectorFinite(value) {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function cloudHistoryInputsFinite(renderer) {
  const frame = renderer._frame;
  const owner = renderer._owner;
  return (
    Number.isFinite(owner._cloudBaseHeight) &&
    Number.isFinite(owner._cloudThickness) &&
    Number.isFinite(owner._cloudCoverage) &&
    Number.isFinite(owner._cloudDensity) &&
    Number.isFinite(owner._cloudWindDirection) &&
    Number.isFinite(owner._cloudWindSpeed) &&
    Number.isFinite(owner._cloudRadianceScale) &&
    Number.isFinite(owner._cloudTime) &&
    Number.isFinite(frame.altitude) &&
    Number.isFinite(frame.baseHeight) &&
    Number.isFinite(renderer._frustum.x) &&
    Number.isFinite(renderer._frustum.y) &&
    Number.isFinite(renderer._frustum.z) &&
    Number.isFinite(renderer._frustum.w) &&
    cloudHistoryVectorFinite(frame.cameraPosition) &&
    cloudHistoryVectorFinite(frame.cameraDirection) &&
    cloudHistoryVectorFinite(frame.cameraUp) &&
    cloudHistoryVectorFinite(frame.cameraRight) &&
    cloudHistoryVectorFinite(frame.surfacePosition) &&
    cloudHistoryVectorFinite(frame.east) &&
    cloudHistoryVectorFinite(frame.north) &&
    cloudHistoryVectorFinite(frame.vertical) &&
    cloudHistoryVectorFinite(frame.ellipsoidCenter) &&
    cloudHistoryVectorFinite(frame.ellipsoidRadii) &&
    cloudHistoryVectorFinite(cloudHistoryLightDirection(renderer)) &&
    cloudHistoryVectorFinite(renderer._primaryLightScale) &&
    Number.isFinite(renderer._cloudOffset.x) &&
    Number.isFinite(renderer._cloudOffset.y)
  );
}

function cloudHistoryMaterialCompatible(renderer, width, height) {
  const snapshot = renderer._cloudHistorySnapshot;
  const owner = renderer._owner;
  const frame = renderer._frame;
  return (
    snapshot.valid &&
    snapshot.mode === renderer._mode &&
    snapshot.projection === frame.projection &&
    snapshot.width === width &&
    snapshot.height === height &&
    snapshot.quality === owner._cloudQuality &&
    snapshot.preset === owner._cloudPreset &&
    cloudHistoryNumbersEqual(
      snapshot.cloudBaseHeight,
      owner._cloudBaseHeight,
    ) &&
    cloudHistoryNumbersEqual(snapshot.cloudThickness, owner._cloudThickness) &&
    cloudHistoryNumbersEqual(snapshot.cloudCoverage, owner._cloudCoverage) &&
    cloudHistoryNumbersEqual(snapshot.cloudDensity, owner._cloudDensity) &&
    cloudHistoryNumbersEqual(
      snapshot.cloudWindDirection,
      owner._cloudWindDirection,
    ) &&
    cloudHistoryNumbersEqual(snapshot.cloudWindSpeed, owner._cloudWindSpeed) &&
    cloudHistoryNumbersEqual(
      snapshot.cloudRadianceScale,
      owner._cloudRadianceScale,
    ) &&
    snapshot.useLogDepth === renderer._scene.frameState.useLogDepth &&
    snapshot.frame.mode === frame.mode &&
    cloudHistoryNumbersEqual(snapshot.frame.baseHeight, frame.baseHeight) &&
    cloudHistoryVectorEqual(
      snapshot.frame.ellipsoidCenter,
      frame.ellipsoidCenter,
    ) &&
    cloudHistoryVectorEqual(snapshot.frame.ellipsoidRadii, frame.ellipsoidRadii)
  );
}

function cloudHistoryFrustumContinuous(renderer) {
  const previous = renderer._cloudHistorySnapshot.frustum;
  const current = renderer._frustum;
  const horizontalSpan = previous.y - previous.x;
  const verticalSpan = previous.w - previous.z;
  return (
    horizontalSpan > 0.0 &&
    verticalSpan > 0.0 &&
    Math.abs(current.x - previous.x) <=
      horizontalSpan * cloudHistoryMaximumFrustumChange &&
    Math.abs(current.y - previous.y) <=
      horizontalSpan * cloudHistoryMaximumFrustumChange &&
    Math.abs(current.z - previous.z) <=
      verticalSpan * cloudHistoryMaximumFrustumChange &&
    Math.abs(current.w - previous.w) <=
      verticalSpan * cloudHistoryMaximumFrustumChange
  );
}

function cloudHistoryContinuityFailure(renderer, width, height) {
  const previous = renderer._cloudHistorySnapshot;
  const frame = renderer._frame;
  const time = renderer._owner._cloudTime;
  if (!cloudHistoryInputsFinite(renderer)) {
    return "nonfinite-input";
  }
  if (previous.projection !== frame.projection) {
    return "camera-projection";
  }
  if (!cloudHistoryMaterialCompatible(renderer, width, height)) {
    return "structured-compatibility";
  }
  if (!Number.isFinite(time) || Math.abs(time - previous.cloudTime) > 1.0) {
    return "cloud-time";
  }
  if (
    Cartesian3.dot(
      previous.sunDirection,
      cloudHistoryLightDirection(renderer),
    ) < cloudHistoryMinimumSunDot
  ) {
    return "sun-direction";
  }
  if (
    !cloudHistoryVectorEqual(
      previous.primaryLightScale,
      renderer._primaryLightScale,
    )
  ) {
    return "primary-light-energy";
  }
  if (
    Cartesian3.distance(previous.frame.cameraPosition, frame.cameraPosition) >
    cloudHistoryMaximumTranslation
  ) {
    return "camera-translation";
  }
  if (
    Cartesian3.dot(previous.frame.cameraDirection, frame.cameraDirection) <
      cloudHistoryMinimumOrientationDot ||
    Cartesian3.dot(previous.frame.cameraUp, frame.cameraUp) <
      cloudHistoryMinimumOrientationDot
  ) {
    return "camera-orientation";
  }
  if (!cloudHistoryFrustumContinuous(renderer)) {
    return "camera-frustum";
  }
  return undefined;
}

function cloudHistoryStationary(renderer) {
  const previous = renderer._cloudHistorySnapshot;
  const frame = renderer._frame;
  return (
    renderer._owner._cloudTime === previous.cloudTime &&
    renderer._cloudOffset.x === previous.cloudOffset.x &&
    renderer._cloudOffset.y === previous.cloudOffset.y &&
    renderer._frustum.x === previous.frustum.x &&
    renderer._frustum.y === previous.frustum.y &&
    renderer._frustum.z === previous.frustum.z &&
    renderer._frustum.w === previous.frustum.w &&
    cloudHistoryVectorEqual(
      frame.cameraPosition,
      previous.frame.cameraPosition,
    ) &&
    cloudHistoryVectorEqual(
      frame.cameraDirection,
      previous.frame.cameraDirection,
    ) &&
    cloudHistoryVectorEqual(frame.cameraUp, previous.frame.cameraUp) &&
    cloudHistoryVectorEqual(frame.cameraRight, previous.frame.cameraRight) &&
    cloudHistoryVectorEqual(
      cloudHistoryLightDirection(renderer),
      previous.sunDirection,
    ) &&
    cloudHistoryVectorEqual(
      renderer._primaryLightScale,
      previous.primaryLightScale,
    )
  );
}

function commitCloudHistorySnapshot(renderer, width, height) {
  const snapshot = renderer._cloudHistorySnapshot;
  const frame = renderer._frame;
  const owner = renderer._owner;
  snapshot.valid = true;
  snapshot.mode = renderer._mode;
  snapshot.projection = frame.projection;
  snapshot.width = width;
  snapshot.height = height;
  snapshot.quality = owner._cloudQuality;
  snapshot.preset = owner._cloudPreset;
  snapshot.cloudBaseHeight = owner._cloudBaseHeight;
  snapshot.cloudThickness = owner._cloudThickness;
  snapshot.cloudCoverage = owner._cloudCoverage;
  snapshot.cloudDensity = owner._cloudDensity;
  snapshot.cloudWindDirection = owner._cloudWindDirection;
  snapshot.cloudWindSpeed = owner._cloudWindSpeed;
  snapshot.cloudRadianceScale = owner._cloudRadianceScale;
  snapshot.useLogDepth = renderer._scene.frameState.useLogDepth;
  snapshot.cloudTime = owner._cloudTime;
  Cartesian4.clone(renderer._frustum, snapshot.frustum);
  Cartesian2.clone(renderer._cloudOffset, snapshot.cloudOffset);
  Cartesian3.clone(cloudHistoryLightDirection(renderer), snapshot.sunDirection);
  Cartesian3.clone(renderer._primaryLightScale, snapshot.primaryLightScale);
  snapshot.frame.mode = frame.mode;
  snapshot.frame.projection = frame.projection;
  snapshot.frame.altitude = frame.altitude;
  snapshot.frame.baseHeight = frame.baseHeight;
  Cartesian3.clone(frame.cameraPosition, snapshot.frame.cameraPosition);
  Cartesian3.clone(frame.cameraDirection, snapshot.frame.cameraDirection);
  Cartesian3.clone(frame.cameraUp, snapshot.frame.cameraUp);
  Cartesian3.clone(frame.cameraRight, snapshot.frame.cameraRight);
  Cartesian3.clone(frame.surfacePosition, snapshot.frame.surfacePosition);
  Cartesian3.clone(frame.east, snapshot.frame.east);
  Cartesian3.clone(frame.north, snapshot.frame.north);
  Cartesian3.clone(frame.vertical, snapshot.frame.vertical);
  Cartesian3.clone(frame.ellipsoidCenter, snapshot.frame.ellipsoidCenter);
  Cartesian3.clone(frame.ellipsoidRadii, snapshot.frame.ellipsoidRadii);
}

function cloudHistoryFailureIsCameraCut(reason) {
  return (
    reason === "nonfinite-input" ||
    reason === "cloud-time" ||
    reason === "sun-direction" ||
    reason === "camera-projection" ||
    reason === "camera-translation" ||
    reason === "camera-orientation" ||
    reason === "camera-frustum"
  );
}

function executeCloudResolve(renderer, context, depthTexture) {
  const width = depthTexture.width;
  const height = depthTexture.height;
  ensureCloudHistoryFramebuffers(renderer, context, width, height);
  const previousValid = renderer._cloudHistoryValid;
  const failure = previousValid
    ? cloudHistoryContinuityFailure(renderer, width, height)
    : (renderer._cloudHistoryPendingResetReason ?? "invalid-history");
  renderer._cloudHistoryValid = previousValid && !defined(failure);
  renderer._cloudHistoryStationary =
    renderer._cloudHistoryValid && cloudHistoryStationary(renderer);
  renderer._cloudHistoryWeight = renderer._cloudHistoryValid
    ? renderer._cloudHistoryStationary
      ? 0.9
      : 0.82
    : 0.0;
  renderer._cloudHistoryReprojection =
    renderer._cloudHistoryValid && !renderer._cloudHistoryStationary;
  // Subtract in CPU double precision before publishing large Planar motion.
  Cartesian3.subtract(
    renderer._frame.cameraPosition,
    renderer._cloudHistorySnapshot.frame.cameraPosition,
    renderer._cloudCameraDelta,
  );
  renderer._cloudHistoryDiagnostics.stationary =
    renderer._cloudHistoryStationary;
  renderer._cloudHistoryDiagnostics.mode = !renderer._cloudHistoryValid
    ? previousValid && cloudHistoryFailureIsCameraCut(failure)
      ? "camera-cut-spatial-only"
      : "invalid-spatial-only"
    : renderer._cloudHistoryStationary
      ? "exact-stationary-temporal"
      : renderer._cloudHistoryReprojection
        ? "continuous-reprojected"
        : "continuous-same-uv";
  if (!renderer._cloudHistoryValid) {
    renderer._cloudHistoryDiagnostics.resetReason = failure;
  }
  renderer._cloudHistoryDiagnostics.historyValid = renderer._cloudHistoryValid;
  renderer._cloudHistoryDiagnostics.weight = renderer._cloudHistoryWeight;
  const spatialOnly = !renderer._cloudHistoryValid;
  const writeIndex = spatialOnly ? 0 : 1 - renderer._cloudHistoryReadIndex;
  const readIndex = spatialOnly ? 1 : renderer._cloudHistoryReadIndex;
  const read =
    readIndex === 0
      ? renderer._resources.cloudHistoryFramebuffer0
      : renderer._resources.cloudHistoryFramebuffer1;
  const write =
    writeIndex === 0
      ? renderer._resources.cloudHistoryFramebuffer0
      : renderer._resources.cloudHistoryFramebuffer1;
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
  commitCloudHistorySnapshot(renderer, width, height);
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
  const scale =
    renderer._mode === SceneGISAtmosphereReferenceFrame.GLOBE
      ? (profile.globeScale ?? profile.scale)
      : profile.scale;
  const width = Math.max(1, Math.ceil(depthTexture.width * scale));
  const height = Math.max(1, Math.ceil(depthTexture.height * scale));
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

function updateSunViewportCoordinates(renderer) {
  renderer._sunLensVisible = false;
  renderer._sunViewportCoordinates.x = 0.5;
  renderer._sunViewportCoordinates.y = 0.5;
  if (
    !renderer._perspective ||
    (renderer._mode === SceneGISAtmosphereReferenceFrame.PLANAR &&
      renderer._sunDirection.z <= 0.0)
  ) {
    return;
  }
  const forward = Cartesian3.dot(
    renderer._sunDirection,
    renderer._frame.cameraDirection,
  );
  if (!(forward > 0.0)) {
    return;
  }
  const planeX =
    Cartesian3.dot(renderer._sunDirection, renderer._frame.cameraRight) /
    forward;
  const planeY =
    Cartesian3.dot(renderer._sunDirection, renderer._frame.cameraUp) / forward;
  const width = renderer._frustum.y - renderer._frustum.x;
  const height = renderer._frustum.w - renderer._frustum.z;
  if (!(width > 0.0) || !(height > 0.0)) {
    return;
  }
  const x = (planeX - renderer._frustum.x) / width;
  const y = (planeY - renderer._frustum.z) / height;
  renderer._sunViewportCoordinates.x = Math.min(Math.max(x, 0.0), 1.0);
  renderer._sunViewportCoordinates.y = Math.min(Math.max(y, 0.0), 1.0);
  renderer._sunLensVisible = x >= 0.0 && x <= 1.0 && y >= 0.0 && y <= 1.0;
}

function updateBloomPassState(passState, context, width, height) {
  if (!defined(passState)) {
    passState = new PassState(context);
    passState.viewport = new BoundingRectangle();
  }
  passState.viewport.x = 0;
  passState.viewport.y = 0;
  passState.viewport.width = width;
  passState.viewport.height = height;
  return passState;
}

function executeBloom(renderer, context, colorTexture, depthTexture) {
  const resources = ensureBloomResources(
    renderer,
    context,
    colorTexture.width,
    colorTexture.height,
  );
  renderer._bloomHalfPassState = updateBloomPassState(
    renderer._bloomHalfPassState,
    context,
    resources.halfWidth,
    resources.halfHeight,
  );
  renderer._bloomFullPassState = updateBloomPassState(
    renderer._bloomFullPassState,
    context,
    resources.width,
    resources.height,
  );
  renderer._inputColorTexture = colorTexture;
  renderer._depthTexture = depthTexture;
  updateSunViewportCoordinates(renderer);
  try {
    resources.thresholdCommand.framebuffer =
      resources.thresholdFramebuffer.framebuffer;
    resources.thresholdCommand.execute(context, renderer._bloomHalfPassState);

    for (let octave = 0; octave < 3; ++octave) {
      // Equal covariance to the Globe 1/2/4 schedule, with six evenly spaced
      // axes to avoid a square finite-support footprint around the Planar Sun.
      const planar = renderer._mode === SceneGISAtmosphereReferenceFrame.PLANAR;
      const radius = planar ? Math.sqrt(7.0) : 2 ** octave;
      const angle = planar ? (octave * Math.PI) / 6.0 : 0.0;
      const offsetX = radius * Math.cos(angle);
      const offsetY = radius * Math.sin(angle);
      renderer._bloomTexture =
        resources.thresholdFramebuffer.getColorTexture(0);
      renderer._bloomDirection.x = offsetX;
      renderer._bloomDirection.y = offsetY;
      resources.horizontalBlurCommand.framebuffer =
        resources.blurFramebuffer.framebuffer;
      resources.horizontalBlurCommand.execute(
        context,
        renderer._bloomHalfPassState,
      );

      renderer._bloomTexture = resources.blurFramebuffer.getColorTexture(0);
      renderer._bloomDirection.x = -offsetY;
      renderer._bloomDirection.y = offsetX;
      resources.verticalBlurCommand.framebuffer =
        resources.thresholdFramebuffer.framebuffer;
      resources.verticalBlurCommand.execute(
        context,
        renderer._bloomHalfPassState,
      );
    }

    renderer._bloomTexture = resources.thresholdFramebuffer.getColorTexture(0);
    resources.compositeCommand.framebuffer =
      resources.compositeFramebuffer.framebuffer;
    resources.compositeCommand.execute(context, renderer._bloomFullPassState);
    return resources.compositeFramebuffer.getColorTexture(0);
  } finally {
    renderer._inputColorTexture = undefined;
    renderer._depthTexture = undefined;
    renderer._bloomTexture = undefined;
  }
}

SceneGISEnvironmentEffectsRenderer.prototype.executeHdr = function (
  context,
  colorTexture,
  depthTexture,
  idTexture,
) {
  const bloomActive = this._owner._showBloom || this._owner._showLensFlare;
  if (
    (!this._showAerialPerspective &&
      !this._showHeightFog &&
      !this._showClouds &&
      !bloomActive) ||
    !defined(this._resources)
  ) {
    return colorTexture;
  }
  if (!this._owner._validateRenderFrame()) {
    return colorTexture;
  }
  updateFrame(this, this._scene, this._scene.frameState);
  this._hasCurrentGlobeDepth =
    this._mode !== SceneGISAtmosphereReferenceFrame.GLOBE ||
    this._currentFrameDepthAvailable;
  if (isUnderground(this)) {
    return colorTexture;
  }
  void idTexture;
  let cloudPassExecuted;
  let hdrTexture;
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
    return bloomActive
      ? executeBloom(this, context, colorTexture, depthTexture)
      : colorTexture;
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
  hdrTexture = framebuffer.getColorTexture(0);
  if (bloomActive) {
    try {
      hdrTexture = executeBloom(this, context, hdrTexture, depthTexture);
    } finally {
      this._inputColorTexture = undefined;
      this._depthTexture = undefined;
      this._bloomTexture = undefined;
    }
  }
  return hdrTexture;
};

SceneGISEnvironmentEffectsRenderer.prototype.releaseResources = function () {
  this.releaseGlobeLighting();
  destroyResources(this._resources);
  destroyBloomResources(this._bloomResources);
  this._resources = undefined;
  this._bloomResources = undefined;
};

SceneGISEnvironmentEffectsRenderer.prototype.destroy = function () {
  this.releaseResources();
  return SceneGISEnvironmentEffectsPipeline.prototype.destroy.call(this);
};

export default SceneGISEnvironmentEffectsRenderer;
export { createProgram as createEnvironmentEffectsProgramForSpecs };
