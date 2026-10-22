import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import Cartesian4 from "../../Core/Cartesian4.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Matrix4 from "../../Core/Matrix4.js";
import PrimitiveType from "../../Core/PrimitiveType.js";
import PixelDatatype from "../../Renderer/PixelDatatype.js";
import TextureMagnificationFilter from "../../Renderer/TextureMagnificationFilter.js";
import TextureMinificationFilter from "../../Renderer/TextureMinificationFilter.js";
import CustomShader from "../../Scene/Model/CustomShader.js";
import TextureUniform from "../../Scene/Model/TextureUniform.js";
import UniformType from "../../Scene/Model/UniformType.js";
import VaryingType from "../../Scene/Model/VaryingType.js";
import SceneMode from "../../Scene/SceneMode.js";
import TileBoundingSphere from "../../Scene/TileBoundingSphere.js";
import SceneGISPlanarPolygonGeometry from "../Core/SceneGISPlanarPolygonGeometry.js";
import flattenVS from "../../Shaders/SceneGIS/SceneGISModelFlattenVS.js";
import flattenFS from "../../Shaders/SceneGIS/SceneGISModelFlattenFS.js";

const maximumEdges = 256;

function finiteHeight(value) {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
    throw new DeveloperError("height must be a finite Float32 value.");
  }
  return Math.fround(value);
}

function rigidFrame(value) {
  if (!(value instanceof Matrix4)) {
    throw new DeveloperError(
      "modelMatrix must be a rigid local-to-world Matrix4.",
    );
  }
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(value[i])) {
      throw new DeveloperError("modelMatrix must be finite.");
    }
  }
  const x = Cartesian3.fromElements(value[0], value[1], value[2]);
  const y = Cartesian3.fromElements(value[4], value[5], value[6]);
  const z = Cartesian3.fromElements(value[8], value[9], value[10]);
  if (
    Math.abs(Cartesian3.magnitudeSquared(x) - 1) > 1e-10 ||
    Math.abs(Cartesian3.magnitudeSquared(y) - 1) > 1e-10 ||
    Math.abs(Cartesian3.magnitudeSquared(z) - 1) > 1e-10 ||
    Math.abs(Cartesian3.dot(x, y)) > 1e-10 ||
    Math.abs(Cartesian3.dot(x, z)) > 1e-10 ||
    Math.abs(Cartesian3.dot(y, z)) > 1e-10 ||
    Cartesian3.dot(Cartesian3.cross(x, y, new Cartesian3()), z) < 0 ||
    value[3] !== 0 ||
    value[7] !== 0 ||
    value[11] !== 0 ||
    value[15] !== 1
  ) {
    throw new DeveloperError(
      "modelMatrix must be a right-handed rigid transform.",
    );
  }
  return Matrix4.clone(value);
}

function preparePolygon(hierarchy) {
  if (!hierarchy || !Array.isArray(hierarchy.positions)) {
    throw new DeveloperError("polygonHierarchy.positions is required.");
  }
  const holes = hierarchy.holes ?? [];
  if (
    !Array.isArray(holes) ||
    holes.some((h) => !h || !Array.isArray(h.positions) || h.holes?.length)
  ) {
    throw new DeveloperError("Only direct polygon holes are supported.");
  }
  const sources = [hierarchy.positions, ...holes.map((h) => h.positions)];
  if (
    sources.some((r) => !Array.isArray(r)) ||
    sources.reduce((sum, r) => sum + r.length, 0) > maximumEdges
  ) {
    throw new DeveloperError(
      "polygonHierarchy must contain at most 256 positions.",
    );
  }
  const rings = sources.map((ring) =>
    ring.map((p) => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        throw new DeveloperError(
          "Polygon positions must have finite local X/Y.",
        );
      }
      return new Cartesian3(Math.fround(p.x), Math.fround(p.y), 0);
    }),
  );
  // Reuse the owned topology validator. No Geometry or GPU buffers are created.
  const polygon = new SceneGISPlanarPolygonGeometry({
    positions: rings[0],
    holes: rings.slice(1),
  });
  const normalized = [polygon.positions, ...polygon.holes];
  const data = new Float32Array(maximumEdges * 2 * 4);
  const bounds = new Cartesian4(Infinity, Infinity, -Infinity, -Infinity);
  let count = 0;
  for (let r = 0; r < normalized.length; r++) {
    const ring = normalized[r];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      data.set([a.x, a.y, b.x, b.y], count * 4);
      data[(maximumEdges + count) * 4] = r === 0 ? 1 : 0;
      count++;
      bounds.x = Math.min(bounds.x, a.x);
      bounds.y = Math.min(bounds.y, a.y);
      bounds.z = Math.max(bounds.z, a.x);
      bounds.w = Math.max(bounds.w, a.y);
    }
  }
  return { data, bounds, count };
}

