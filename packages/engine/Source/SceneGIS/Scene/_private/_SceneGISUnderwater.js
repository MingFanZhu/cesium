import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartographic from "../../../Core/Cartographic.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Matrix3 from "../../../Core/Matrix3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import Transforms from "../../../Core/Transforms.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import ray from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRRay.js";
import optics from "../../../Shaders/SceneGIS/Water/SceneGISWaterOptics.js";
import effects from "../../../Shaders/SceneGIS/Water/SceneGISWaterEffects.js";
import fragment from "../../../Shaders/SceneGIS/Water/SceneGISUnderwaterFS.js";
import volume from "../../../Shaders/SceneGIS/Water/SceneGISUnderwaterVolume.js";
import profile from "../../../Shaders/SceneGIS/Water/SceneGISWaterProfile.js";
import polynomial from "../../../Shaders/SceneGIS/Water/SceneGISWaterPolynomial.js";
import EnvironmentLighting from "./_SceneGISModelEnvironmentLighting.js";

/** Finite local or regional curved medium, without full-resolution targets. @private */
class SceneGISUnderwater {
  constructor(hierarchy, mesh, domain) {
    const edges = [];
    function visit(ring) {
      const p = ring.positions;
      for (let i = 0; i < p.length; ++i) {
        const a = p[i],
          b = p[(i + 1) % p.length];
        edges.push(a.x, a.y, b.x, b.y);
      }
      ring.holes?.forEach(visit);
    }
    if (domain) {
      for (const [a, b] of mesh.root.shores) {
        edges.push(a.x, a.y, b.x, b.y);
      }
    } else {
      visit(hierarchy);
    }
    if (edges.length > 256 * 4) {
      throw new DeveloperError(
        "Underwater volumes support at most 256 boundary segments.",
      );
    }
    this.edges = new Float32Array(edges);
    this.inverse = new Matrix4();
    this.eyeToWater = new Matrix4();
    this.waterToEye = new Matrix3();
    this.camera = new Cartesian3();
    this.mesh = mesh;
    this.domain = domain;
    this.profile = new Cartesian3();
    this.profileRange = new Cartesian2();
    if (mesh) {
      this.height = mesh.root.minHeight;
      this.radius = mesh.radius + this.height;
      this.cartographic = new Cartographic();
      this.normal = new Cartesian3();
      this.anchor = new Cartesian3();
      this.transform = new Matrix4();
      this.chartCamera = new Cartesian2();
      this.waterToChart = new Matrix3();
      const basis = new Matrix3();
      Matrix3.setColumn(basis, 0, mesh.chart.east, basis);
      Matrix3.setColumn(basis, 1, mesh.chart.north, basis);
      Matrix3.setColumn(basis, 2, mesh.chart.up, basis);
      this.worldToChart = Matrix3.transpose(basis, basis);
    }
    this.active = false;
  }

