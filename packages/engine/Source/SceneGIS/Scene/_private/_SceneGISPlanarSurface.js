import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Pass from "../../../Renderer/Pass.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import Texture from "../../../Renderer/Texture.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import SceneGISPlanarImagery from "./_SceneGISPlanarImagery.js";
import SceneGISPlanarEnvironmentLighting from "./_SceneGISPlanarEnvironmentLighting.js";
import SceneGISPlanarQuadtree from "./_SceneGISPlanarQuadtree.js";
import SceneGISPlanarSurfaceShader from "./_SceneGISPlanarSurfaceShader.js";
import SceneGISPlanarTerrain from "./_SceneGISPlanarTerrain.js";
import SceneGISPlanarTerrainQuery from "./_SceneGISPlanarTerrainQuery.js";

const unitQuad = new Float32Array([
  -0.5, -0.5, 0.0, 0.5, -0.5, 0.0, -0.5, 0.5, 0.0, 0.5, 0.5, 0.0,
]);
const scratchTileCoordinates = new Cartesian2();

/**
 * Owns planar tile selection and shared rendering resources.
 *
 * @alias SceneGISPlanarSurface
 * @constructor
 * @private
 *
 * @param {SceneGISPlanarTilingScheme} tilingScheme The canonical tiling scheme.
 */
function SceneGISPlanarSurface(tilingScheme, imageryLayers) {
  this._quadtree = new SceneGISPlanarQuadtree(tilingScheme);
  this._imageryLayers = imageryLayers;
  this._imagery = new SceneGISPlanarImagery(imageryLayers, (callback) =>
    this._quadtree.forEachTile(callback),
  );
  this._terrain = undefined;
  imageryLayers._changeListener = (type, layer, property) => {
    if (
      type === "removed" ||
      (type === "changed" && property === "show" && !layer.show)
    ) {
      this._renderCommands.length = 0;
      this._imagery.releaseLayer(layer);
    }
  };
  this._context = undefined;
  this._vertexArray = undefined;
  this._shaderProgram = undefined;
  this._shaderPrograms = new Map();
  this._materialShaderSources = new Map();
  this._publishedMaterial = undefined;
  this._publishedMaterialSource = undefined;
  this._transparentTexture = undefined;
  this._renderState = undefined;
  this._baseColor = undefined;
  this._lambertDiffuseMultiplier = 0.9;
  this._environmentLighting = undefined;
  this._frameNumber = -1;
  this._renderedFrameNumber = -1;
  this._renderCommands = [];
  this._terrainQuerySnapshot = [];
  this._terrainQuerySnapshotCount = 0;
  this._shownLayers = [];
  this._tilesLoaded = true;
  this._destroyed = false;
  this._unitQuad = unitQuad;
  this._debug = {
    createdBuffers: 0,
    createdVertexArrays: 0,
    createdShaders: 0,
    createdTextures: 0,
    createdCommands: 0,
    submittedCommands: 0,
    depthSubmittedCommands: 0,
    pickSubmittedCommands: 0,
    destroyedVertexArrays: 0,
    destroyedBuffers: 0,
    destroyedShaders: 0,
    destroyedTextures: 0,
  };
}

Object.defineProperties(SceneGISPlanarSurface.prototype, {
  tilesLoaded: {
    get: function () {
      return this._tilesLoaded;
    },
  },
});

SceneGISPlanarSurface.prototype.setTerrainProvider = function (
  provider,
  geometricErrors,
) {
  this._renderCommands.length = 0;
  this.invalidateTerrainQuerySnapshot();
  if (!defined(provider)) {
    this._terrain?.destroy();
    this._terrain = undefined;
    this._quadtree.setHeightRange(0.0, 0.0);
    this._tilesLoaded = this._imagery.tilesLoaded;
    return;
  }
  if (!defined(this._terrain)) {
    this._terrain = new SceneGISPlanarTerrain(
      (callback) => this._quadtree.forEachTile(callback),
      (x, y, level) => this._quadtree.getOrCreateTile(x, y, level),
    );
  }
  this._terrain.setProvider(provider, geometricErrors);
  this._quadtree.setHeightRange(
    Math.min(0.0, provider.minimumHeight),
    Math.max(0.0, provider.maximumHeight),
  );
  this._tilesLoaded = false;
};

