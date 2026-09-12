import BlendingState from "../../../Scene/BlendingState.js";
import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import Color from "../../../Core/Color.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import defined from "../../../Core/defined.js";
import destroyObject from "../../../Core/destroyObject.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import fragmentShaderSource from "../../../Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarAtmosphereFS.js";
import vertexShaderSource from "../../../Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarAtmosphereVS.js";
import SceneGISPlanarCamera from "./_SceneGISPlanarCamera.js";

const attributeLocations = { position: 0 };
const quad = new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]);
const resourceFactory = {
  createVertexBuffer: (options) => Buffer.createVertexBuffer(options),
  createVertexArray: (options) => new VertexArray(options),
  createShaderProgram: (options) => ShaderProgram.fromCache(options),
  getRenderState: (options) => RenderState.fromCache(options),
};

function destroyCandidate(candidate) {
  if (defined(candidate.vertexArray) && !candidate.vertexArray.isDestroyed()) {
    candidate.vertexArray.destroy();
  }
  if (
    defined(candidate.vertexBuffer) &&
    !candidate.vertexBuffer.isDestroyed()
  ) {
    candidate.vertexBuffer.destroy();
  }
  if (
    defined(candidate.shaderProgram) &&
    !candidate.shaderProgram.isDestroyed()
  ) {
    candidate.shaderProgram.destroy();
  }
}

