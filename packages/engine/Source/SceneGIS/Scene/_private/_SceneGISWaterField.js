import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import Color from "../../../Core/Color.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import BlendFunction from "../../../Scene/BlendFunction.js";
import { segments, distanceSquared } from "./_SceneGISWaterMesh.js";
import foamShader from "../../../Shaders/SceneGIS/Water/SceneGISWaterFieldFS.js";
import wavesShader from "../../../Shaders/SceneGIS/Water/SceneGISWaterFieldWaves.js";
import causticsVS from "../../../Shaders/SceneGIS/Water/SceneGISWaterCausticsVS.js";
import causticsFS from "../../../Shaders/SceneGIS/Water/SceneGISWaterCausticsFS.js";

const linear = new Sampler({
  minificationFilter: TextureMinificationFilter.LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});
const mipmapped = new Sampler({
  minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});

/** Surface-owned, camera-independent bathymetry, shallow foam and refracted caustics. @private */
class SceneGISWaterField {
  constructor(options, hierarchy) {
    const { width, height, depths, rectangle: r } = options;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 2 ||
      height < 2 ||
      width > 1024 ||
      height > 1024 ||
      !(depths instanceof Float32Array) ||
      depths.length !== width * height ||
      !depths.every(Number.isFinite) ||
      !r ||
      ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
      r.width <= 0 ||
      r.height <= 0
    ) {
      throw new DeveloperError(
        "bathymetry requires a finite rectangle, dimensions in [2, 1024] and width * height Float32Array depths.",
      );
    }
    this.rectangle = new Cartesian4(r.x, r.y, r.width, r.height);
    this.width = width;
    this.height = height;
    this.data = new Float32Array(width * height * 4);
    const edges = segments(hierarchy);
    for (let y = 0; y < height; ++y) {
      for (let x = 0; x < width; ++x) {
        const px = r.x + (x / (width - 1)) * r.width,
          py = r.y + (y / (height - 1)) * r.height;
        let inside = false,
          shoreDistance = 16;
        for (const [a, b] of edges) {
          shoreDistance = Math.min(
            shoreDistance,
            distanceSquared(px, py, a, b),
          );
          if (
            a.y > py !== b.y > py &&
            px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x
          ) {
            inside = !inside;
          }
        }
        const i = (y * width + x) * 4;
        this.data[i] = depths[y * width + x];
        this.data[i + 1] = inside ? 1 : 0;
        const fade = Math.min(1, Math.sqrt(shoreDistance) / 4);
        this.data[i + 2] = fade * fade * (3 - 2 * fade);
      }
    }
    this.inverse = new Matrix4();
    this.light = new Cartesian3();
    this.transport = new Cartesian2();
  }

  create(surface, context) {
    if (!context.textureFloatLinear) {
      throw new RuntimeError(
        "Water bathymetry requires floating-point texture filtering.",
      );
    }
    this.bed = new Texture({
      context,
      flipY: false,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      sampler: linear,
      source: {
        width: this.width,
        height: this.height,
        arrayBufferView: this.data,
      },
    });
    this.size = Math.min(512, Math.max(this.width, this.height));
    const target = () =>
      new Framebuffer({
        context,
        colorTextures: [
          new Texture({
            context,
            width: this.size,
            height: this.size,
            pixelFormat: PixelFormat.RGBA,
            pixelDatatype: PixelDatatype.HALF_FLOAT,
            sampler: linear,
          }),
        ],
      });
    this.foam = [target(), target()];
    this.caustics = target();
    this.index = 0;
    const viewport = new BoundingRectangle(0, 0, this.size, this.size);
    this.clear = new ClearCommand({
      color: Color.TRANSPARENT,
      renderState: RenderState.fromCache({ viewport }),
    });
    for (const f of [...this.foam, this.caustics]) {
      this.clear.framebuffer = f;
      this.clear.execute(context);
    }
    const uniforms = {
      ...surface._command.uniformMap,
      u_bathymetry: () => this.bed,
      u_previousFoam: () => this.foam[1 - this.index].getColorTexture(0),
      u_fieldRectangle: () => this.rectangle,
      u_fieldDelta: () => this.delta,
      u_fieldReset: () => this.reset,
      u_foamTransport: () => this.transport,
      u_fieldLight: () => this.light,
      u_fieldSpacing: () => Math.max(this.rectangle.z, this.rectangle.w) / 128,
    };
    this.foamCommand = context.createViewportQuadCommand(foamShader, {
      owner: this,
      uniformMap: uniforms,
      renderState: RenderState.fromCache({ viewport }),
    });
    const n = 128,
      positions = new Float32Array((n + 1) ** 2 * 2),
      indices = new Uint16Array(n * n * 6);
    for (let y = 0; y <= n; ++y) {
      for (let x = 0; x <= n; ++x) {
        const i = y * (n + 1) + x;
        positions[i * 2] = x / n;
        positions[i * 2 + 1] = y / n;
        if (x < n && y < n) {
          indices.set(
            [i, i + 1, i + n + 1, i + 1, i + n + 2, i + n + 1],
            (y * n + x) * 6,
          );
        }
      }
    }
    this.vertices = VertexArray.fromGeometry({
      context,
      bufferUsage: BufferUsage.STATIC_DRAW,
      attributeLocations: { position: 0 },
      geometry: new Geometry({
        attributes: {
          position: new GeometryAttribute({
            componentDatatype: ComponentDatatype.FLOAT,
            componentsPerAttribute: 2,
            values: positions,
          }),
        },
        indices,
      }),
    });
    this.causticsCommand = new DrawCommand({
      owner: this,
      vertexArray: this.vertices,
      uniformMap: uniforms,
      framebuffer: this.caustics,
      shaderProgram: ShaderProgram.fromCache({
        context,
        attributeLocations: { position: 0 },
        vertexShaderSource: new ShaderSource({
          defines: surface._windWaves ? ["SCENEGIS_WIND_WAVES"] : [],
          sources: [wavesShader, causticsVS],
        }),
        fragmentShaderSource: causticsFS,
      }),
      renderState: RenderState.fromCache({
        viewport,
        depthMask: false,
        blending: {
          enabled: true,
          functionSourceRgb: BlendFunction.ONE,
          functionDestinationRgb: BlendFunction.ONE,
          functionSourceAlpha: BlendFunction.ONE,
          functionDestinationAlpha: BlendFunction.ONE,
        },
      }),
    });
  }

  update(surface, frameState) {
    if (surface.foamIntensity === 0 && surface.causticsIntensity === 0) {
      return;
    }
    const context = frameState.context;
    if (!this.bed) {
      this.create(surface, context);
    }
    Matrix4.inverseTransformation(surface.modelMatrix, this.inverse);
    Matrix4.multiplyByPointAsVector(
      this.inverse,
      context.uniformState.lightDirectionWC,
      this.light,
    );
    const direction =
      surface._windWaves?.windDirection ?? surface.flowDirection;
    const config = [
      surface._time,
      surface.foamIntensity,
      surface.foamWidth,
      surface.causticsIntensity,
      surface.flowSpeed,
      surface.waveAmplitude,
      surface.waveLength,
      direction.x,
      direction.y,
      this.light.x,
      this.light.y,
      this.light.z,
      ...(surface._windWaves?._state.config ?? []),
    ];
    if (this.config && config.every((v, i) => v === this.config[i])) {
      return;
    }
    this.reset = !this.config || surface._time < this.config[0];
    this.delta = this.reset ? 0 : surface._time - this.config[0];
    Cartesian2.normalize(direction, this.transport);
    Cartesian2.multiplyByScalar(
      this.transport,
      (surface._windWaves?.windSpeed ?? surface.flowSpeed) * 0.03,
      this.transport,
    );
    this.index = 1 - this.index;
    this.foamCommand.framebuffer = this.foam[this.index];
    this.foamCommand.execute(context);
    if (surface.causticsIntensity > 0) {
      this.clear.framebuffer = this.caustics;
      this.clear.execute(context);
      this.causticsCommand.execute(context);
      const texture = this.caustics.getColorTexture(0);
      texture.generateMipmap();
      texture.sampler = mipmapped;
    }
    this.config = config;
  }

  destroy() {
    this.bed?.destroy();
    this.foam?.forEach((f) => f.destroy());
    this.caustics?.destroy();
    this.foamCommand?.shaderProgram.destroy();
    this.causticsCommand?.shaderProgram.destroy();
    this.vertices?.destroy();
  }
}
export default SceneGISWaterField;
