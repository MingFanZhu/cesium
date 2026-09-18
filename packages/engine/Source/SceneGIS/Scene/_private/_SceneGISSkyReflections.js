import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import destroyObject from "../../../Core/destroyObject.js";
import Matrix3 from "../../../Core/Matrix3.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import CubeMap from "../../../Renderer/CubeMap.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import convolve from "../../../Shaders/ConvolveSpecularMapFS.js";
import definitions from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonDefinitions.js";
import common from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonCommon.js";
import runtime from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonRuntime.js";
import atmosphere from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import capture from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISSkyReflectionFS.js";
import copy from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISSkyReflectionCopyFS.js";
import vertex from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISSkyReflectionVS.js";

const size = 128;
const maximumLod = 7;
const minimumDirectionDot = Math.cos(Math.PI / 1800.0);
const localSun = new Cartesian3();

function createResources(probe, context) {
  const options = {
    context,
    width: size,
    height: size,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
  };
  probe._source = new CubeMap(options);
  probe.texture = new CubeMap(options);
  probe.texture.generateMipmap();
  probe.texture.sampler = new Sampler({
    minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  });
  const globe = probe._renderer._mode === "globe";
  const source = new ShaderSource({
    defines: globe
      ? [
          "SCENEGIS_GLOBE",
          "COMBINED_SCATTERING_TEXTURES",
          "TRANSMITTANCE_TEXTURE_WIDTH 256",
          "TRANSMITTANCE_TEXTURE_HEIGHT 64",
          "SCATTERING_TEXTURE_R_SIZE 32",
          "SCATTERING_TEXTURE_MU_SIZE 128",
          "SCATTERING_TEXTURE_MU_S_SIZE 32",
          "SCATTERING_TEXTURE_NU_SIZE 8",
          "IRRADIANCE_TEXTURE_WIDTH 64",
          "IRRADIANCE_TEXTURE_HEIGHT 16",
        ]
      : [],
    sources: globe
      ? [definitions, common, runtime, atmosphere, capture]
      : [atmosphere, capture],
  });
  const uniforms = {
    u_face: () => probe._face,
    u_sunDirection: () => probe._sun,
    u_altitude: () => probe._altitude,
    u_transmittanceTexture: () => probe._resources.transmittanceTexture,
    u_scatteringTexture: () => probe._resources.scatteringTexture,
    u_irradianceTexture: () => probe._resources.irradianceTexture,
    u_radianceTexture: () => probe._source,
    // Native convolution expects alpha, whereas native model LOD uses perceptual roughness.
    u_roughness: () => (probe._level / maximumLod) ** 2,
    u_faceDirection: () => Cartesian3.UNIT_Z,
  };
  probe._commands = [source, copy, convolve].map(
    (fragmentShaderSource) =>
      new DrawCommand({
        vertexArray: context.getViewportQuadVertexArray(),
        shaderProgram: ShaderProgram.fromCache({
          context,
          vertexShaderSource: vertex,
          fragmentShaderSource,
          attributeLocations: { position: 0 },
        }),
        uniformMap: uniforms,
        owner: probe,
      }),
  );
  for (let level = 0; level <= maximumLod; level++) {
    const width = size >> level;
    probe._states.push(
      RenderState.fromCache({
        viewport: new BoundingRectangle(0, 0, width, width),
      }),
    );
    for (const face of CubeMap.faceNames()) {
      if (level === 0) {
        probe._sourceFrames.push(
          new Framebuffer({
            context,
            colorTextures: [probe._source[face]],
            destroyAttachments: false,
          }),
        );
      }
      probe._frames.push(
        new Framebuffer({
          context,
          colorTextures: [probe.texture[face]],
          colorTextureMipLevel: level,
          destroyAttachments: false,
        }),
      );
    }
  }
}

/** Shared regional HDR sky source. Only the environment renderer owns these resources. @private */
function SceneGISSkyReflections(renderer) {
  this._renderer = renderer;
  this.texture = undefined;
  this.maximumMipmapLevel = maximumLod;
  this.worldToLocal = Matrix3.clone(Matrix3.IDENTITY);
  this._sun = new Cartesian3();
  this._east = new Cartesian3();
  this._vertical = new Cartesian3();
  this._altitude = undefined;
  this._resources = undefined;
  this._frames = [];
  this._sourceFrames = [];
  this._states = [];
  this._commands = [];
  this.generation = 0;
}

SceneGISSkyReflections.prototype.update = function (frameState) {
  const renderer = this._renderer;
  const frame = renderer._frame;
  Cartesian3.fromElements(
    Cartesian3.dot(renderer._sunDirection, frame.east),
    Cartesian3.dot(renderer._sunDirection, frame.north),
    Cartesian3.dot(renderer._sunDirection, frame.vertical),
    localSun,
  );
  if (
    this._resources === renderer._resources &&
    Math.abs(this._altitude - frame.altitude) < 100.0 &&
    Cartesian3.dot(this._sun, localSun) > minimumDirectionDot &&
    Cartesian3.dot(this._east, frame.east) > minimumDirectionDot &&
    Cartesian3.dot(this._vertical, frame.vertical) > minimumDirectionDot
  ) {
    return;
  }
  const context = frameState.context;
  if (!this.texture) {
    createResources(this, context);
  }
  this._resources = renderer._resources;
  this._altitude = frame.altitude;
  Cartesian3.clone(localSun, this._sun);
  Cartesian3.clone(frame.east, this._east);
  Cartesian3.clone(frame.vertical, this._vertical);
  Matrix3.fromRowMajorArray(
    [
      frame.east.x,
      frame.east.y,
      frame.east.z,
      frame.north.x,
      frame.north.y,
      frame.north.z,
      frame.vertical.x,
      frame.vertical.y,
      frame.vertical.z,
    ],
    this.worldToLocal,
  );
  const captureCommand = this._commands[0];
  captureCommand.renderState = this._states[0];
  for (this._face = 0; this._face < 6; this._face++) {
    captureCommand.framebuffer = this._sourceFrames[this._face];
    captureCommand.execute(context);
  }
  for (this._level = 0; this._level <= maximumLod; this._level++) {
    const command = this._commands[this._level === 0 ? 1 : 2];
    command.renderState = this._states[this._level];
    for (this._face = 0; this._face < 6; this._face++) {
      command.framebuffer = this._frames[this._level * 6 + this._face];
      command.execute(context);
    }
  }
  this.generation++;
};

SceneGISSkyReflections.prototype.isDestroyed = function () {
  return false;
};
SceneGISSkyReflections.prototype.destroy = function () {
  for (const framebuffer of [...this._sourceFrames, ...this._frames]) {
    framebuffer.destroy();
  }
  for (const command of this._commands) {
    command.shaderProgram.destroy();
  }
  this._source = this._source?.destroy();
  this.texture = this.texture?.destroy();
  return destroyObject(this);
};

export default SceneGISSkyReflections;