SceneGISPlanarSurface.prototype.invalidateTerrainQuerySnapshot = function () {
  for (let i = 0; i < this._terrainQuerySnapshotCount; ++i) {
    const entry = this._terrainQuerySnapshot[i];
    if (!defined(entry)) {
      continue;
    }
    entry.tile = undefined;
    entry.content = undefined;
    entry.mesh = undefined;
    entry.source = undefined;
    entry.revision = undefined;
    entry.key = undefined;
  }
  this._terrainQuerySnapshotCount = 0;
};

SceneGISPlanarSurface.prototype.getTerrainHeight = function (
  position,
  maximumLevel,
) {
  for (let level = maximumLevel; level >= 0; --level) {
    const coordinates = this._quadtree._tilingScheme.positionToTileXY(
      position,
      level,
      scratchTileCoordinates,
    );
    if (!defined(coordinates)) {
      return undefined;
    }
    const tile = this._quadtree.getTile(coordinates.x, coordinates.y, level);
    const content = tile?.terrainEntry?.activeContent;
    if (defined(content?.mesh) && content.source !== "FLAT") {
      return SceneGISPlanarTerrainQuery.getHeight(
        tile,
        content,
        position.x,
        position.y,
      );
    }
  }
  return undefined;
};

SceneGISPlanarSurface.prototype.pickTerrain = function (ray, result) {
  return SceneGISPlanarTerrainQuery.pick(
    this._terrainQuerySnapshot,
    this._terrainQuerySnapshotCount,
    ray,
    result,
  );
};

function validateContext(surface, context) {
  if (defined(surface._context) && surface._context !== context) {
    throw new DeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );
  }
}

function createResources(surface, context, layerCount) {
  validateContext(surface, context);
  if (defined(surface._vertexArray)) {
    return;
  }

  surface._context = context;
  const vertexBuffer = Buffer.createVertexBuffer({
    context,
    typedArray: unitQuad,
    usage: BufferUsage.STATIC_DRAW,
  });
  ++surface._debug.createdBuffers;
  surface._vertexArray = new VertexArray({
    context,
    attributes: [
      {
        index: 0,
        vertexBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
      },
    ],
  });
  ++surface._debug.createdVertexArrays;
  surface._renderState = RenderState.fromCache({
    cull: { enabled: false },
    depthTest: { enabled: true },
    depthMask: true,
  });
  if (layerCount > 0) {
    surface._transparentTexture = new Texture({
      context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      source: { arrayBufferView: new Uint8Array([0, 0, 0, 0]) },
    });
    ++surface._debug.createdTextures;
  }
}

function getShaderProgram(
  surface,
  context,
  layerCount,
  enableLighting,
  normalMode,
  materialSource,
  advancedLighting,
) {
  const key = getShaderKey(
    layerCount,
    enableLighting,
    normalMode,
    materialSource,
    advancedLighting,
  );
  let shader = surface._shaderPrograms.get(key);
  if (!shader) {
    shader = createShaderProgram(
      context,
      layerCount,
      enableLighting,
      normalMode,
      materialSource,
      advancedLighting,
    );
    surface._shaderPrograms.set(key, shader);
    if (defined(materialSource)) {
      surface._materialShaderSources.set(key, materialSource);
    }
    ++surface._debug.createdShaders;
  }
  surface._shaderProgram = shader;
  return shader;
}

function getShaderKey(
  layerCount,
  enableLighting,
  normalMode,
  materialSource,
  advancedLighting,
) {
  const materialKey = defined(materialSource)
    ? `/material/${materialSource}`
    : "";
  return `${layerCount}/${enableLighting ? 1 : 0}/${normalMode}/${advancedLighting ? 1 : 0}${materialKey}`;
}

