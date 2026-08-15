import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import defined from "../../../Core/defined.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import PassState from "../../../Renderer/PassState.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import Texture3D from "../../../Renderer/Texture3D.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import brunetonCommonSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonCommon.js";
import brunetonDefinitionsSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonDefinitions.js";
import brunetonRuntimeSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonRuntime.js";
import aerialFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS.js";
import atmosphereSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import backgroundFragmentSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsBackgroundFS.js";
import vertexSource from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsVS.js";
import SceneGISAtmosphereReferenceFrame from "./_SceneGISAtmosphereReferenceFrame.js";
import SceneGISEnvironmentEffectsPipeline from "./_SceneGISEnvironmentEffectsPipeline.js";

const attributeLocations = { position: 0 };
const fullscreenQuad = new Float32Array([
  -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0,
]);
const linearSampler = new Sampler();

function destroyResource(resource) {
  if (
    defined(resource) &&
    (typeof resource.isDestroyed !== "function" || !resource.isDestroyed())
  ) {
    resource.destroy();
  }
}

function destroyResources(resources) {
  if (!defined(resources)) {
    return;
  }
  destroyResource(resources.aerialFramebuffer);
  destroyResource(resources.backgroundProgram);
  destroyResource(resources.aerialProgram);
  destroyResource(resources.aerialLogDepthProgram);
  destroyResource(resources.vertexArray);
  destroyResource(resources.vertexBuffer);
  destroyResource(resources.transmittanceTexture);
  destroyResource(resources.scatteringTexture);
  destroyResource(resources.irradianceTexture);
}

function createTexture2D(context, width, height, buffer) {
  return new Texture({
    context,
    width,
    height,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
    source: { arrayBufferView: new Uint16Array(buffer) },
    sampler: linearSampler,
    flipY: false,
  });
}

function createTexture3D(context, width, height, depth, buffer) {
  return new Texture3D({
    context,
    width,
    height,
    depth,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
    source: { arrayBufferView: new Uint16Array(buffer) },
    sampler: linearSampler,
    flipY: false,
  });
}

function createProgram(context, fragmentSource, globe, additionalDefines) {
  const defines = globe
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
    : [];
  if (defined(additionalDefines)) {
    defines.push(...additionalDefines);
  }
  const sources = globe
    ? [
        brunetonDefinitionsSource,
        brunetonCommonSource,
        brunetonRuntimeSource,
        atmosphereSource,
        fragmentSource,
      ]
    : [atmosphereSource, fragmentSource];
  const fragmentShaderSource = new ShaderSource({
    defines,
    sources,
  });
  const program = ShaderProgram.fromCache({
    context,
    vertexShaderSource: vertexSource,
    fragmentShaderSource,
    attributeLocations,
  });
  try {
    program._bind();
  } catch (error) {
    destroyResource(program);
    throw error;
  }
  return program;
}

function createResources(renderer, context, buffers) {
  const candidate = {};
  try {
    candidate.vertexBuffer = Buffer.createVertexBuffer({
      context,
      typedArray: fullscreenQuad,
      usage: BufferUsage.STATIC_DRAW,
    });
    candidate.vertexArray = new VertexArray({
      context,
      attributes: [
        {
          index: attributeLocations.position,
          vertexBuffer: candidate.vertexBuffer,
          componentsPerAttribute: 2,
          componentDatatype: ComponentDatatype.FLOAT,
        },
      ],
    });
    // VertexArray owns its vertex buffers after successful construction.
    candidate.vertexBuffer = undefined;
    const globe = renderer._mode === SceneGISAtmosphereReferenceFrame.GLOBE;
    candidate.backgroundProgram = createProgram(
      context,
      backgroundFragmentSource,
      globe,
    );
    candidate.aerialProgram = createProgram(
      context,
      aerialFragmentSource,
      globe,
    );
    candidate.aerialLogDepthProgram = createProgram(
      context,
      aerialFragmentSource,
      globe,
      ["LOG_DEPTH_READ_ONLY"],
    );
    candidate.transmittanceTexture = createTexture2D(
      context,
      256,
      64,
      buffers.transmittance,
    );
    candidate.scatteringTexture = createTexture3D(
      context,
      256,
      128,
      32,
      buffers.scattering,
    );
    candidate.irradianceTexture = createTexture2D(
      context,
      64,
      16,
      buffers.irradiance,
    );
    const renderState = RenderState.fromCache({
      cull: { enabled: false },
      depthTest: { enabled: false },
      depthMask: false,
    });
    candidate.backgroundCommand = new DrawCommand({
      vertexArray: candidate.vertexArray,
      shaderProgram: candidate.backgroundProgram,
      uniformMap: renderer._uniformMap,
      renderState,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    });
    candidate.aerialCommand = new DrawCommand({
      vertexArray: candidate.vertexArray,
      shaderProgram: candidate.aerialProgram,
      uniformMap: renderer._uniformMap,
      renderState,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    });
  } catch (error) {
    destroyResources(candidate);
    throw error;
  }
  return candidate;
}

