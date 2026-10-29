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
import riverFlow from "../../../Shaders/SceneGIS/Water/SceneGISRiverFlow.js";
import regionalShader from "../../../Shaders/SceneGIS/Water/SceneGISWaterRegionalField.js";
import RegionalField from "./_SceneGISWaterRegionalField.js";

const linear = new Sampler({
  minificationFilter: TextureMinificationFilter.LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});
const mipmapped = new Sampler({
  minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});

// Lower envelope of squared-distance parabolas, in metric coordinates.
// Separable Euclidean transform following Felzenszwalb and Huttenlocher (2012).
function distanceLine(input, output, count, spacing, sites, limits) {
  let last = -1;
  for (let q = 0; q < count; ++q) {
    if (!Number.isFinite(input[q])) {
      continue;
    }
    let crossing = -Infinity;
    while (last >= 0) {
      const p = sites[last];
      crossing =
        (input[q] - input[p]) / (2 * spacing * (q - p)) +
        (spacing * (q + p)) / 2;
      if (crossing > limits[last]) {
        break;
      }
      --last;
    }
    sites[++last] = q;
    limits[last] = last === 0 ? -Infinity : crossing;
    limits[last + 1] = Infinity;
  }
  if (last < 0) {
    output.fill(Infinity, 0, count);
    return;
  }
  let site = 0;
  for (let q = 0; q < count; ++q) {
    const x = q * spacing;
    while (limits[site + 1] < x) {
      ++site;
    }
    const p = sites[site];
    output[q] = (x - p * spacing) ** 2 + input[p];
  }
}

function shorelineDistances(depths, width, height, dx, dy, dry) {
  const size = Math.max(width, height);
  const input = new Float64Array(size);
  const output = new Float64Array(size);
  const sites = new Int32Array(size);
  const limits = new Float64Array(size + 1);
  const result = new Float64Array(width * height);
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      input[x] = depths[y * width + x] <= 0 === dry ? 0 : Infinity;
    }
    distanceLine(input, output, width, dx, sites, limits);
    result.set(output.subarray(0, width), y * width);
  }
  for (let x = 0; x < width; ++x) {
    for (let y = 0; y < height; ++y) {
      input[y] = result[y * width + x];
    }
    distanceLine(input, output, height, dy, sites, limits);
    for (let y = 0; y < height; ++y) {
      // Dry samples represent cells; the interface lies between sample centers.
      result[y * width + x] = Number.isFinite(output[y])
        ? Math.max(0, Math.sqrt(output[y]) - Math.min(dx, dy) * 0.5)
        : Math.hypot(width * dx, height * dy);
    }
  }
  return result;
}

function createTarget(context, size) {
  return new Framebuffer({
    context,
    colorTextures: [
      new Texture({
        context,
        width: size,
        height: size,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        sampler: linear,
      }),
    ],
  });
}