function createShaderProgram(
  context,
  layerCount,
  enableLighting,
  normalMode,
  materialSource,
  advancedLighting,
) {
  return ShaderProgram.fromCache({
    context,
    vertexShaderSource: SceneGISPlanarSurfaceShader.createVertexShader(
      enableLighting,
      normalMode,
      defined(materialSource),
      advancedLighting,
    ),
    fragmentShaderSource: SceneGISPlanarSurfaceShader.createFragmentShader(
      layerCount,
      enableLighting,
      normalMode,
      materialSource,
      advancedLighting,
    ),
    attributeLocations:
      normalMode === "smooth" ? { position: 0, normal: 1 } : { position: 0 },
  });
}

function preflightMaterialShaders(
  surface,
  context,
  layerCount,
  enableLighting,
  materialSource,
  advancedLighting,
) {
  if (!defined(materialSource)) {
    return;
  }
  const candidates = [];
  try {
    for (const normalMode of ["geometric", "smooth"]) {
      const key = getShaderKey(
        layerCount,
        enableLighting,
        normalMode,
        materialSource,
        advancedLighting,
      );
      if (surface._shaderPrograms.has(key)) {
        continue;
      }
      const shader = createShaderProgram(
        context,
        layerCount,
        enableLighting,
        normalMode,
        materialSource,
        advancedLighting,
      );
      candidates.push({ key, shader });
      shader._bind();
    }
  } catch (error) {
    for (const candidate of candidates) {
      candidate.shader.destroy();
    }
    throw error;
  }
  for (const candidate of candidates) {
    surface._shaderPrograms.set(candidate.key, candidate.shader);
    surface._materialShaderSources.set(candidate.key, materialSource);
    ++surface._debug.createdShaders;
  }
}

function createUniformMap(
  surface,
  tile,
  layerCount,
  enableLighting,
  material,
  advancedLighting,
) {
  const uniformMap = {
    u_color: function () {
      return surface._baseColor;
    },
  };
  if (advancedLighting) {
    Object.assign(
      uniformMap,
      SceneGISPlanarEnvironmentLighting.createUniformMap(
        () => surface._environmentLighting,
      ),
    );
  } else if (enableLighting) {
    uniformMap.u_lambertDiffuseMultiplier = function () {
      return surface._lambertDiffuseMultiplier;
    };
  }
  for (let i = 0; i < layerCount; ++i) {
    uniformMap[`u_texture${i}`] = function () {
      return tile._imagerySlots[i].texture;
    };
    uniformMap[`u_translationScale${i}`] = function () {
      return tile._imagerySlots[i].translationScale;
    };
    uniformMap[`u_alpha${i}`] = function () {
      return tile._imagerySlots[i].alpha;
    };
    for (const name of [
      "brightness",
      "contrast",
      "hue",
      "saturation",
      "gamma",
      "colorToAlphaThreshold",
    ]) {
      uniformMap[`u_${name}${i}`] = function () {
        return tile._imagerySlots[i][name];
      };
    }
    uniformMap[`u_colorToAlpha${i}`] = function () {
      return tile._imagerySlots[i].colorToAlpha;
    };
  }
  if (defined(material)) {
    Object.assign(uniformMap, material._uniforms);
  }
  return uniformMap;
}

