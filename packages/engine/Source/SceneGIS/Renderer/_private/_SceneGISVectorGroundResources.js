import Cartesian4 from "../../../Core/Cartesian4.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Color from "../../../Core/Color.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import destroyObject from "../../../Core/destroyObject.js";
import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import common from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorGroundCommon.js";
import vertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorGroundVS.js";
import fragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorGroundFS.js";
import coverage from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileFlatFS.js";
import globeCommon from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorGlobeCommon.js";
import globeVertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorGlobeVS.js";
import patternFragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorPattern.js";

function table(resources, context, data, name) {
  const count = Math.max(1, data.length / 4);
  const limit = ContextLimits.maximumTextureSize;
  if (count > limit * limit) {
    throw new RuntimeError(
      "Vector ground data exceeds the Context texture capacity.",
    );
  }
  const width = Math.min(limit, Math.ceil(Math.sqrt(count)));
  const height = Math.ceil(count / width);
  const values = new data.constructor(width * height * 4);
  values.set(data);
  const texture = new Texture({
    context,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype:
      data instanceof Uint8Array
        ? PixelDatatype.UNSIGNED_BYTE
        : PixelDatatype.FLOAT,
    flipY: false,
    sampler: new Sampler({
      minificationFilter: TextureMinificationFilter.NEAREST,
      magnificationFilter: TextureMagnificationFilter.NEAREST,
    }),
    source: { width, height, arrayBufferView: values },
  });
  resources._textures.push(texture);
  const size = new Cartesian2(width, height);
  resources.uniformMap[`u_sceneGISGround${name}`] = () => texture;
  const sizeName = {
    Data: "Data",
    Picks: "Pick",
    Dash: "Dash",
  }[name];
  resources.uniformMap[`u_sceneGISGround${sizeName}Size`] = () => size;
  return { texture, size };
}

/** Owns batched convex volumes and numeric geometry tables; no terrain mesh dependency. @private */
function SceneGISVectorGroundResources(
  context,
  prepared,
  owner,
  allowPicking,
  geometryCache,
) {
  this._vertexArrays = [];
  this._textures = [];
  this._pickIds = [];
  this._shaderProgram = undefined;
  this._paintPrefix = prepared.kind;
  this._color = new Cartesian4();
  this._paint = new Cartesian4();
  this._geometryCache = geometryCache;
  this._geometry = undefined;
  this._context = context;
  this._terrainShaderProgram = undefined;
  this.uniformMap = {
    u_sceneGISGroundColor: () => this._color,
    u_sceneGISGroundPaint: () => this._paint,
  };
  this.instanceCount = prepared.ground.triangles.length / 4;
  try {
    if (
      !context.webgl2 ||
      !context.floatingPointTexture ||
      !context.depthTexture
    ) {
      throw new RuntimeError(
        "Vector terrain rendering requires WebGL2, float textures and depth textures.",
      );
    }
    const { vertices, triangles, frames } = prepared.ground;
    const globe = frames !== undefined;
    const triangleOffset = vertices.length;
    const frameOffset = triangleOffset + triangles.length;
    const data = new Float32Array(frameOffset + (frames?.length ?? 0));
    data.set(vertices);
    data.set(triangles, triangleOffset);
    if (globe) {
      data.set(frames, frameOffset);
    }
    table(this, context, data, "Data");
    const offsets = new Cartesian2(triangleOffset / 4, frameOffset / 4);
    this.uniformMap.u_sceneGISGroundOffsets = () => offsets;
    const colors = new Uint8Array(Math.max(1, prepared.identities.length) * 4);
    if (allowPicking) {
      for (let i = 0; i < prepared.identities.length; i++) {
        const identity = prepared.identities[i];
        Object.freeze(identity.properties);
        Object.freeze(identity.tile);
        Object.freeze(identity);
        const pick = context.createPickId({ primitive: owner, id: identity });
        this._pickIds.push(pick);
        colors.set(pick.color.toBytes(), i * 4);
      }
    }
    table(this, context, colors, "Picks");
    this._geometryKey = globe;
    let geometry = geometryCache.get(globe);
    if (!geometry) {
      // Instance one outward-facing volume per triangle: a planar prism or Globe box.
      const buffer = Buffer.createVertexBuffer({
        context,
        typedArray: Float32Array.from({ length: globe ? 8 : 24 }, (_, i) => i),
        usage: BufferUsage.STATIC_DRAW,
      });
      let indexBuffer;
      try {
        if (globe) {
          indexBuffer = Buffer.createIndexBuffer({
            context,
            typedArray: new Uint16Array([
              0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 1, 3, 5, 3,
              7, 5, 3, 2, 7, 2, 6, 7, 2, 0, 6, 0, 4, 6,
            ]),
            indexDatatype: IndexDatatype.UNSIGNED_SHORT,
            usage: BufferUsage.STATIC_DRAW,
          });
        }
        const vertexArray = new VertexArray({
          context,
          indexBuffer,
          attributes: [
            {
              index: 0,
              vertexBuffer: buffer,
              componentDatatype: ComponentDatatype.FLOAT,
              componentsPerAttribute: 1,
            },
          ],
        });
        geometry = { vertexArray, references: 0 };
        geometryCache.set(globe, geometry);
      } catch (error) {
        indexBuffer?.destroy();
        buffer.destroy();
        throw error;
      }
    }
    geometry.references++;
    this._geometry = geometry;
    this._vertexArrays.push(geometry.vertexArray);
    const defines = ["SCENEGIS_VECTOR_GROUND"];
    if (prepared.pattern) {
      defines.push("SCENEGIS_VECTOR_PATTERN");
    }
    if (globe) {
      defines.push("SCENEGIS_VECTOR_GLOBE");
    }
    if (allowPicking) {
      defines.push("SCENEGIS_VECTOR_PICKING");
    }
    if (prepared.fringe) {
      defines.push("SCENEGIS_VECTOR_FRINGE");
    }
    if (prepared.kind === "line") {
      defines.push("SCENEGIS_VECTOR_LINE");
    }
    if (prepared.uniformPaint) {
      defines.push("SCENEGIS_VECTOR_UNIFORM_PAINT");
      this.updatePaint(prepared.uniformPaint);
    }
    if (prepared.dashIntervals?.length) {
      const dash = table(this, context, prepared.dashIntervals, "Dash");
      this._dashTexture = dash.texture;
      this._dashSize = dash.size;
      defines.push("SCENEGIS_VECTOR_DASH");
    }
    this._shaderProgram = ShaderProgram.fromCache({
      context,
      vertexShaderSource: new ShaderSource({
        defines: globe ? [...defines, "SCENEGIS_VECTOR_GLOBE_VERTEX"] : defines,
        sources: globe ? [common, globeCommon, globeVertex] : [common, vertex],
      }),
      fragmentShaderSource: new ShaderSource({
        defines,
        sources: globe
          ? [common, globeCommon, patternFragment, coverage, fragment]
          : [common, patternFragment, coverage, fragment],
      }),
      attributeLocations: { prismVertex: 0 },
    });
    this._shaderProgram._bind();
  } catch (error) {
    this.destroy();
    throw error;
  }
}