/** Surface-owned, camera-independent bathymetry, shallow foam and refracted caustics. @private */
class SceneGISWaterField {
  constructor(options, hierarchy, mesh, domain) {
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
    this.regional = mesh ? new RegionalField(options, mesh, domain) : undefined;
    if (!mesh && options.modelMatrix !== undefined) {
      throw new DeveloperError(
        "Local bathymetry uses the water modelMatrix; do not supply a separate field frame.",
      );
    }
    this.data = new Float32Array(width * height * 4);
    const shore = shorelineDistances(
      depths,
      width,
      height,
      r.width / (width - 1),
      r.height / (height - 1),
      true,
    );
    const water = shorelineDistances(
      depths,
      width,
      height,
      r.width / (width - 1),
      r.height / (height - 1),
      false,
    );
    const edges = mesh ? [] : segments(hierarchy);
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
        if (this.regional) {
          inside = this.regional.surface[i + 3] > 0;
        }
        this.data[i] = depths[y * width + x];
        this.data[i + 1] = inside ? 1 : 0;
        const fade = Math.min(1, Math.sqrt(shoreDistance) / 4);
        this.data[i + 2] =
          this.regional?.tangent[i + 2] ?? fade * fade * (3 - 2 * fade);
        this.data[i + 3] =
          depths[y * width + x] <= 0
            ? -water[y * width + x]
            : shore[y * width + x];
      }
    }
    this.inverse = new Matrix4();
    this.eyeToField = new Matrix4();
    this.light = new Cartesian3();
    this.transport = new Cartesian2();
    this.offset = new Cartesian2();
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
    if (this.regional) {
      for (const name of ["surface", "tangent", "flow"]) {
        if (!this.regional[name]) {
          continue;
        }
        this[`${name}Map`] = new Texture({
          context,
          flipY: false,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: PixelDatatype.FLOAT,
          sampler: linear,
          source: {
            width: this.width,
            height: this.height,
            arrayBufferView: this.regional[name],
          },
        });
      }
    }
    this.size = Math.min(512, Math.max(this.width, this.height));
    this.causticsSize = Math.min(512, Math.max(256, this.size * 2));
    this.gridSize = this.causticsSize / 2;
    this.foam = [
      createTarget(context, this.size),
      createTarget(context, this.size),
    ];
    this.index = 0;
    const viewport = new BoundingRectangle(0, 0, this.size, this.size);
    this.clear = new ClearCommand({
      color: Color.TRANSPARENT,
    });
    for (const f of this.foam) {
      this.clear.framebuffer = f;
      this.clear.execute(context);
    }
    this.uniforms = {
      ...surface._command.uniformMap,
      u_bathymetry: () => this.bed,
      u_previousFoam: () => this.foam[1 - this.index].getColorTexture(0),
      u_fieldRectangle: () => this.rectangle,
      u_fieldDelta: () => this.delta,
      u_fieldReset: () => this.reset,
      u_foamTransport: () => this.transport,
      u_fieldLight: () => this.light,
      u_fieldSpacing: () =>
        Math.max(this.rectangle.z, this.rectangle.w) / this.gridSize,
      u_fieldSurface: () => this.surfaceMap,
      u_fieldTangent: () => this.tangentMap,
      u_fieldFlow: () => this.flowMap,
      u_fieldChartOrigin: () => this.regional.chartOrigin,
      u_fieldWindOrigin: () => {
        const period = surface._windWaves.patchLength * 4;
        const { chartOrigin, windOrigin } = this.regional;
        windOrigin.x = ((chartOrigin.x % period) + period) % period;
        windOrigin.y = ((chartOrigin.y % period) + period) % period;
        return windOrigin;
      },
      u_fieldEast: () => this.regional.east,
    };
    this.foamCommand = context.createViewportQuadCommand(foamShader, {
      owner: this,
      uniformMap: this.uniforms,
      renderState: RenderState.fromCache({ viewport }),
    });
  }

  createCaustics(surface, context) {
    this.caustics = createTarget(context, this.causticsSize);
    const n = this.gridSize,
      positions = new Float32Array((n + 1) ** 2 * 2),
      indices =
        (n + 1) ** 2 > 65535
          ? new Uint32Array(n * n * 6)
          : new Uint16Array(n * n * 6);
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
      uniformMap: this.uniforms,
      framebuffer: this.caustics,
      shaderProgram: ShaderProgram.fromCache({
        context,
        attributeLocations: { position: 0 },
        vertexShaderSource: new ShaderSource({
          defines: [
            ...(surface._windWaves ? ["SCENEGIS_WIND_WAVES"] : []),
            ...(this.regional ? ["SCENEGIS_REGIONAL_FIELD"] : []),
            ...(surface._river
              ? ["SCENEGIS_RIVER_WATER", "SCENEGIS_RIVER_VERTEX"]
              : []),
          ],
          sources: [wavesShader, riverFlow, regionalShader, causticsVS],
        }),
        fragmentShaderSource: causticsFS,
      }),
      renderState: RenderState.fromCache({
        viewport: new BoundingRectangle(
          0,
          0,
          this.causticsSize,
          this.causticsSize,
        ),
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
    Matrix4.inverseTransformation(
      this.regional?.modelMatrix ?? surface.modelMatrix,
      this.inverse,
    );
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
      ...(surface._river
        ? [
            surface._river.currentSpeedScale,
            surface._river.currentRippleAmplitude,
            surface._river.currentRippleLength,
          ]
        : []),
    ];
    if (this.config && config.every((v, i) => v === this.config[i])) {
      return;
    }
    this.reset = !this.config || surface._time < this.config[0];
    this.delta = this.reset ? 0 : surface._time - this.config[0];
    Cartesian2.normalize(direction, this.transport);
    if (this.regional) {
      const { east } = this.regional;
      const x = this.transport.x,
        y = this.transport.y;
      Cartesian2.fromElements(
        east.x * x - east.y * y,
        east.y * x + east.x * y,
        this.transport,
      );
      Cartesian2.normalize(this.transport, this.transport);
    }
    Cartesian2.multiplyByScalar(
      this.transport,
      (surface._windWaves?.windSpeed ?? surface.flowSpeed) * 0.03,
      this.transport,
    );
    Cartesian2.multiplyByScalar(this.transport, surface._time, this.offset);
    this.index = 1 - this.index;
    this.foamCommand.framebuffer = this.foam[this.index];
    this.foamCommand.execute(context);
    if (surface.causticsIntensity > 0) {
      if (!this.caustics) {
        this.createCaustics(surface, context);
      }
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
    this.surfaceMap?.destroy();
    this.tangentMap?.destroy();
    this.flowMap?.destroy();
    this.foam?.forEach((f) => f.destroy());
    this.caustics?.destroy();
    this.foamCommand?.shaderProgram.destroy();
    this.causticsCommand?.shaderProgram.destroy();
    this.vertices?.destroy();
  }
}
export default SceneGISWaterField;