function getCommand(
  surface,
  tile,
  layerCount,
  enableLighting,
  material,
  advancedLighting,
) {
  const terrainContent = tile.terrainEntry?.activeContent;
  const terrainReady = defined(terrainContent?.mesh);
  const needsNormal = enableLighting || advancedLighting || defined(material);
  const normalMode = needsNormal
    ? terrainReady
      ? "smooth"
      : "geometric"
    : "unlit";
  const materialSource = material?.shaderSource;
  const shaderProgram = getShaderProgram(
    surface,
    surface._context,
    layerCount,
    enableLighting,
    normalMode,
    materialSource,
    advancedLighting,
  );
  if (!defined(tile.command)) {
    tile.command = new DrawCommand({
      boundingVolume: tile.commandBoundingVolume,
      modelMatrix: tile.modelMatrix,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      vertexArray: surface._vertexArray,
      count: 4,
      shaderProgram,
      uniformMap: createUniformMap(
        surface,
        tile,
        layerCount,
        enableLighting,
        material,
        advancedLighting,
      ),
      renderState: surface._renderState,
      pass: Pass.GLOBE,
      owner: surface,
      castShadows: false,
      receiveShadows: false,
    });
    tile._imageryCommandLayerCount = layerCount;
    tile._lightingCommandEnabled = enableLighting;
    tile._lightingCommandNormalMode = normalMode;
    tile._materialCommand = material;
    tile._materialCommandSource = materialSource;
    ++surface._debug.createdCommands;
  } else if (
    tile._imageryCommandLayerCount !== layerCount ||
    tile._lightingCommandEnabled !== enableLighting ||
    tile._lightingCommandNormalMode !== normalMode ||
    tile._materialCommand !== material ||
    tile._materialCommandSource !== materialSource ||
    tile.command.shaderProgram !== shaderProgram
  ) {
    if (tile.command.shaderProgram !== shaderProgram) {
      // HDR can be disabled while the base shader changes. Drop dormant
      // derived commands so re-enabling HDR cannot replay old uniforms.
      tile.command.derivedCommands = {};
      tile.command.shaderProgram = shaderProgram;
    }
    tile.command.uniformMap = createUniformMap(
      surface,
      tile,
      layerCount,
      enableLighting,
      material,
      advancedLighting,
    );
    tile._imageryCommandLayerCount = layerCount;
    tile._lightingCommandEnabled = enableLighting;
    tile._lightingCommandNormalMode = normalMode;
    tile._materialCommand = material;
    tile._materialCommandSource = materialSource;
  }
  tile.command.boundingVolume = tile.commandBoundingVolume;
  tile.command.modelMatrix = tile.modelMatrix;
  tile.command.primitiveType = terrainReady
    ? PrimitiveType.TRIANGLES
    : PrimitiveType.TRIANGLE_STRIP;
  tile.command.vertexArray = terrainReady
    ? terrainContent.vertexArray
    : surface._vertexArray;
  tile.command.count = terrainReady ? terrainContent.mesh.indexCount : 4;
  return tile.command;
}

function countMaterialSamplers(shaderSource) {
  const samplers = new Set();
  const sourceWithoutComments = shaderSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const declaration =
    /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler(?:2D|Cube)\s+([A-Za-z_]\w*)/g;
  let match;
  while ((match = declaration.exec(sourceWithoutComments)) !== null) {
    samplers.add(match[1]);
  }
  return samplers.size;
}

function releaseStaleMaterialShaders(surface, materialSource) {
  for (const [key, source] of surface._materialShaderSources) {
    if (source === materialSource) {
      continue;
    }
    const shader = surface._shaderPrograms.get(key);
    if (defined(shader) && !shader.isDestroyed()) {
      shader.destroy();
      ++surface._debug.destroyedShaders;
    }
    surface._quadtree.forEachTile((tile) => {
      if (tile.command?.shaderProgram === shader) {
        tile._materialCommandSource = undefined;
      }
    });
    surface._shaderPrograms.delete(key);
    surface._materialShaderSources.delete(key);
  }
}

function getShownLayers(surface) {
  const result = surface._shownLayers;
  result.length = 0;
  const collection = surface._imageryLayers;
  for (let i = 0; i < collection.length; ++i) {
    const layer = collection.get(i);
    if (layer.show) {
      result.push(layer);
    }
  }
  return result;
}

function getShownLayerCount(surface) {
  let count = 0;
  const collection = surface._imageryLayers;
  for (let i = 0; i < collection.length; ++i) {
    count += collection.get(i).show ? 1 : 0;
  }
  return count;
}

function updateTileSlots(surface, tile, layers) {
  if (layers.length === 0) {
    if (defined(tile._imagerySlots)) {
      tile._imagerySlots.length = 0;
    }
    return;
  }
  const slots = (tile._imagerySlots ??= []);
  slots.length = layers.length;
  for (let i = 0; i < layers.length; ++i) {
    const layer = layers[i];
    const binding = tile.imageryBindings.get(layer);
    const selected = binding.selected;
    let slot = slots[i];
    if (!slot) {
      slot = slots[i] = { colorToAlpha: new Cartesian4() };
    }
    slot.texture = selected?.texture ?? surface._transparentTexture;
    slot.translationScale = binding.translationScale;
    slot.alpha = layer.alpha;
    slot.brightness = layer.brightness;
    slot.contrast = layer.contrast;
    slot.hue = layer.hue;
    slot.saturation = layer.saturation;
    slot.gamma = layer.gamma;
    const target = layer._colorToAlpha;
    slot.colorToAlpha.x = target?.red ?? 0.0;
    slot.colorToAlpha.y = target?.green ?? 0.0;
    slot.colorToAlpha.z = target?.blue ?? 0.0;
    slot.colorToAlpha.w = defined(target) ? 1.0 : 0.0;
    slot.colorToAlphaThreshold = layer.colorToAlphaThreshold;
  }
}

