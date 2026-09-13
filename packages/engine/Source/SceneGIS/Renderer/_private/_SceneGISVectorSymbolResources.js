import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import vertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorSymbolVS.js";
import fragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorSymbolFS.js";

const sizes = [3, 3, 2, 2, 4, 4, 3, 4];
const names = [
  "anchorHigh",
  "anchorLow",
  "offset",
  "uv",
  "color",
  "haloColor",
  "parameters",
  "pickColor",
];
const stride = sizes.reduce((sum, size) => sum + size, 0);

/** Owns a dynamic non-indexed symbol batch. Atlas and pick IDs are borrowed. @private */
function SceneGISVectorSymbolResources(context, values) {
  this.vertexArray = undefined;
  this.shader = undefined;
  this._buffer = undefined;
  this.capacity = values.length;
  try {
    this._buffer = Buffer.createVertexBuffer({
      context,
      typedArray: values,
      usage: BufferUsage.DYNAMIC_DRAW,
    });
    let offset = 0;
    const attributes = sizes.map((size, index) => {
      const result = {
        index,
        vertexBuffer: this._buffer,
        componentsPerAttribute: size,
        componentDatatype: ComponentDatatype.FLOAT,
        offsetInBytes: offset * 4,
        strideInBytes: stride * 4,
      };
      offset += size;
      return result;
    });
    this.vertexArray = new VertexArray({ context, attributes });
    this.shader = ShaderProgram.fromCache({
      context,
      vertexShaderSource: vertex,
      fragmentShaderSource: fragment,
      attributeLocations: Object.fromEntries(names.map((name, i) => [name, i])),
    });
    this.shader._bind();
  } catch (error) {
    this.destroy();
    throw error;
  }
}
SceneGISVectorSymbolResources.prototype.update = function (values) {
  this._buffer.copyFromArrayView(values);
};
SceneGISVectorSymbolResources.prototype.destroy = function () {
  if (this.vertexArray) {
    this.vertexArray.destroy();
  } else {
    this._buffer?.destroy();
  }
  this.vertexArray = undefined;
  this._buffer = undefined;
  this.shader?.destroy();
  this.shader = undefined;
};
SceneGISVectorSymbolResources.stride = stride;
export default SceneGISVectorSymbolResources;