SceneGISVectorGroundResources.prototype.getShaderProgram = function (terrain) {
  if (!terrain) {
    return this._shaderProgram;
  }
  if (!this._terrainShaderProgram) {
    const vs = this._shaderProgram.vertexShaderSource.clone();
    const fs = this._shaderProgram.fragmentShaderSource.clone();
    vs.defines.push("SCENEGIS_VECTOR_GLOBE_TERRAIN");
    fs.defines.push("SCENEGIS_VECTOR_GLOBE_TERRAIN");
    this._terrainShaderProgram = ShaderProgram.fromCache({
      context: this._context,
      vertexShaderSource: vs,
      fragmentShaderSource: fs,
      attributeLocations: { prismVertex: 0 },
    });
    this._terrainShaderProgram._bind();
  }
  return this._terrainShaderProgram;
};

SceneGISVectorGroundResources.prototype.updatePaint = function (paint) {
  const color = paint[`${this._paintPrefix}-color`];
  if (!color) {
    return;
  }
  this._color.x = Color.floatToByte(color.red) / 255;
  this._color.y = Color.floatToByte(color.green) / 255;
  this._color.z = Color.floatToByte(color.blue) / 255;
  this._color.w =
    Color.floatToByte(color.alpha * paint[`${this._paintPrefix}-opacity`]) /
    255;
  this._paint.x = paint["line-width"] ?? 0;
  this._paint.y = paint["line-gap-width"] ?? 0;
  this._paint.z = paint["line-offset"] ?? 0;
  this._paint.w = paint["line-blur"] ?? 0;
};
SceneGISVectorGroundResources.prototype.isDestroyed = function () {
  return false;
};
SceneGISVectorGroundResources.prototype.destroy = function () {
  if (this._geometry && --this._geometry.references === 0) {
    this._geometry.vertexArray.destroy();
    this._geometryCache.delete(this._geometryKey);
  }
  this._geometry = undefined;
  for (const texture of this._textures) {
    texture.destroy();
  }
  for (const pick of this._pickIds) {
    pick.destroy();
  }
  this._shaderProgram?.destroy();
  this._terrainShaderProgram?.destroy();
  this._vertexArrays.length = 0;
  this._textures.length = 0;
  this._pickIds.length = 0;
  this._shaderProgram = undefined;
  this._terrainShaderProgram = undefined;
  this._dashTexture = undefined;
  this.uniformMap = {};
  return destroyObject(this);
};
export default SceneGISVectorGroundResources;