SceneGISPlanarSurface.prototype.beginFrame = function (frameState) {
  validateContext(this, frameState.context);
  if (this._frameNumber === frameState.frameNumber) {
    return;
  }
  this._frameNumber = frameState.frameNumber;
  this._renderedFrameNumber = -1;
  this._debug.submittedCommands = 0;
  this._quadtree.beginFrame(frameState.frameNumber);
};

SceneGISPlanarSurface.prototype.render = function (
  frameState,
  maximumLevel,
  maximumScreenSpaceError,
  baseColor,
  enableLighting = false,
  lambertDiffuseMultiplier = 0.9,
  material,
  maximumTiltedTileDistance = Infinity,
) {
  validateContext(this, frameState.context);
  const passes = frameState.passes;
  const pickReplay = passes.pick && !passes.render;
  if (pickReplay) {
    if (
      frameState.context.drawingBufferWidth === 0 ||
      frameState.context.drawingBufferHeight === 0
    ) {
      return;
    }
    for (const command of this._renderCommands) {
      frameState.commandList.push(command);
      if (passes.depth) {
        ++this._debug.depthSubmittedCommands;
      } else {
        ++this._debug.pickSubmittedCommands;
      }
    }
    return;
  }
  if (!passes.render || this._renderedFrameNumber === frameState.frameNumber) {
    return;
  }
  if (
    frameState.context.drawingBufferWidth === 0 ||
    frameState.context.drawingBufferHeight === 0
  ) {
    this.invalidateTerrainQuerySnapshot();
    this._tilesLoaded = true;
    return;
  }
  if (defined(material) && material.isDestroyed()) {
    throw new DeveloperError(
      "SceneGISPlanarWorld.material must be an undestroyed Material.",
    );
  }
  const materialSamplerCount = defined(material)
    ? countMaterialSamplers(material.shaderSource)
    : 0;
  const shownLayerCount = getShownLayerCount(this);
  const environmentLighting = frameState._sceneGISPlanarLighting;
  const advancedLighting = environmentLighting?.active === true;
  const lightingSamplerCount = advancedLighting ? 3 : 0;
  if (
    shownLayerCount + materialSamplerCount + lightingSamplerCount >
    ContextLimits.maximumTextureImageUnits
  ) {
    throw new DeveloperError(
      "The combined planar imagery, Material and environment sampler count exceeds maximumTextureImageUnits.",
    );
  }
  if (defined(material)) {
    material.update(frameState.context);
    preflightMaterialShaders(
      this,
      frameState.context,
      shownLayerCount,
      enableLighting,
      material.shaderSource,
      advancedLighting,
    );
  }
  const shownLayers = getShownLayers(this);
  this.invalidateTerrainQuerySnapshot();
  this._renderedFrameNumber = frameState.frameNumber;
  this._renderCommands.length = 0;
  this._baseColor = baseColor;
  this._lambertDiffuseMultiplier = lambertDiffuseMultiplier;
  this._environmentLighting = environmentLighting;
  const desiredTiles = this._quadtree.selectTiles(
    frameState,
    maximumLevel,
    maximumScreenSpaceError,
    this._terrain?.geometricErrors,
    maximumTiltedTileDistance,
  );
  if (desiredTiles.length === 0) {
    this._tilesLoaded = true;
    return;
  }
  createResources(this, frameState.context, shownLayers.length);
  if (shownLayers.length > 0 && !defined(this._transparentTexture)) {
    this._transparentTexture = new Texture({
      context: frameState.context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      source: { arrayBufferView: new Uint8Array([0, 0, 0, 0]) },
    });
    ++this._debug.createdTextures;
  }
  const loadTiles = this._quadtree.getLoadTiles();
  this._terrain?.prepare(
    frameState.context,
    loadTiles,
    desiredTiles,
    frameState.frameNumber,
  );
  const tiles = this._quadtree.resolveRenderTiles((tile) =>
    defined(this._terrain) ? this._terrain.isRenderable(tile) : true,
  );
  this._imagery.prepare(
    frameState.context,
    tiles,
    shownLayers,
    frameState.frameNumber,
  );
  this._tilesLoaded =
    (!defined(this._terrain) || this._terrain.tilesLoaded) &&
    (shownLayers.length === 0 || this._imagery.tilesLoaded);
  const terrainProvider = this._terrain?.provider;
  if (defined(terrainProvider?.credit)) {
    frameState.creditDisplay.addCreditToNextFrame(terrainProvider.credit);
  }
  for (const layer of shownLayers) {
    if (defined(layer.imageryProvider.credit)) {
      frameState.creditDisplay.addCreditToNextFrame(
        layer.imageryProvider.credit,
      );
    }
  }
  for (const tile of tiles) {
    const terrainData = tile.terrainEntry?.activeContent?.terrainData;
    if (defined(terrainData?.credits)) {
      for (const credit of terrainData.credits) {
        frameState.creditDisplay.addCreditToNextFrame(credit);
      }
    }
    updateTileSlots(this, tile, shownLayers);
    const command = getCommand(
      this,
      tile,
      shownLayers.length,
      enableLighting,
      material,
      advancedLighting,
    );
    frameState.commandList.push(command);
    this._renderCommands.push(command);
    ++this._debug.submittedCommands;
  }
  if (defined(this._terrain)) {
    const snapshot = this._terrainQuerySnapshot;
    let count = 0;
    for (const tile of tiles) {
      const content = tile.terrainEntry?.activeContent;
      if (!defined(content)) {
        continue;
      }
      const entry = (snapshot[count] ??= {});
      entry.tile = tile;
      entry.content = content;
      entry.mesh = content.mesh;
      entry.source = content.source;
      entry.revision = content.revision;
      entry.key = tile.key;
      ++count;
    }
    this._terrainQuerySnapshotCount = count;
  }
  this._publishedMaterial = material;
  this._publishedMaterialSource = material?.shaderSource;
  releaseStaleMaterialShaders(this, this._publishedMaterialSource);
};

