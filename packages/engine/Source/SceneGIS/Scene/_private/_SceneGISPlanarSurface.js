import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Pass from "../../../Renderer/Pass.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import SceneGISPlanarQuadtree from "./_SceneGISPlanarQuadtree.js";

const planarVertexShader = `
in vec3 position;

void main()
{
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}
`;

const planarFragmentShader = `
uniform vec4 u_color;

void main()
{
    out_FragColor = u_color;
}
`;

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
function SceneGISPlanarSurface(tilingScheme) {
  this._quadtree = new SceneGISPlanarQuadtree(tilingScheme);
  this._context = undefined;
  this._vertexArray = undefined;
  this._shaderProgram = undefined;
  this._renderState = undefined;
  this._baseColor = undefined;
  this._frameNumber = -1;
  this._renderedFrameNumber = -1;
  this._destroyed = false;
  this._unitQuad = unitQuad;
  this._debug = {
    createdBuffers: 0,
    createdVertexArrays: 0,
    createdShaders: 0,
    createdCommands: 0,
    submittedCommands: 0,
    destroyedVertexArrays: 0,
    destroyedBuffers: 0,
    destroyedShaders: 0,
  };
}

function validateContext(surface, context) {
  if (defined(surface._context) && surface._context !== context) {
    throw new DeveloperError(
      "SceneGISPlanarWorld cannot render with more than one Context.",
    );
  }
}

function createResources(surface, context) {
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
  surface._shaderProgram = ShaderProgram.fromCache({
    context,
    vertexShaderSource: planarVertexShader,
    fragmentShaderSource: planarFragmentShader,
    attributeLocations: { position: 0 },
  });
  ++surface._debug.createdShaders;
  surface._renderState = RenderState.fromCache({
    cull: { enabled: false },
    depthTest: { enabled: true },
    depthMask: true,
  });
}

function getCommand(surface, tile) {
  if (!defined(tile.command)) {
    tile.command = new DrawCommand({
      boundingVolume: tile.boundingVolume,
      modelMatrix: tile.modelMatrix,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      vertexArray: surface._vertexArray,
      count: 4,
      shaderProgram: surface._shaderProgram,
      uniformMap: {
        u_color: function () {
          return surface._baseColor;
        },
      },
      renderState: surface._renderState,
      pass: Pass.OPAQUE,
      owner: surface,
      castShadows: false,
      receiveShadows: false,
    });
    ++surface._debug.createdCommands;
  }
  return tile.command;
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
  if (
    !frameState.passes.render ||
    frameState.context.drawingBufferWidth === 0 ||
    frameState.context.drawingBufferHeight === 0 ||
    this._renderedFrameNumber === frameState.frameNumber
  ) {
    return;
  }
  this._renderedFrameNumber = frameState.frameNumber;
  this._baseColor = baseColor;
  const tiles = this._quadtree.selectTiles(
    frameState,
    maximumLevel,
    maximumScreenSpaceError,
  );
  if (tiles.length === 0) {
    return;
  }
  createResources(this, frameState.context);
  for (const tile of tiles) {
    frameState.commandList.push(getCommand(this, tile));
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
  this._quadtree.destroy();
  if (defined(this._vertexArray) && !this._vertexArray.isDestroyed()) {
    this._vertexArray.destroy();
    ++this._debug.destroyedVertexArrays;
    ++this._debug.destroyedBuffers;
  }
  if (defined(this._shaderProgram) && !this._shaderProgram.isDestroyed()) {
    this._shaderProgram.destroy();
    ++this._debug.destroyedShaders;
  }
  this._vertexArray = undefined;
  this._shaderProgram = undefined;
  this._renderState = undefined;
  this._context = undefined;
  this._destroyed = true;
};

export default SceneGISPlanarSurface;
