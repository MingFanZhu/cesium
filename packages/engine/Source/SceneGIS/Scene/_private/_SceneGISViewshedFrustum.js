import BoundingSphere from "../../../Core/BoundingSphere.js";
import Color from "../../../Core/Color.js";
import ColorGeometryInstanceAttribute from "../../../Core/ColorGeometryInstanceAttribute.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import destroyObject from "../../../Core/destroyObject.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import GeometryInstance from "../../../Core/GeometryInstance.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import PerInstanceColorAppearance from "../../../Scene/PerInstanceColorAppearance.js";
import Primitive from "../../../Scene/Primitive.js";
import ShadowMode from "../../../Scene/ShadowMode.js";

function createGeometry(state) {
  // Work in observer eye coordinates, normalized by the radial range.
  const n = state.near / state.distance;
  const tx = Math.tan(state.horizontal / 2);
  const ty = Math.tan(state.vertical / 2);
  const positions = [];
  const segment = (a, b) => positions.push(...a, ...b);
  const arc = (start, end, point) => {
    const steps = Math.max(1, Math.ceil((end - start) / (Math.PI / 64)));
    let previous = point(start);
    for (let i = 1; i <= steps; ++i) {
      const next = point(start + ((end - start) * i) / steps);
      segment(previous, next);
      previous = next;
    }
  };
  // Four side-plane / range-sphere arcs and side-plane / near-plane edges.
  for (const swap of [false, true]) {
    const a = swap ? ty : tx;
    const b = swap ? tx : ty;
    const scale = Math.sqrt(1 + a * a);
    if (n * scale >= 1) {
      continue;
    }
    const angle = Math.min(Math.atan(b / scale), Math.acos(n * scale));
    const extent = Math.min(b * n, Math.sqrt(1 - n * n * scale * scale));
    for (const sign of [-1, 1]) {
      const point = (x, y, z) => (swap ? [y, x, -z] : [x, y, -z]);
      arc(-angle, angle, (t) => {
        const z = Math.cos(t) / scale;
        return point(sign * a * z, Math.sin(t), z);
      });
      segment(point(sign * a * n, -extent, n), point(sign * a * n, extent, n));
    }
  }
  // Corner rays stop at the sphere, not at the capture frustum's far plane.
  const z = 1 / Math.sqrt(1 + tx * tx + ty * ty);
  if (z > n) {
    for (const x of [-tx, tx]) {
      for (const y of [-ty, ty]) {
        segment([x * n, y * n, -n], [x * z, y * z, -z]);
      }
    }
  }
  // When near approaches range, the sphere can cut the near rectangle too.
  const radius = Math.sqrt(1 - n * n);
  const breaks = [0, Math.PI * 2];
  for (const angle of [
    Math.acos(Math.min(1, (tx * n) / radius)),
    Math.asin(Math.min(1, (ty * n) / radius)),
  ]) {
    breaks.push(angle, Math.PI - angle, Math.PI + angle, Math.PI * 2 - angle);
  }
  breaks.sort((a, b) => a - b);
  for (let i = 1; i < breaks.length; ++i) {
    const start = breaks[i - 1];
    const end = breaks[i];
    const mid = (start + end) / 2;
    if (
      end > start &&
      Math.abs(radius * Math.cos(mid)) <= tx * n &&
      Math.abs(radius * Math.sin(mid)) <= ty * n
    ) {
      arc(start, end, (t) => [radius * Math.cos(t), radius * Math.sin(t), -n]);
    }
  }
  const values = new Float64Array(positions);
  return new Geometry({
    attributes: {
      position: new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values,
      }),
    },
    primitiveType: PrimitiveType.LINES,
    boundingSphere: BoundingSphere.fromVertices(values),
  });
}

/** Owns a display-only observer range outline. @private */
class SceneGISViewshedFrustum {
  constructor(state) {
    this._near = state.near;
    this._distance = state.distance;
    this._horizontal = state.horizontal;
    this._vertical = state.vertical;
    this._primitive = new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: createGeometry(state),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.YELLOW),
        },
      }),
      appearance: new PerInstanceColorAppearance({
        flat: true,
        translucent: true,
      }),
      asynchronous: false,
      allowPicking: false,
      shadows: ShadowMode.DISABLED,
    });
  }

  matches(state) {
    return (
      this._near === state.near &&
      this._distance === state.distance &&
      this._horizontal === state.horizontal &&
      this._vertical === state.vertical
    );
  }

  update(state, frameState) {
    Matrix4.multiplyByUniformScale(
      state.camera.inverseViewMatrix,
      state.distance,
      this._primitive.modelMatrix,
    );
    // Local Cartesian guide geometry has no 2D projection or date-line split.
    // The public analysis already requires SCENE3D, even in a morphable Scene.
    const scene3DOnly = frameState.scene3DOnly;
    try {
      frameState.scene3DOnly = true;
      this._primitive.update(frameState);
    } finally {
      frameState.scene3DOnly = scene3DOnly;
    }
  }

  isDestroyed() {
    return false;
  }

  destroy() {
    this._primitive.destroy();
    return destroyObject(this);
  }
}

export default SceneGISViewshedFrustum;