function createResources(renderer, context) {
  const candidate = {};
  try {
    candidate.vertexBuffer = renderer._resourceFactory.createVertexBuffer({
      context,
      typedArray: quad,
      usage: BufferUsage.STATIC_DRAW,
    });
    candidate.vertexArray = renderer._resourceFactory.createVertexArray({
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
    candidate.vertexBuffer = undefined;
    candidate.shaderProgram = renderer._resourceFactory.createShaderProgram({
      context,
      vertexShaderSource,
      fragmentShaderSource,
      attributeLocations,
    });
    candidate.shaderProgram._bind();
    candidate.command = new DrawCommand({
      vertexArray: candidate.vertexArray,
      shaderProgram: candidate.shaderProgram,
      uniformMap: renderer._uniformMap,
      renderState: renderer._resourceFactory.getRenderState({
        cull: { enabled: false },
        depthTest: { enabled: false },
        depthMask: false,
        blending: BlendingState.ALPHA_BLEND,
      }),
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    });
  } catch (error) {
    destroyCandidate(candidate);
    throw error;
  }

  renderer._context = context;
  renderer._vertexArray = candidate.vertexArray;
  renderer._shaderProgram = candidate.shaderProgram;
  renderer._command = candidate.command;
}

function ensureResources(renderer, context) {
  if (defined(renderer._context) && renderer._context !== context) {
    renderer._releaseResources();
  }
  if (!defined(renderer._context)) {
    createResources(renderer, context);
  }
}

/** @private */
function SceneGISPlanarAtmosphereRenderer() {
  this._context = undefined;
  this._vertexArray = undefined;
  this._shaderProgram = undefined;
  this._command = undefined;
  this._pose = {
    position: new Cartesian3(),
    direction: new Cartesian3(),
    up: new Cartesian3(),
    right: new Cartesian3(),
  };
  this._environmentState = {
    pose: this._pose,
    terrainHeight: 0.0,
    underground: false,
  };
  this._frustumInfo = {};
  this._cameraDirection = new Cartesian3();
  this._cameraRight = new Cartesian3();
  this._cameraUp = new Cartesian3();
  this._frustumSlopes = new Cartesian4();
  this._sunDirection = new Cartesian3();
  this._zenithColor = new Color();
  this._horizonColor = new Color();
  this._backgroundColor = new Color();
  this._cameraHeight = 0.0;
  this._fadeHeight = 1.0;
  this._intensity = 1.0;
  this._perspective = true;
  this._mask = false;
  this._resourceFactory = resourceFactory;

  const that = this;
  this._uniformMap = {
    u_cameraDirection: () => that._cameraDirection,
    u_cameraRight: () => that._cameraRight,
    u_cameraUp: () => that._cameraUp,
    u_frustumSlopes: () => that._frustumSlopes,
    u_sunDirection: () => that._sunDirection,
    u_zenithColor: () => that._zenithColor,
    u_horizonColor: () => that._horizonColor,
    u_backgroundColor: () => that._backgroundColor,
    u_cameraHeight: () => that._cameraHeight,
    u_fadeHeight: () => that._fadeHeight,
    u_intensity: () => that._intensity,
    u_perspective: () => that._perspective,
    u_mask: () => that._mask,
  };
}

SceneGISPlanarAtmosphereRenderer.prototype.prepare = function (
  world,
  frameState,
) {
  SceneGISPlanarCamera.getWorldPose(frameState.camera, this._pose);
  const terrainHeight = world.getTerrainHeight(this._pose.position) ?? 0.0;
  this._environmentState.terrainHeight = terrainHeight;
  this._environmentState.underground = this._pose.position.z < terrainHeight;
  return this._environmentState;
};

SceneGISPlanarAtmosphereRenderer.prototype._setProjection = function (
  frameState,
) {
  const info = SceneGISPlanarCamera.getFrustumInfo(
    frameState.camera.frustum,
    this._frustumInfo,
  );
  Cartesian3.clone(this._pose.direction, this._cameraDirection);
  Cartesian3.clone(this._pose.right, this._cameraRight);
  Cartesian3.clone(this._pose.up, this._cameraUp);
  this._perspective = info.perspective;
  if (info.perspective) {
    this._frustumSlopes.x = info.leftSlope;
    this._frustumSlopes.y = info.rightSlope;
    this._frustumSlopes.z = info.bottomSlope;
    this._frustumSlopes.w = info.topSlope;
  } else {
    this._frustumSlopes.x = 0.0;
    this._frustumSlopes.y = 0.0;
    this._frustumSlopes.z = 0.0;
    this._frustumSlopes.w = 0.0;
  }
};

SceneGISPlanarAtmosphereRenderer.prototype.render = function (
  environment,
  frameState,
  passState,
  environmentState,
) {
  this._setProjection(frameState);
  Cartesian3.clone(environment._effectiveSunDirection, this._sunDirection);
  Color.clone(environment._atmosphereZenithColor, this._zenithColor);
  Color.clone(environment._atmosphereHorizonColor, this._horizonColor);
  this._cameraHeight = Math.max(
    environmentState.pose.position.z - environmentState.terrainHeight,
    0.0,
  );
  this._fadeHeight = environment._atmosphereFadeHeight;
  this._intensity = environment._atmosphereIntensity;
  this._mask = false;
  ensureResources(this, frameState.context);
  this._command.execute(frameState.context, passState);
};

SceneGISPlanarAtmosphereRenderer.prototype.renderMask = function (
  frameState,
  passState,
  backgroundColor,
) {
  Color.clone(backgroundColor, this._backgroundColor);
  this._mask = true;
  ensureResources(this, frameState.context);
  this._command.execute(frameState.context, passState);
};

SceneGISPlanarAtmosphereRenderer.prototype._ensureResources = function (
  context,
) {
  ensureResources(this, context);
};

SceneGISPlanarAtmosphereRenderer.prototype._releaseResources = function () {
  if (defined(this._vertexArray) && !this._vertexArray.isDestroyed()) {
    this._vertexArray.destroy();
  }
  if (defined(this._shaderProgram) && !this._shaderProgram.isDestroyed()) {
    this._shaderProgram.destroy();
  }
  this._context = undefined;
  this._vertexArray = undefined;
  this._shaderProgram = undefined;
  this._command = undefined;
};

SceneGISPlanarAtmosphereRenderer.prototype.isDestroyed = function () {
  return false;
};

SceneGISPlanarAtmosphereRenderer.prototype.destroy = function () {
  this._releaseResources();
  return destroyObject(this);
};

export default SceneGISPlanarAtmosphereRenderer;