/**
 * Flattens existing mesh vertices inside a local XY polygon to a local Z plane,
 * or outside it when inverse is true.
 * Assign this instance to {@link Cesium3DTileset#customShader}. The immutable
 * polygon supports concavity and direct holes; its Z coordinates are ignored.
 * Globe callers supply an ENU frame; a constant ENU Z is not ellipsoid height.
 * Planar callers supply a Cartesian frame in the current world's meters.
 *
 * This is a visual deformation, not polygon clipping or mesh editing. Crossing
 * triangles are not split. CPU mesh queries and exported data remain unchanged.
 * The qualified profile is static mesh 3D Tiles in SCENE3D, without legacy i3dm,
 * classification, skinning, morph animation or another custom shader.
 *
 * The caller owns this shader. Detach it from all consumers before destroying
 * it, and destroy it before the rendering Context. One Context per instance.
 *
 * @alias SceneGISModelFlatten
 * @constructor
 * @extends CustomShader
 * @param {object} options Configuration.
 * @param {PolygonHierarchy} options.polygonHierarchy Local XY rings, at most 256 total input positions.
 * @param {Matrix4} options.modelMatrix Right-handed rigid local-to-world transform, copied at construction.
 * @param {number} options.height Target local Z in meters.
 * @param {boolean} [options.enabled=true] Whether to deform the mesh.
 * @param {boolean} [options.inverse=false] Preserve the polygon and flatten its complement, including holes.
 * @exception {DeveloperError} The frame, polygon, height or rendering context is unsupported.
 * @example
 * const flatten = new Cesium.SceneGISModelFlatten({
 *   polygonHierarchy: new Cesium.PolygonHierarchy(localPositions),
 *   modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(origin),
 *   height: 5.0,
 * });
 * tileset.customShader = flatten;
 */
class SceneGISModelFlatten extends CustomShader {
  constructor(options = {}) {
    const frame = rigidFrame(options.modelMatrix);
    const polygon = preparePolygon(options.polygonHierarchy);
    const height = finiteHeight(options.height);
    const enabled = options.enabled ?? true;
    if (typeof enabled !== "boolean") {
      throw new DeveloperError("enabled must be boolean.");
    }
    const inverse = options.inverse ?? false;
    if (typeof inverse !== "boolean") {
      throw new DeveloperError("inverse must be boolean.");
    }
    super({
      uniforms: {
        u_sgFlattenEdges: {
          type: UniformType.SAMPLER_2D,
          value: new TextureUniform({
            typedArray: polygon.data,
            width: maximumEdges,
            height: 2,
            pixelDatatype: PixelDatatype.FLOAT,
            repeat: false,
            minificationFilter: TextureMinificationFilter.NEAREST,
            magnificationFilter: TextureMagnificationFilter.NEAREST,
          }),
        },
        u_sgFlattenCount: { type: UniformType.INT, value: polygon.count },
        u_sgFlattenBounds: { type: UniformType.VEC4, value: polygon.bounds },
        u_sgFlattenHeight: { type: UniformType.FLOAT, value: height },
        u_sgFlattenEnabled: { type: UniformType.BOOL, value: enabled },
        u_sgFlattenInverse: { type: UniformType.BOOL, value: inverse },
        u_sgModelToFlatten: { type: UniformType.MAT4, value: new Matrix4() },
        u_sgFlattenToModel: { type: UniformType.MAT4, value: new Matrix4() },
      },
      varyings: { v_sgFlattened: VaryingType.FLOAT },
      vertexShaderText: flattenVS,
      fragmentShaderText: flattenFS,
    });
    this._frame = frame;
    this._inverseFrame = Matrix4.inverseTransformation(frame, new Matrix4());
    this._bounds = polygon.bounds;
    this._revision = 0;
    this._boundsCache = new WeakMap();
    this._context = undefined;
    this._lastModel = new Matrix4();
    this._modelToLocal = new Matrix4();
    this._localToModel = new Matrix4();
    this._projectedSphere = new BoundingSphere();
    this._localCenter = new Cartesian3();
    this.uniformMap.u_sgModelToFlatten = () => {
      this._updateMatrices();
      return this._modelToLocal;
    };
    this.uniformMap.u_sgFlattenToModel = () => {
      this._updateMatrices();
      return this._localToModel;
    };
  }

  /** Target Z in the immutable local frame, in meters.
   * @type {number}
   */
  get height() {
    return this.uniforms.u_sgFlattenHeight.value;
  }
  set height(value) {
    this.uniforms.u_sgFlattenHeight.value = finiteHeight(value);
    this._revision++;
  }