function updateFrustum(renderer, camera) {
  void camera.frustum.projectionMatrix;
  const frustum = camera.frustum.offCenterFrustum ?? camera.frustum;
  const perspective = renderer._frame.projection === "perspective";
  renderer._perspective = perspective;
  const divisor = perspective ? frustum.near : 1.0;
  Cartesian4.fromElements(
    frustum.left / divisor,
    frustum.right / divisor,
    frustum.bottom / divisor,
    frustum.top / divisor,
    renderer._frustum,
  );
}

function updateFrame(renderer, scene, frameState) {
  SceneGISAtmosphereReferenceFrame.publish(
    {
      mode: renderer._mode,
      scene,
      world: renderer._world,
      baseHeight: 0.0,
    },
    renderer._frame,
    renderer._scratchFrame,
  );
  updateFrustum(renderer, frameState.camera);
  const sunDirection =
    renderer._mode === SceneGISAtmosphereReferenceFrame.GLOBE
      ? frameState.context.uniformState.sunDirectionWC
      : renderer._world.environment._effectiveSunDirection;
  Cartesian3.clone(sunDirection, renderer._sunDirection);
}

function isUnderground(renderer) {
  if (renderer._mode === SceneGISAtmosphereReferenceFrame.GLOBE) {
    return renderer._frame.altitude < 0.0;
  }
  const terrainHeight =
    renderer._world.getTerrainHeight(renderer._frame.cameraPosition) ?? 0.0;
  return renderer._frame.cameraPosition.z < terrainHeight;
}

/**
 * A2 renderer and resource owner for the A1 advanced-environment slots.
 *
 * @private
 */
function SceneGISEnvironmentEffectsRenderer(options) {
  SceneGISEnvironmentEffectsPipeline.call(this);
  this._mode = options.mode;
  this._world = options.world;
  this._owner = options.owner;
  this._resources = undefined;
  this._showAtmosphere = true;
  this._showAerialPerspective = true;
  this._frame = SceneGISAtmosphereReferenceFrame.createSnapshot();
  this._scratchFrame = SceneGISAtmosphereReferenceFrame.createSnapshot();
  this._frustum = new Cartesian4();
  this._sunDirection = new Cartesian3();
  this._perspective = true;
  this._inputColorTexture = undefined;
  this._depthTexture = undefined;
  this._aerialPassState = undefined;

  const that = this;
  this._uniformMap = {
    u_perspective: () => that._perspective,
    u_frustum: () => that._frustum,
    u_cameraDirection: () => that._frame.cameraDirection,
    u_cameraRight: () => that._frame.cameraRight,
    u_cameraUp: () => that._frame.cameraUp,
    u_east: () => that._frame.east,
    u_north: () => that._frame.north,
    u_vertical: () => that._frame.vertical,
    u_sunDirection: () => that._sunDirection,
    u_altitude: () => that._frame.altitude,
    u_backgroundRadianceScale: () => that._owner._backgroundRadianceScale,
    u_aerialRadianceScale: () => that._owner._aerialRadianceScale,
    u_colorTexture: () => that._inputColorTexture,
    u_depthTexture: () => that._depthTexture,
    u_transmittanceTexture: () => that._resources?.transmittanceTexture,
    u_scatteringTexture: () => that._resources?.scatteringTexture,
    u_irradianceTexture: () => that._resources?.irradianceTexture,
  };
}