  update(surface, frameState) {
    let altitude;
    if (this.mesh) {
      const { ellipsoid, chart } = this.mesh;
      if (ellipsoid) {
        const c = ellipsoid.cartesianToCartographic(
          frameState.camera.positionWC,
          this.cartographic,
        );
        if (!c) {
          this.active = false;
          return;
        }
        const n = ellipsoid.geodeticSurfaceNormalCartographic(c, this.normal);
        const denominator = Cartesian3.dot(n, chart.up);
        if (denominator <= 0) {
          this.active = false;
          return;
        }
        this.camera.x =
          (chart.radius * Cartesian3.dot(n, chart.east)) / denominator;
        this.camera.y =
          (chart.radius * Cartesian3.dot(n, chart.north)) / denominator;
        altitude = c.height;
      } else {
        this.camera.x = frameState.camera.positionWC.x - chart.origin.x;
        this.camera.y = frameState.camera.positionWC.y - chart.origin.y;
        altitude = frameState.camera.positionWC.z;
      }
      if (this.domain) {
        if (!this.domain.sample(this.camera.x, this.camera.y, this.profile)) {
          this.active = false;
          return;
        }
        this.height = this.profile.x;
        this.radius = this.mesh.radius + this.height;
        this.profileRange.x = this.domain.minimum - this.height;
        this.profileRange.y = this.domain.maximum - this.height;
      }
      this.camera.z = altitude - this.height;
    } else {
      Matrix4.inverseTransformation(surface.modelMatrix, this.inverse);
      Matrix4.multiplyByPoint(
        this.inverse,
        frameState.camera.positionWC,
        this.camera,
      );
    }
    const p = this.camera,
      e = this.edges;
    let inside = !!this.domain;
    for (let i = 0; !this.domain && i < e.length; i += 4) {
      const ax = e[i],
        ay = e[i + 1],
        bx = e[i + 2],
        by = e[i + 3];
      if (
        ay > p.y !== by > p.y &&
        p.x < ((bx - ax) * (p.y - ay)) / (by - ay) + ax
      ) {
        inside = !inside;
      }
    }
    this.active =
      surface.show &&
      surface.underwaterDepth > 0 &&
      inside &&
      p.z < 0 &&
      p.z > -surface.underwaterDepth;
    if (this.active && this.mesh) {
      if (this.mesh.ellipsoid) {
        this.cartographic.height = this.height;
        this.mesh.ellipsoid.cartographicToCartesian(
          this.cartographic,
          this.anchor,
        );
        Transforms.eastNorthUpToFixedFrame(
          this.anchor,
          this.mesh.ellipsoid,
          this.transform,
        );
      } else {
        Cartesian3.fromElements(
          this.mesh.chart.origin.x,
          this.mesh.chart.origin.y,
          this.height,
          this.anchor,
        );
        Matrix4.fromTranslation(this.anchor, this.transform);
      }
      Matrix4.inverseTransformation(this.transform, this.inverse);
      Matrix3.multiply(
        this.worldToChart,
        Matrix4.getMatrix3(this.transform, this.waterToChart),
        this.waterToChart,
      );
      this.chartCamera.x = p.x;
      this.chartCamera.y = p.y;
    }
  }

  draw(surface, scene, passState) {
    if (!this.active) {
      return;
    }
    const context = scene.context;
    this.domain?.create(context);
    this.texture ??= new Texture({
      context,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      sampler: Sampler.NEAREST,
      flipY: false,
      source: {
        width: this.edges.length / 4,
        height: 1,
        arrayBufferView: this.edges,
      },
    });
    const mode = surface._lightingMode;
    if (!this.command || this.mode !== mode) {
      this.command?.shaderProgram.destroy();
      const source =
        mode === "none"
          ? new ShaderSource()
          : EnvironmentLighting.surfaceSource(mode === "planar");
      if (mode !== "none") {
        source.defines.push("SCENEGIS_WATER_PHYSICAL");
      }
      if (this.mesh?.ellipsoid) {
        source.defines.push("SCENEGIS_ELLIPSOID_UNDERWATER");
      }
      if (this.domain) {
        source.defines.push("SCENEGIS_PROFILE_WATER");
      }
      source.sources.push(
        ray,
        optics,
        effects,
        profile,
        polynomial,
        volume,
        fragment,
      );
      this.command = context.createViewportQuadCommand(source, {
        owner: this,
        renderState: RenderState.fromCache({
          depthTest: { enabled: false },
          depthMask: false,
        }),
        uniformMap: {
          ...surface._command.uniformMap,
          u_edges: () => this.texture,
          u_edgeCount: () => this.edges.length / 4,
          u_eyeToWater: () => this.eyeToWater,
          u_waterToEye: () => this.waterToEye,
          u_volumeRadius: () => this.radius,
          u_chartRadius: () => this.mesh.radius,
          u_waterToChart: () => this.waterToChart,
          u_chartCamera: () => this.chartCamera,
          u_waterProfile: () => this.domain.texture,
          u_profileNodeCount: () => this.domain.nodes.length,
          u_profileAnchor: () => this.height - this.domain.reference,
          u_profileRange: () => this.profileRange,
        },
      });
      this.mode = mode;
    }
    Matrix4.multiply(
      this.inverse,
      scene.camera.inverseViewMatrix,
      this.eyeToWater,
    );
    Matrix3.transpose(
      Matrix4.getMatrix3(this.eyeToWater, this.waterToEye),
      this.waterToEye,
    );
    this.command.execute(context, passState);
  }

  destroy() {
    this.texture?.destroy();
    this.command?.shaderProgram.destroy();
  }
}
export default SceneGISUnderwater;
