import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Matrix3 from "../../../Core/Matrix3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import { distanceSquared } from "./_SceneGISWaterMesh.js";

/** Fixed authoring-frame samples of the original regional mean surface. @private */
class SceneGISWaterRegionalField {
  constructor(options, mesh, domain) {
    const m = options.modelMatrix;
    if (
      !m ||
      !Array.from({ length: 16 }, (_, i) => m[i]).every(Number.isFinite)
    ) {
      throw new DeveloperError(
        "Regional bathymetry requires a finite rigid upright modelMatrix.",
      );
    }
    const rotation = Matrix4.getMatrix3(m, new Matrix3());
    const gram = Matrix3.multiply(
      Matrix3.transpose(rotation, new Matrix3()),
      rotation,
      new Matrix3(),
    );
    const origin = Matrix4.getTranslation(m, new Cartesian3());
    const up = mesh.ellipsoid
      ? mesh.ellipsoid.geodeticSurfaceNormal(origin, new Cartesian3())
      : Cartesian3.UNIT_Z;
    const z = Matrix3.getColumn(rotation, 2, new Cartesian3());
    const r = options.rectangle;
    if (
      !Matrix3.equalsEpsilon(gram, Matrix3.IDENTITY, 1e-10) ||
      Math.abs(Matrix3.determinant(rotation) - 1) > 1e-10 ||
      m[3] !== 0 ||
      m[7] !== 0 ||
      m[11] !== 0 ||
      m[15] !== 1 ||
      !up ||
      Cartesian3.dot(z, up) < 1 - 1e-10 ||
      Math.max(
        Math.abs(r.x),
        Math.abs(r.y),
        Math.abs(r.x + r.width),
        Math.abs(r.y + r.height),
      ) > 4096
    ) {
      throw new DeveloperError(
        "Regional bathymetry requires an upright rigid frame and XY within +/-4096 meters.",
      );
    }
    this.modelMatrix = Matrix4.clone(m);
    this.inverse = Matrix4.inverseTransformation(m, new Matrix4());
    this.chartOrigin = new Cartesian2();
    this.windOrigin = new Cartesian2();
    const projectedOrigin = mesh.chart.project(origin);
    this.chartOrigin.x = projectedOrigin.x;
    this.chartOrigin.y = projectedOrigin.y;
    this.east = Matrix4.multiplyByPointAsVector(
      this.inverse,
      mesh.chart.east,
      new Cartesian3(),
    );
    const count = options.width * options.height;
    this.surface = new Float32Array(count * 4);
    this.tangent = new Float32Array(count * 4);
    // River meshes expose attributes through their prepared vertex records.
    const river = domain.triangles[0].a.length > 3;
    this.flow = river ? new Float32Array(count * 4) : undefined;
    const sample = new Cartesian3(),
      point = new Cartesian3(),
      normal = new Cartesian3();
    const current = new Cartesian3(1, 0, 0);
    for (let y = 0; y < options.height; ++y) {
      for (let x = 0; x < options.width; ++x) {
        const local = new Cartesian3(
          r.x + (x / (options.width - 1)) * r.width,
          r.y + (y / (options.height - 1)) * r.height,
          0,
        );
        let inside = false,
          chart;
        // Solve mean height along the authoring frame's vertical. Upright finite
        // patches make this Newton correction well conditioned.
        for (let iteration = 0; iteration < 4; ++iteration) {
          Matrix4.multiplyByPoint(m, local, point);
          chart = mesh.chart.project(point);
          inside = domain.sample(
            chart.x,
            chart.y,
            sample,
            river ? current : undefined,
          );
          let height = sample.x;
          if (!inside) {
            let nearest = domain.triangles[0],
              distance = Infinity;
            for (const t of domain.triangles) {
              const b = t.bounds;
              const d =
                Math.max(b[0] - chart.x, 0, chart.x - b[2]) ** 2 +
                Math.max(b[1] - chart.y, 0, chart.y - b[3]) ** 2;
              if (d < distance) {
                distance = d;
                nearest = t;
              }
            }
            height =
              nearest.a[2] +
              nearest.gx * (chart.x - nearest.a[0]) +
              nearest.gy * (chart.y - nearest.a[1]);
          }
          mesh.chart.normal(chart.x, chart.y, normal);
          local.z += (height - chart.z) / Cartesian3.dot(normal, z);
        }
        const i = (y * options.width + x) * 4;
        this.surface.set(
          [
            chart.x - this.chartOrigin.x,
            chart.y - this.chartOrigin.y,
            local.z,
            inside ? 1 : 0,
          ],
          i,
        );
        Matrix4.multiplyByPointAsVector(this.inverse, normal, normal);
        let shore = 16;
        for (const [a, b] of mesh.root.shores) {
          shore = Math.min(shore, distanceSquared(chart.x, chart.y, a, b));
        }
        const fade = Math.min(1, Math.sqrt(shore) / 4);
        this.tangent.set(
          [normal.x, normal.y, fade * fade * (3 - 2 * fade), 0],
          i,
        );
        this.flow?.set([current.x, current.y, current.z, 0], i);
      }
    }
  }
}
export default SceneGISWaterRegionalField;
