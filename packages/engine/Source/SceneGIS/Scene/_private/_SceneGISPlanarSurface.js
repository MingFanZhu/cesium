import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
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
import SceneGISPlanarQuadtree from "./_SceneGISPlanarQuadtree.js";
import SceneGISPlanarSurfaceShader from "./_SceneGISPlanarSurfaceShader.js";

const unitQuad = new Float32Array([
  -0.5, -0.5, 0.0, 0.5, -0.5, 0.0, -0.5, 0.5, 0.0, 0.5, 0.5, 0.0,
]);

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
  imageryLayers._changeListener = (type, layer) => {
    if (type === "removed" || (type === "changed" && !layer.show)) {
      this._renderCommands.length = 0;
      this._imagery.releaseLayer(layer);
    }
  };
  this._context = undefined;
  this._vertexArray = undefined;
  this._shaderProgram = undefined;
  this._shaderPrograms = new Map();
  this._transparentTexture = undefined;
  this._renderState = undefined;
  this._baseColor = undefined;
  this._frameNumber = -1;
  this._renderedFrameNumber = -1;
  this._renderCommands = [];
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

function getShaderProgram(surface, context, layerCount) {
  let shader = surface._shaderPrograms.get(layerCount);
  if (!shader) {
    shader = ShaderProgram.fromCache({
      context,
      vertexShaderSource: SceneGISPlanarSurfaceShader.vertexShader,
      fragmentShaderSource:
        SceneGISPlanarSurfaceShader.createFragmentShader(layerCount),
      attributeLocations: { position: 0 },
    });
    surface._shaderPrograms.set(layerCount, shader);
    ++surface._debug.createdShaders;
  }
  surface._shaderProgram = shader;
  return shader;
}

function createUniformMap(surface, tile, layerCount) {
  const uniformMap = {
    u_color: function () {
      return surface._baseColor;
    },
  };
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
  }
  return uniformMap;
}

function getCommand(surface, tile, layerCount) {
  const shaderProgram = getShaderProgram(surface, surface._context, layerCount);
  if (!defined(tile.command)) {
    tile.command = new DrawCommand({
      boundingVolume: tile.commandBoundingVolume,
      modelMatrix: tile.modelMatrix,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      vertexArray: surface._vertexArray,
      count: 4,
      shaderProgram,
      uniformMap: createUniformMap(surface, tile, layerCount),
      renderState: surface._renderState,
      pass: Pass.OPAQUE,
      owner: surface,
      castShadows: false,
      receiveShadows: false,
    });
    tile._imageryCommandLayerCount = layerCount;
    ++surface._debug.createdCommands;
  } else if (tile._imageryCommandLayerCount !== layerCount) {
    tile.command.shaderProgram = shaderProgram;
    tile.command.uniformMap = createUniformMap(surface, tile, layerCount);
    tile._imageryCommandLayerCount = layerCount;
  }
  return tile.command;
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
      slot = slots[i] = {};
    }
    slot.texture = selected?.texture ?? surface._transparentTexture;
    slot.translationScale = binding.translationScale;
    slot.alpha = layer.alpha;
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
) {
  validateContext(this, frameState.context);
  const passes = frameState.passes;
  const depthPick = passes.pick && passes.depth && !passes.render;
  if (depthPick) {
    if (
      frameState.context.drawingBufferWidth === 0 ||
      frameState.context.drawingBufferHeight === 0
    ) {
      return;
    }
    for (const command of this._renderCommands) {
      frameState.commandList.push(command);
      ++this._debug.depthSubmittedCommands;
    }
    return;
  }
  if (!passes.render || this._renderedFrameNumber === frameState.frameNumber) {
    return;
  }
  const shownLayers = getShownLayers(this);
  if (shownLayers.length > ContextLimits.maximumTextureImageUnits) {
    throw new DeveloperError(
      "The number of shown planar imagery layers exceeds maximumTextureImageUnits.",
    );
  }
  this._renderedFrameNumber = frameState.frameNumber;
  this._renderCommands.length = 0;
  if (
    frameState.context.drawingBufferWidth === 0 ||
    frameState.context.drawingBufferHeight === 0
  ) {
    this._tilesLoaded = true;
    return;
  }
  this._baseColor = baseColor;
  const tiles = this._quadtree.selectTiles(
    frameState,
    maximumLevel,
    maximumScreenSpaceError,
  );
  if (tiles.length === 0) {
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
  this._imagery.prepare(
    frameState.context,
    tiles,
    shownLayers,
    frameState.frameNumber,
  );
  this._tilesLoaded = shownLayers.length === 0 || this._imagery.tilesLoaded;
  for (const layer of shownLayers) {
    if (defined(layer.imageryProvider.credit)) {
      frameState.creditDisplay.addCreditToNextFrame(
        layer.imageryProvider.credit,
      );
    }
  }
  for (const tile of tiles) {
    updateTileSlots(this, tile, shownLayers);
    const command = getCommand(this, tile, shownLayers.length);
    frameState.commandList.push(command);
    this._renderCommands.push(command);
    ++this._debug.submittedCommands;
  }
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
  this._transparentTexture = undefined;
  this._renderState = undefined;
  this._renderCommands.length = 0;
  this._context = undefined;
  this._destroyed = true;
};

export default SceneGISPlanarSurface;
