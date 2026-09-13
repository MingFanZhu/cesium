import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import GeometryInstance from "../../../Core/GeometryInstance.js";
import GeometryPipeline from "../../../Core/GeometryPipeline.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";
import destroyObject from "../../../Core/destroyObject.js";
import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import polylineCommon from "../../../Shaders/PolylineCommon.js";
import flatFragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileFlatFS.js";
import flatVertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileFlatVS.js";
import circleVertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileCircleVS.js";
import lineVertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileLineVS.js";

function repeatedColor(bytes, count) {
  const values = new Uint8Array(count * 4);
  for (let i = 0; i < values.length; i += 4) {
    values.set(bytes, i);
  }
  return new GeometryAttribute({
    componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
    componentsPerAttribute: 4,
    normalize: true,
    values,
  });
}

function prepare(resources, context, instances, owner, allowPicking) {
  const identities = new Map();
  const copies = instances.map((instance) => {
    const input = instance.geometry;
    const count = input.attributes.position.values.length / 3;
    const attributes = {
      ...input.attributes,
      color: repeatedColor(instance.attributes.color.value, count),
    };
    if (allowPicking) {
      let pick = identities.get(instance.id);
      if (pick === undefined) {
        pick = context.createPickId({ primitive: owner, id: instance.id });
        identities.set(instance.id, pick);
        resources._pickIds.push(pick);
      }
      attributes.pickColor = repeatedColor(pick.color.toBytes(), count);
    }
    return new GeometryInstance({
      geometry: new Geometry({
        attributes,
        indices: input.indices,
        primitiveType: input.primitiveType,
        boundingSphere: input.boundingSphere,
      }),
    });
  });
  const result = [];
  for (const geometry of GeometryPipeline.combineInstances(copies)) {
    for (const name of Object.keys(geometry.attributes)) {
      if (
        geometry.attributes[name].componentDatatype === ComponentDatatype.DOUBLE
      ) {
        GeometryPipeline.encodeAttribute(
          geometry,
          name,
          `${name}3DHigh`,
          `${name}3DLow`,
        );
      }
    }
    if (context.elementIndexUint) {
      result.push(geometry);
    } else {
      result.push(...GeometryPipeline.fitToUnsignedShortIndices(geometry));
    }
  }
  return result;
}

function createVertexArray(context, geometry, locations) {
  const buffers = [];
  let indexBuffer;
  try {
    const attributes = [];
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const buffer = Buffer.createVertexBuffer({
        context,
        typedArray: attribute.values,
        usage: BufferUsage.STATIC_DRAW,
      });
      buffers.push(buffer);
      attributes.push({
        index: locations[name],
        vertexBuffer: buffer,
        componentDatatype: attribute.componentDatatype,
        componentsPerAttribute: attribute.componentsPerAttribute,
        normalize: attribute.normalize,
      });
    }
    indexBuffer = Buffer.createIndexBuffer({
      context,
      typedArray: geometry.indices,
      usage: BufferUsage.STATIC_DRAW,
      indexDatatype:
        geometry.indices instanceof Uint32Array
          ? IndexDatatype.UNSIGNED_INT
          : IndexDatatype.UNSIGNED_SHORT,
    });
    return new VertexArray({ context, attributes, indexBuffer });
  } catch (error) {
    for (const buffer of buffers) {
      buffer.destroy();
    }
    indexBuffer?.destroy();
    throw error;
  }
}

/**
 * Owns one map batch's GPU buffers, cached shader reference, and feature pick IDs.
 * Does not depend on Scene Primitive, Appearance, BatchTable, or scene update hooks.
 * @private
 */
function SceneGISVectorTileBatchResources(
  context,
  prepared,
  owner,
  allowPicking,
) {
  this._vertexArrays = [];
  this._pickIds = [];
  this._shaderProgram = undefined;
  try {
    const geometries = prepare(
      this,
      context,
      prepared.instances,
      owner,
      allowPicking,
    );
    const locations = GeometryPipeline.createAttributeLocations(geometries[0]);
    for (const geometry of geometries) {
      this._vertexArrays.push(createVertexArray(context, geometry, locations));
    }
    const defines = allowPicking ? ["SCENEGIS_VECTOR_PICKING"] : [];
    if (prepared.kind === "circle") {
      defines.push("SCENEGIS_VECTOR_CIRCLE");
    }
    const sources =
      prepared.kind === "line"
        ? [polylineCommon, lineVertex]
        : [prepared.kind === "circle" ? circleVertex : flatVertex];
    this._shaderProgram = ShaderProgram.fromCache({
      context,
      vertexShaderSource: new ShaderSource({ defines, sources }),
      fragmentShaderSource: new ShaderSource({
        defines,
        sources: [flatFragment],
      }),
      attributeLocations: locations,
    });
    // Compile before the caller replaces the last published batch.
    this._shaderProgram._bind();
  } catch (error) {
    this.destroy();
    throw error;
  }
}

SceneGISVectorTileBatchResources.prototype.isDestroyed = function () {
  return false;
};

SceneGISVectorTileBatchResources.prototype.destroy = function () {
  for (const vertexArray of this._vertexArrays) {
    vertexArray.destroy();
  }
  this._vertexArrays.length = 0;
  this._shaderProgram?.destroy();
  for (const pick of this._pickIds) {
    pick.destroy();
  }
  this._pickIds.length = 0;
  return destroyObject(this);
};

export default SceneGISVectorTileBatchResources;
