import createSceneGISPlanarMaterialGeometry from "./_private/_SceneGISPlanarMaterialGeometry.js";
import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Geometry from "../../Core/Geometry.js";
import GeometryAttribute from "../../Core/GeometryAttribute.js";
import GeometryAttributes from "../../Core/GeometryAttributes.js";
import IndexDatatype from "../../Core/IndexDatatype.js";
import PrimitiveType from "../../Core/PrimitiveType.js";

function clonePosition(position, name) {
  if (
    !(position instanceof Cartesian3) ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    throw new DeveloperError(`${name} must contain finite Cartesian3 values.`);
  }
  return Cartesian3.clone(position);
}

function cloneHeights(source, length, name) {
  if (source === undefined) {
    return undefined;
  }
  if (!Array.isArray(source) || source.length !== length) {
    throw new DeveloperError(`${name} must match positions length.`);
  }
  return source.map((height) => {
    if (!Number.isFinite(height)) {
      throw new DeveloperError(`${name} must contain finite values.`);
    }
    return height;
  });
}

/**
 * 沿平面 XY 路径生成竖直墙面的不可变纯 CPU 几何描述。
 *
 * @alias SceneGISPlanarWallGeometry
 * @constructor
 * @param {object} options 包含以下属性的对象：
 * @param {Cartesian3[]} options.positions 路径位置，单位为平面米。
 * @param {number[]} [options.minimumHeights] 底部高度，单位为米，默认为零。
 * @param {number[]} [options.maximumHeights] 顶部高度，单位为米，默认使用位置 Z。
 * @param {Cartesian3} [options.origin] 局部原点，默认使用首个底部位置。
 * @exception {DeveloperError} 位置、高度、原点或派生墙面无效。
 */
function SceneGISPlanarWallGeometry(options) {
  options = options ?? {};
  if (!Array.isArray(options.positions) || options.positions.length < 2) {
    throw new DeveloperError("positions must contain at least two positions.");
  }
  const positions = options.positions.map((position) =>
    clonePosition(position, "positions"),
  );
  const minimumHeights = cloneHeights(
    options.minimumHeights,
    positions.length,
    "minimumHeights",
  );
  const maximumHeights = cloneHeights(
    options.maximumHeights,
    positions.length,
    "maximumHeights",
  );
  const bottom = new Array(positions.length);
  const top = new Array(positions.length);
  for (let i = 0; i < positions.length; i++) {
    const minimum = minimumHeights?.[i] ?? 0.0;
    const maximum = maximumHeights?.[i] ?? positions[i].z;
    if (minimum > maximum) {
      throw new DeveloperError(
        "minimumHeights must not exceed maximumHeights.",
      );
    }
    bottom[i] = new Cartesian3(positions[i].x, positions[i].y, minimum);
    top[i] = new Cartesian3(positions[i].x, positions[i].y, maximum);
    if (i > 0) {
      const dx = positions[i].x - positions[i - 1].x;
      const dy = positions[i].y - positions[i - 1].y;
      if (dx === 0.0 && dy === 0.0) {
        throw new DeveloperError("Adjacent wall positions must differ in XY.");
      }
      if (bottom[i - 1].z === top[i - 1].z && bottom[i].z === top[i].z) {
        throw new DeveloperError("Each wall segment must have nonzero area.");
      }
    }
  }
  const origin =
    options.origin === undefined
      ? Cartesian3.clone(bottom[0])
      : clonePosition(options.origin, "origin");
  const local = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const dx = positions[i + 1].x - positions[i].x;
    const dy = positions[i + 1].y - positions[i].y;
    const inverseLength = 1.0 / Math.hypot(dx, dy);
    const normal = new Cartesian3(dy * inverseLength, -dx * inverseLength, 0.0);
    const segment = [bottom[i], bottom[i + 1], top[i + 1], top[i]];
    const offset = local.length;
    for (const position of segment) {
      const value = Cartesian3.subtract(position, origin, new Cartesian3());
      if (
        !Number.isFinite(value.x) ||
        !Number.isFinite(value.y) ||
        !Number.isFinite(value.z)
      ) {
        throw new DeveloperError("Local wall positions must be finite.");
      }
      local.push(value);
      normals.push(Cartesian3.clone(normal));
    }
    indices.push(
      offset,
      offset + 1,
      offset + 2,
      offset,
      offset + 2,
      offset + 3,
    );
  }
  this._positions = positions;
  this._minimumHeights = minimumHeights;
  this._maximumHeights = maximumHeights;
  this._bottom = bottom;
  this._top = top;
  this._origin = origin;
  this._localPositions = local;
  this._normals = normals;
  this._indices = indices;
  this._boundingSphere = BoundingSphere.fromPoints(local);
  if (!Number.isFinite(this._boundingSphere.radius)) {
    throw new DeveloperError("The derived wall bounds must be finite.");
  }
}