SceneGISEnvironmentEffectsRenderer.prototype = Object.create(
  SceneGISEnvironmentEffectsPipeline.prototype,
);
SceneGISEnvironmentEffectsRenderer.prototype.constructor =
  SceneGISEnvironmentEffectsRenderer;

SceneGISEnvironmentEffectsRenderer.prototype.publishResources = function (
  context,
  buffers,
) {
  const candidate = createResources(this, context, buffers);
  const previous = this._resources;
  this._resources = candidate;
  destroyResources(previous);
};

SceneGISEnvironmentEffectsRenderer.prototype.hasResources = function () {
  return defined(this._resources);
};

SceneGISEnvironmentEffectsRenderer.prototype.setShow = function (
  showAtmosphere,
  showAerialPerspective,
) {
  this._showAtmosphere = showAtmosphere;
  this._showAerialPerspective = showAerialPerspective;
};

SceneGISEnvironmentEffectsRenderer.prototype.renderBackground = function (
  frameState,
  passState,
) {
  if (!this._showAtmosphere || !defined(this._resources)) {
    return;
  }
  if (!this._owner._validateRenderFrame()) {
    return;
  }
  updateFrame(this, this._scene, frameState);
  if (isUnderground(this)) {
    return;
  }
  this._resources.backgroundCommand.execute(frameState.context, passState);
};

function ensureAerialFramebuffer(renderer, context, width, height) {
  const current = renderer._resources.aerialFramebuffer;
  if (
    defined(current) &&
    !current.isDirty(
      width,
      height,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    )
  ) {
    return current;
  }
  const candidate = new FramebufferManager({
    depth: false,
    depthStencil: false,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
    pixelFormat: PixelFormat.RGBA,
  });
  try {
    candidate.update(
      context,
      width,
      height,
      1,
      PixelDatatype.HALF_FLOAT,
      PixelFormat.RGBA,
    );
  } catch (error) {
    candidate.destroy();
    throw error;
  }
  renderer._resources.aerialFramebuffer = candidate;
  destroyResource(current);
  return candidate;
}

SceneGISEnvironmentEffectsRenderer.prototype.executeHdr = function (
  context,
  colorTexture,
  depthTexture,
  idTexture,
) {
  void idTexture;
  if (!this._showAerialPerspective || !defined(this._resources)) {
    return colorTexture;
  }
  if (!this._owner._validateRenderFrame()) {
    return colorTexture;
  }
  updateFrame(this, this._scene, this._scene.frameState);
  if (isUnderground(this)) {
    return colorTexture;
  }
  const framebuffer = ensureAerialFramebuffer(
    this,
    context,
    colorTexture.width,
    colorTexture.height,
  );
  this._inputColorTexture = colorTexture;
  this._depthTexture = depthTexture;
  const command = this._resources.aerialCommand;
  command.shaderProgram = this._scene.frameState.useLogDepth
    ? this._resources.aerialLogDepthProgram
    : this._resources.aerialProgram;
  command.framebuffer = framebuffer.framebuffer;
  if (!defined(this._aerialPassState)) {
    this._aerialPassState = new PassState(context);
    this._aerialPassState.viewport = new BoundingRectangle();
  }
  const viewport = this._aerialPassState.viewport;
  viewport.x = 0;
  viewport.y = 0;
  viewport.width = colorTexture.width;
  viewport.height = colorTexture.height;
  try {
    command.execute(context, this._aerialPassState);
  } finally {
    this._inputColorTexture = undefined;
    this._depthTexture = undefined;
  }
  return framebuffer.getColorTexture(0);
};

SceneGISEnvironmentEffectsRenderer.prototype.releaseResources = function () {
  destroyResources(this._resources);
  this._resources = undefined;
};

SceneGISEnvironmentEffectsRenderer.prototype.destroy = function () {
  this.releaseResources();
  return SceneGISEnvironmentEffectsPipeline.prototype.destroy.call(this);
};

export default SceneGISEnvironmentEffectsRenderer;
