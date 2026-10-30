import ArcType from "../../Core/ArcType.js";
import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import DeveloperError from "../../Core/DeveloperError.js";
import PolylineGeometry from "../../Core/PolylineGeometry.js";
import PolylineMaterialAppearance from "../../Scene/PolylineMaterialAppearance.js";

function cloneFinitePosition(position, name) {
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

/**
 * 直线段平面折线的不可变纯 CPU 几何描述。材质 st.s 为累计 XYZ 长度除以总长度，贴地绘制则使用 XY 长度。st.t 从右侧 0 到左侧 1；普通线使用原生屏幕扩展，贴地线使用 XY 宽度。重复首位置可闭合斜接，产生一处 1 到 0 的 UV 接缝。每个批次实例独立设置 UV 起点。
 *
 * @alias SceneGISPlanarPolylineGeometry
 * @constructor
 *
 * @param {object} options 包含以下属性的对象：
 * @param {Cartesian3[]} options.positions 平面位置，单位为米。
 * @param {number} options.width 为正的线宽，单位为像素。
 * @param {Cartesian3} [options.origin] 局部原点，默认使用首个归一化位置。
 *
 * @exception {DeveloperError} positions 必须包含至少两个不同的有限 Cartesian3。
 * @exception {DeveloperError} width 必须有限且大于零。
 * @exception {DeveloperError} origin 已定义时必须为有限 Cartesian3。
 */
function SceneGISPlanarPolylineGeometry(options) {
  options = options ?? {};
  const source = options.positions;
  if (!Array.isArray(source) || source.length < 2) {
    throw new DeveloperError("positions must contain at least two positions.");
  }
  const positions = [];
  for (let i = 0; i < source.length; i++) {
    const position = cloneFinitePosition(source[i], "positions");
    if (
      positions.length === 0 ||
      !Cartesian3.equals(position, positions[positions.length - 1])
    ) {
      positions.push(position);
    }
  }
  if (positions.length < 2) {
    throw new DeveloperError(
      "positions must contain at least two adjacent distinct positions.",
    );
  }
  const width = options.width;
  if (!Number.isFinite(width) || width <= 0.0) {
    throw new DeveloperError("width must be finite and greater than zero.");
  }
  const origin =
    options.origin === undefined
      ? Cartesian3.clone(positions[0])
      : cloneFinitePosition(options.origin, "origin");
  const localPositions = new Array(positions.length);
  for (let i = 0; i < positions.length; i++) {
    const local = Cartesian3.subtract(positions[i], origin, new Cartesian3());
    if (
      !Number.isFinite(local.x) ||
      !Number.isFinite(local.y) ||
      !Number.isFinite(local.z)
    ) {
      throw new DeveloperError("Local polyline positions must be finite.");
    }
    localPositions[i] = local;
  }

  this._positions = positions;
  this._localPositions = localPositions;
  this._origin = origin;
  this._width = width;
  this._boundingSphere = BoundingSphere.fromPoints(localPositions);
}

Object.defineProperties(SceneGISPlanarPolylineGeometry.prototype, {
  /**
   * 获取归一化世界位置的快照副本。
   *
   * @memberof SceneGISPlanarPolylineGeometry.prototype
   * @type {Cartesian3[]}
   * @readonly
   */
  positions: {
    get: function () {
      return this._positions.map((position) => Cartesian3.clone(position));
    },
  },
  /**
   * 获取线宽，单位为像素。
   *
   * @memberof SceneGISPlanarPolylineGeometry.prototype
   * @type {number}
   * @readonly
   */
  width: {
    get: function () {
      return this._width;
    },
  },
  /**
   * 获取平面世界中局部原点的副本。
   *
   * @memberof SceneGISPlanarPolylineGeometry.prototype
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
SceneGISPlanarPolylineGeometry.prototype._createGeometry = function () {
  const geometry = PolylineGeometry.createGeometry(
    new PolylineGeometry({
      positions: this._localPositions,
      width: this._width,
      arcType: ArcType.NONE,
      vertexFormat: PolylineMaterialAppearance.VERTEX_FORMAT,
    }),
  );
  // Remap the native index-based s after native duplicate removal. Keep its width/tessellation.
  const attributes = geometry.attributes;
  const positions = attributes.position.values;
  const st = attributes.st.values;
  const count = (positions.length / 3 + 4) / 4;
  const distances = [0];
  const points = [];
  for (let i = 0; i < count; ++i) {
    const index = i === 0 ? 0 : i * 4 - 2;
    points.push(Cartesian3.unpack(positions, index * 3, new Cartesian3()));
    if (i > 0) {
      distances.push(
        distances[i - 1] + Cartesian3.distance(points[i - 1], points[i]),
      );
    }
  }
  for (let i = 0; i < st.length; i += 2) {
    st[i] = distances[Math.round(st[i] * (count - 1))] / distances[count - 1];
  }
  if (Cartesian3.equals(points[0], points[count - 1])) {
    const previous = attributes.prevPosition.values;
    const next = attributes.nextPosition.values;
    for (let i = 0; i < 2; ++i) {
      Cartesian3.pack(points[count - 2], previous, i * 3);
      Cartesian3.pack(points[1], next, positions.length - 6 + i * 3);
    }
  }
  return geometry;
};

/** @private */
SceneGISPlanarPolylineGeometry.prototype._getLocalBoundingSphere = function (
  result,
) {
  return BoundingSphere.clone(this._boundingSphere, result);
};

/** @private */
SceneGISPlanarPolylineGeometry.prototype._getDrapeSource = function () {
  return {
    positions: this._positions,
    origin: this._origin,
    width: this._width,
  };
};

export default SceneGISPlanarPolylineGeometry;