Object.defineProperties(SceneGISPlanarWallGeometry.prototype, {
  /**
   * 获取墙面路径的快照副本。
   *
   * @memberof SceneGISPlanarWallGeometry.prototype
   * @type {Cartesian3[]}
   * @readonly
   */
  positions: {
    get: function () {
      return this._positions.map((position) => Cartesian3.clone(position));
    },
  },
  /**
   * 获取显式提供的最小高度快照副本。
   *
   * @memberof SceneGISPlanarWallGeometry.prototype
   * @type {number[]|undefined}
   * @readonly
   */
  minimumHeights: {
    get: function () {
      return this._minimumHeights?.slice();
    },
  },
  /**
   * 获取显式提供的最大高度快照副本。
   *
   * @memberof SceneGISPlanarWallGeometry.prototype
   * @type {number[]|undefined}
   * @readonly
   */
  maximumHeights: {
    get: function () {
      return this._maximumHeights?.slice();
    },
  },
  /**
   * 获取平面世界中局部原点的副本。
   *
   * @memberof SceneGISPlanarWallGeometry.prototype
   * @type {Cartesian3}
   * @readonly
   */
  origin: {
    get: function () {
      return Cartesian3.clone(this._origin);
    },
  },
});

/** @private */
SceneGISPlanarWallGeometry.prototype._createGeometry = function (vertexFormat) {
  const positionValues = new Float64Array(this._localPositions.length * 3);
  const normalValues = new Float32Array(this._normals.length * 3);
  for (let i = 0; i < this._localPositions.length; i++) {
    Cartesian3.pack(this._localPositions[i], positionValues, i * 3);
    Cartesian3.pack(this._normals[i], normalValues, i * 3);
  }
  const geometry = new Geometry({
    attributes: new GeometryAttributes({
      position: new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positionValues,
      }),
      normal: new GeometryAttribute({
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: normalValues,
      }),
    }),
    indices: IndexDatatype.createTypedArray(
      this._localPositions.length,
      this._indices,
    ),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.clone(this._boundingSphere),
  });
  return vertexFormat === undefined
    ? geometry
    : createSceneGISPlanarMaterialGeometry(geometry, vertexFormat);
};

/** @private */
SceneGISPlanarWallGeometry.prototype._getLocalBoundingSphere = function (
  result,
) {
  return BoundingSphere.clone(this._boundingSphere, result);
};

/** @private */
SceneGISPlanarWallGeometry.prototype._getOutlinePositions = function () {
  const lines = [
    this._top.map((position) => Cartesian3.clone(position)),
    this._bottom.map((position) => Cartesian3.clone(position)),
  ];
  for (let i = 0; i < this._top.length; i++) {
    lines.push([
      Cartesian3.clone(this._bottom[i]),
      Cartesian3.clone(this._top[i]),
    ]);
  }
  return lines;
};

export default SceneGISPlanarWallGeometry;
