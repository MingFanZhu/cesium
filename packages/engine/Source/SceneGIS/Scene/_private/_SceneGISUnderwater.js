import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Matrix3 from "../../../Core/Matrix3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import ray from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRRay.js";
import optics from "../../../Shaders/SceneGIS/Water/SceneGISWaterOptics.js";
import effects from "../../../Shaders/SceneGIS/Water/SceneGISWaterEffects.js";
import fragment from "../../../Shaders/SceneGIS/Water/SceneGISUnderwaterFS.js";
import EnvironmentLighting from "./_SceneGISModelEnvironmentLighting.js";

/** Finite local-water medium. Surface-owned, with no full-resolution targets. @private */
class SceneGISUnderwater {
  constructor(hierarchy) {
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
    visit(hierarchy);
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
    this.active = false;
  }

  update(surface, frameState) {
    Matrix4.inverseTransformation(surface.modelMatrix, this.inverse);
    Matrix4.multiplyByPoint(
      this.inverse,
      frameState.camera.positionWC,
      this.camera,
    );
    const p = this.camera,
      e = this.edges;
    let inside = false;
    for (let i = 0; i < e.length; i += 4) {
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
  }

  draw(surface, scene, passState) {
    if (!this.active) {
      return;
    }
    const context = scene.context;
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
      source.sources.push(ray, optics, effects, fragment);
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