  /** Whether flattening is enabled. Disabling restores source geometry and bounds.
   * @type {boolean}
   */
  get enabled() {
    return this.uniforms.u_sgFlattenEnabled.value;
  }
  set enabled(value) {
    if (typeof value !== "boolean") {
      throw new DeveloperError("enabled must be boolean.");
    }
    this.uniforms.u_sgFlattenEnabled.value = value;
    this._revision++;
  }

  /** Whether to preserve the polygon and flatten its complement within the model.
   * In inverse mode, the outer boundary stays at its original height, while holes
   * and their boundaries are flattened. Crossing triangles are not split.
   * Changing this value does not rebuild the shader or polygon texture.
   * @type {boolean}
   * @default false
   */
  get inverse() {
    return this.uniforms.u_sgFlattenInverse.value;
  }
  set inverse(value) {
    if (typeof value !== "boolean") {
      throw new DeveloperError("inverse must be boolean.");
    }
    if (value !== this.inverse) {
      this.uniforms.u_sgFlattenInverse.value = value;
      this._revision++;
    }
  }

  /** A copy of the immutable local-to-world frame.
   * @type {Matrix4}
   * @readonly
   */
  get modelMatrix() {
    return Matrix4.clone(this._frame);
  }

  /** @private */
  _updateMatrices() {
    const model = this._context.uniformState.model;
    if (!Matrix4.equals(model, this._lastModel)) {
      Matrix4.clone(model, this._lastModel);
      Matrix4.multiply(this._inverseFrame, model, this._modelToLocal);
      Matrix4.inverse(this._modelToLocal, this._localToModel);
    }
  }

  /** @private */
  update(frameState) {
    if (frameState.mode !== SceneMode.SCENE3D || !frameState.context.webgl2) {
      throw new DeveloperError(
        "SceneGISModelFlatten requires SCENE3D and WebGL2.",
      );
    }
    if (this._context && this._context !== frameState.context) {
      throw new DeveloperError(
        "SceneGISModelFlatten cannot be shared across Contexts.",
      );
    }
    this._context = frameState.context;
    super.update(frameState);
  }

  /** @private */
  _expandSphere(source, result) {
    if (!this.enabled) {
      return BoundingSphere.clone(source, result);
    }
    const p = Matrix4.multiplyByPoint(
      this._inverseFrame,
      source.center,
      this._localCenter,
    );
    const r = source.radius;
    const b = this._bounds;
    // In inverse mode, even spheres outside the polygon can be deformed.
    if (
      !this.inverse &&
      (p.x + r < b.x || p.x - r > b.z || p.y + r < b.y || p.y - r > b.w)
    ) {
      return BoundingSphere.clone(source, result);
    }
    p.z = this.height;
    Matrix4.multiplyByPoint(this._frame, p, this._projectedSphere.center);
    this._projectedSphere.radius = r;
    return BoundingSphere.union(source, this._projectedSphere, result);
  }

  /**
   * SGP-0064 tile traversal/framing integration.
   * @private
   */
  static _tileBounds(shader, volume) {
    if (
      !(shader instanceof SceneGISModelFlatten) ||
      !shader.enabled ||
      !volume
    ) {
      return volume;
    }
    let entry = shader._boundsCache.get(volume);
    if (!entry) {
      entry = {
        source: new BoundingSphere(),
        volume: new TileBoundingSphere(),
        revision: -1,
      };
      shader._boundsCache.set(volume, entry);
    }
    const sphere = volume.boundingSphere;
    if (
      entry.revision !== shader._revision ||
      !BoundingSphere.equals(sphere, entry.source)
    ) {
      BoundingSphere.clone(sphere, entry.source);
      shader._expandSphere(sphere, entry.volume.boundingSphere);
      entry.revision = shader._revision;
    }
    // Keep exact original OBB/region tests when the range cannot affect this tile.
    return BoundingSphere.equals(sphere, entry.volume.boundingSphere)
      ? volume
      : entry.volume;
  }

  /**
   * SGP-0064 command and derived-pass bounds integration.
   * @private
   */
  static _updateCommandBounds(command) {
    const shader = command.model.customShader;
    const active = shader instanceof SceneGISModelFlatten && shader.enabled;
    if (active) {
      const { node, primitive } = command.runtimePrimitive;
      if (
        node.instances?.transformInWorldSpace ||
        node.skin ||
        primitive.morphTargets?.length ||
        !PrimitiveType.isTriangles(primitive.primitiveType)
      ) {
        throw new DeveloperError(
          "SceneGISModelFlatten requires static triangle meshes without legacy world-space instancing.",
        );
      }
    }
    if (active || command._sceneGISFlattenBounds) {
      const sphere = command.boundingVolume;
      BoundingSphere.transform(
        command.runtimePrimitive.boundingSphere,
        command.modelMatrix,
        sphere,
      );
      if (active) {
        shader._expandSphere(sphere, sphere);
      }
      command._sceneGISFlattenBounds = active;
    }
  }
}

export default SceneGISModelFlatten;
