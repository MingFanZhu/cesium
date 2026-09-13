import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import vertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorSymbolVS.js";
import fragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorSymbolFS.js";

const staticStride = 14;
const dynamicStride = 12;
const attributes = [
  ["anchorHigh", 3, false, 0],
  ["anchorLow", 3, false, 3],
  ["offset", 2, false, 6],
  ["uv", 2, true, 0],
  ["color", 4, true, 2],
  ["haloColor", 4, true, 6],
  ["parameters", 4, false, 8],
  ["pickColor", 4, true, 10],
];

/** Owns independent static and dynamic symbol streams. Atlas and picks are borrowed. @private */
function SceneGISVectorSymbolResources(context, staticValues, dynamicValues) {
  this.capacity = staticValues.length / staticStride;
  this.staticUploads = 0;
  this.dynamicUploads = 0;
  this.uploadedBytes = staticValues.byteLength + dynamicValues.byteLength;
  try {
    this._staticBuffer = Buffer.createVertexBuffer({
      context,
      typedArray: staticValues,
      usage: BufferUsage.STATIC_DRAW,
    });
    this._dynamicBuffer = Buffer.createVertexBuffer({
      context,
      typedArray: dynamicValues,
      usage: BufferUsage.DYNAMIC_DRAW,
    });
    this.vertexArray = new VertexArray({
      context,
      attributes: attributes.map(([, size, fixed, offset], index) => ({
        index,
        vertexBuffer: fixed ? this._staticBuffer : this._dynamicBuffer,
        componentsPerAttribute: size,
        componentDatatype: ComponentDatatype.FLOAT,
        offsetInBytes: offset * 4,
        strideInBytes: (fixed ? staticStride : dynamicStride) * 4,
      })),
    });
    this.shader = ShaderProgram.fromCache({
      context,
      vertexShaderSource: vertex,
      fragmentShaderSource: fragment,
      attributeLocations: Object.fromEntries(
        attributes.map(([name], index) => [name, index]),
      ),
    });
    this.shader._bind();
  } catch (error) {
    this.destroy();
    throw error;
  }
}
SceneGISVectorSymbolResources.prototype.update = function (
  fixed,
  values,
  start,
  end,
) {
  if (end <= start) {
    return;
  }
  (fixed ? this._staticBuffer : this._dynamicBuffer).copyFromArrayView(
    values.subarray(start, end),
    start * 4,
  );
  this[fixed ? "staticUploads" : "dynamicUploads"]++;
  this.uploadedBytes += (end - start) * 4;
};
SceneGISVectorSymbolResources.prototype.destroy = function () {
  if (this.vertexArray) {
    this.vertexArray.destroy();
  } else {
    this._staticBuffer?.destroy();
    this._dynamicBuffer?.destroy();
  }
  this.vertexArray = undefined;
  this._staticBuffer = undefined;
  this._dynamicBuffer = undefined;
  this.shader?.destroy();
  this.shader = undefined;
};
SceneGISVectorSymbolResources.staticStride = staticStride;
SceneGISVectorSymbolResources.dynamicStride = dynamicStride;
export default SceneGISVectorSymbolResources;