SceneGISPlanarSurface.prototype.endFrame = function (tileCacheSize) {
  this._quadtree.trim(tileCacheSize);
};

SceneGISPlanarSurface.prototype.isDestroyed = function () {
  return this._destroyed;
};

SceneGISPlanarSurface.prototype.destroy = function () {
  if (this._destroyed) {
    return;
  }
  this._imageryLayers._changeListener = undefined;
  this._terrain?.destroy();
  this._terrain = undefined;
  this._imagery.destroy();
  this._quadtree.destroy();
  if (defined(this._vertexArray) && !this._vertexArray.isDestroyed()) {
    this._vertexArray.destroy();
    ++this._debug.destroyedVertexArrays;
    ++this._debug.destroyedBuffers;
  }
  for (const shader of this._shaderPrograms.values()) {
    if (!shader.isDestroyed()) {
      shader.destroy();
      ++this._debug.destroyedShaders;
    }
  }
  if (
    defined(this._transparentTexture) &&
    !this._transparentTexture.isDestroyed()
  ) {
    this._transparentTexture.destroy();
    ++this._debug.destroyedTextures;
  }
  this._vertexArray = undefined;
  this._shaderProgram = undefined;
  this._shaderPrograms.clear();
  this._materialShaderSources.clear();
  this._publishedMaterial = undefined;
  this._publishedMaterialSource = undefined;
  this._transparentTexture = undefined;
  this._renderState = undefined;
  this._renderCommands.length = 0;
  this._terrainQuerySnapshot.length = 0;
  this._terrainQuerySnapshotCount = 0;
  this._context = undefined;
  this._destroyed = true;
};

export default SceneGISPlanarSurface;
