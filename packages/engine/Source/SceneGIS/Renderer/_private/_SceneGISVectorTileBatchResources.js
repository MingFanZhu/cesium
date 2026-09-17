import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Color from "../../../Core/Color.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
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
import ContextLimits from "../../../Renderer/ContextLimits.js";
import Texture from "../../../Renderer/Texture.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";
import flatFragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileFlatFS.js";
import flatVertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileFlatVS.js";
import circleVertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileCircleVS.js";
import lineVertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileLineVS.js";
import GroundResources from "./_SceneGISVectorGroundResources.js";
import anchorVisibility from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorAnchorVisibility.js";
import extrusionVertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorExtrusionVS.js";
import extrusionFragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorExtrusionFS.js";
import patternFragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorPattern.js";

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

function createVertexArray(
  context,
  geometry,
  locations,
  resources,
  uniformPaint,
  terrainAnchors,
) {
  const buffers = [];
  let indexBuffer;
  try {
    const attributes = [];
    const constantIndices = {};
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      if (name === "extrusionData") {
        resources._extrusionData.push(attribute.values);
        continue;
      }
      if (uniformPaint && (name === "color" || name === "linePaint")) {
        constantIndices[name] = attributes.length;
        attributes.push({ index: locations[name], value: [0, 0, 0, 0] });
        continue;
      }
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
      if (
        terrainAnchors &&
        (name === "position3DHigh" || name === "position3DLow")
      ) {
        resources._anchorBuffers.push({
          name,
          buffer,
          values: attribute.values,
        });
      }
      if (name === "vectorAnchor") {
        resources._anchorCoordinates.push(attribute.values);
      }
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
    const vertexArray = new VertexArray({ context, attributes, indexBuffer });
    if (uniformPaint) {
      resources._paintAttributes.push({
        color: vertexArray.getAttribute(constantIndices.color).value,
        dimensions:
          constantIndices.linePaint === undefined
            ? undefined
            : vertexArray.getAttribute(constantIndices.linePaint).value,
      });
    }
    return vertexArray;
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
  geometryCache,
) {
  if (prepared.ground) {
    return new GroundResources(
      context,
      prepared,
      owner,
      allowPicking,
      geometryCache,
    );
  }
  this._vertexArrays = [];
  this._pickIds = [];
  this._shaderProgram = undefined;
  this._dashTexture = undefined;
  this._dashSize = undefined;
  this._paintAttributes = [];
  this._paintPrefix = prepared.kind;
  this._anchorBuffers = [];
  this._anchorCoordinates = [];
  this._extrusionData = [];
  try {
    const geometries =
      prepared.geometries ??
      prepare(this, context, prepared.instances, owner, allowPicking);
    if (prepared.geometries && allowPicking) {
      const colors = new Uint32Array(prepared.identities.length);
      const bytes = new Uint8Array(colors.buffer);
      for (let i = 0; i < prepared.identities.length; i++) {
        const identity = prepared.identities[i];
        Object.freeze(identity.properties);
        Object.freeze(identity.tile);
        Object.freeze(identity);
        const pick = context.createPickId({
          primitive: owner,
          id: identity,
        });
        this._pickIds.push(pick);
        bytes.set(pick.color.toBytes(), i * 4);
      }
      for (const geometry of geometries) {
        const values = geometry.attributes.pickColor.values;
        const tokens = new Uint32Array(
          values.buffer,
          values.byteOffset,
          values.length / 4,
        );
        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i] >= colors.length) {
            throw new RuntimeError("Invalid vector feature pick token.");
          }
          tokens[i] = colors[tokens[i]];
        }
      }
    }
    const locations = GeometryPipeline.createAttributeLocations(geometries[0]);
    for (const geometry of geometries) {
      this._vertexArrays.push(
        createVertexArray(
          context,
          geometry,
          locations,
          this,
          prepared.uniformPaint,
          (owner._ground && prepared.kind === "circle") ||
            prepared.kind === "fill-extrusion",
        ),
      );
    }
    if (prepared.uniformPaint) {
      this.updatePaint(prepared.uniformPaint);
    }
    const defines = allowPicking ? ["SCENEGIS_VECTOR_PICKING"] : [];
    if (prepared.pattern) {
      defines.push("SCENEGIS_VECTOR_PATTERN");
    }
    if (owner._globe) {
      defines.push("SCENEGIS_VECTOR_GLOBE");
    }
    if (prepared.kind === "line") {
      defines.push("SCENEGIS_VECTOR_LINE");
    } else if (
      prepared.fringe ??
      prepared.instances?.[0].geometry.attributes.fringe !== undefined
    ) {
      defines.push("SCENEGIS_VECTOR_FRINGE");
    }
    if (prepared.dashIntervals?.length > 0) {
      const count = prepared.dashIntervals.length / 4;
      const limit = ContextLimits.maximumTextureSize;
      if (
        !context.floatingPointTexture ||
        count > Math.min(limit * limit, 16777216)
      ) {
        throw new RuntimeError(
          "Vector dash data exceeds this Context's float texture capacity.",
        );
      }
      const width = Math.min(limit, Math.ceil(Math.sqrt(count)));
      const height = Math.ceil(count / width);
      const values = new Float32Array(width * height * 4);
      values.set(prepared.dashIntervals);
      this._dashTexture = new Texture({
        context,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.FLOAT,
        flipY: false,
        sampler: new Sampler({
          minificationFilter: TextureMinificationFilter.NEAREST,
          magnificationFilter: TextureMagnificationFilter.NEAREST,
        }),
        source: { width, height, arrayBufferView: values },
      });
      this._dashSize = new Cartesian2(width, height);
      defines.push("SCENEGIS_VECTOR_DASH");
    }
    if (prepared.kind === "circle") {
      defines.push("SCENEGIS_VECTOR_CIRCLE");
      if (owner._ground) {
        defines.push("SCENEGIS_VECTOR_TERRAIN_ANCHOR");
      }
    }
    const sources =
      prepared.kind === "fill-extrusion"
        ? [extrusionVertex]
        : prepared.kind === "line"
          ? [lineVertex]
          : [prepared.kind === "circle" ? circleVertex : flatVertex];
    if (owner._ground && prepared.kind === "circle") {
      sources.unshift(anchorVisibility);
    }
    this._shaderProgram = ShaderProgram.fromCache({
      context,
      vertexShaderSource: new ShaderSource({ defines, sources }),
      fragmentShaderSource: new ShaderSource({
        defines,
        sources: [
          patternFragment,
          prepared.kind === "fill-extrusion" ? extrusionFragment : flatFragment,
        ],
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

SceneGISVectorTileBatchResources.prototype.updatePaint = function (paint) {
  const prefix = this._paintPrefix;
  const color = paint[`${prefix}-color`];
  for (const attribute of this._paintAttributes) {
    // Match the existing normalized byte color exactly, including alpha picking.
    attribute.color[0] = Color.floatToByte(color.red) / 255;
    attribute.color[1] = Color.floatToByte(color.green) / 255;
    attribute.color[2] = Color.floatToByte(color.blue) / 255;
    attribute.color[3] =
      Color.floatToByte(color.alpha * paint[`${prefix}-opacity`]) / 255;
    if (!attribute.dimensions) {
      continue;
    }
    attribute.dimensions[0] = paint["line-width"];
    attribute.dimensions[1] = paint["line-gap-width"];
    attribute.dimensions[2] = paint["line-offset"];
    attribute.dimensions[3] = paint["line-blur"];
  }
};

SceneGISVectorTileBatchResources.prototype.destroy = function () {
  for (const vertexArray of this._vertexArrays) {
    vertexArray.destroy();
  }
  this._vertexArrays.length = 0;
  this._shaderProgram?.destroy();
  this._dashTexture?.destroy();
  for (const pick of this._pickIds) {
    pick.destroy();
  }
  this._pickIds.length = 0;
  this._paintAttributes.length = 0;
  this._anchorBuffers.length = 0;
  this._anchorCoordinates.length = 0;
  this._extrusionData.length = 0;
  return destroyObject(this);
};

export default SceneGISVectorTileBatchResources;
