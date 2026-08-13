import BlendingState from "../../../Scene/BlendingState.js";
import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import defined from "../../../Core/defined.js";
import destroyObject from "../../../Core/destroyObject.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import fragmentShaderSource from "../../../Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarCelestialBodyFS.js";
import vertexShaderSource from "../../../Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarCelestialBodyVS.js";
import SceneGISPlanarCamera from "./_SceneGISPlanarCamera.js";

const attributeLocations = { position: 0 };
const quad = new Float32Array([
  -1.25, -1.25, 1.25, -1.25, -1.25, 1.25, 1.25, 1.25,
]);
const resourceFactory = {
  createVertexBuffer: function (options) {
    return Buffer.createVertexBuffer(options);
  },
  createVertexArray: function (options) {
    return new VertexArray(options);
  },
  createShaderProgram: function (options) {
    return ShaderProgram.fromCache(options);
  },
  getRenderState: function (options) {
    return RenderState.fromCache(options);
  },
};

function createBodyState(type) {
  const state = {
    center: new Cartesian2(),
    scale: new Cartesian2(),
    color: new Color(),
    type,
  };
  state.uniformMap = {
    u_center: () => state.center,
    u_scale: () => state.scale,
    u_color: () => state.color,
    u_bodyType: () => state.type,
  };
  return state;
}

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

    const renderState = renderer._resourceFactory.getRenderState({
      cull: { enabled: false },
      depthTest: { enabled: false },
      depthMask: false,
      blending: BlendingState.ALPHA_BLEND,
    });
    candidate.sunCommand = new DrawCommand({
      vertexArray: candidate.vertexArray,
      shaderProgram: candidate.shaderProgram,
      uniformMap: renderer._sun.uniformMap,
      renderState,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      count: 4,
      owner: renderer,
    });
    candidate.moonCommand = new DrawCommand({
      vertexArray: candidate.vertexArray,
      shaderProgram: candidate.shaderProgram,
      uniformMap: renderer._moon.uniformMap,
      renderState,
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
  renderer._sunCommand = candidate.sunCommand;
  renderer._moonCommand = candidate.moonCommand;
}

function ensureResources(renderer, context) {
  if (defined(renderer._context) && renderer._context !== context) {
    renderer._releaseResources();
  }
  if (!defined(renderer._context)) {
    createResources(renderer, context);
  }
}

function projectBody(
  renderer,
  direction,
  pixelSize,
  state,
  frameState,
  passState,
) {
  if (direction.z <= 0.0) {
    return false;
  }
  const pose = renderer._pose;
  const forward = Cartesian3.dot(direction, pose.direction);
  if (!(forward > 0.0)) {
    return false;
  }
  const right = Cartesian3.dot(direction, pose.right) / forward;
  const up = Cartesian3.dot(direction, pose.up) / forward;
  const info = renderer._frustumInfo;
  if (info.perspective) {
    state.center.x =
      (2.0 * right - info.leftSlope - info.rightSlope) /
      info.horizontalSlopeSpan;
    state.center.y =
      (2.0 * up - info.bottomSlope - info.topSlope) / info.verticalSlopeSpan;
  } else {
    state.center.x = right - (2.0 * info.centerX) / info.horizontalSpan;
    state.center.y = up - (2.0 * info.centerY) / info.verticalSpan;
  }

  const context = frameState.context;
  const canvas = context.canvas;
  const drawingWidth = context.drawingBufferWidth;
  const drawingHeight = context.drawingBufferHeight;
  const canvasCssWidth = canvas.clientWidth || drawingWidth;
  const canvasCssHeight = canvas.clientHeight || drawingHeight;
  const viewport = passState?.viewport;
  const cssWidth = defined(viewport)
    ? viewport.width * (canvasCssWidth / drawingWidth)
    : canvasCssWidth;
  const cssHeight = defined(viewport)
    ? viewport.height * (canvasCssHeight / drawingHeight)
    : canvasCssHeight;
  state.scale.x = pixelSize / cssWidth;
  state.scale.y = pixelSize / cssHeight;
  return (
    state.center.x + state.scale.x * 1.25 >= -1.0 &&
    state.center.x - state.scale.x * 1.25 <= 1.0 &&
    state.center.y + state.scale.y * 1.25 >= -1.0 &&
    state.center.y - state.scale.y * 1.25 <= 1.0
  );
}

/** @private */
function SceneGISPlanarCelestialBodyRenderer() {
  this._context = undefined;
  this._vertexArray = undefined;
  this._shaderProgram = undefined;
  this._sunCommand = undefined;
  this._moonCommand = undefined;
  this._sun = createBodyState(0.0);
  this._moon = createBodyState(1.0);
  this._pose = {
    position: new Cartesian3(),
    direction: new Cartesian3(),
    up: new Cartesian3(),
    right: new Cartesian3(),
  };
  this._frustumInfo = {};
  this._resourceFactory = resourceFactory;
}

SceneGISPlanarCelestialBodyRenderer.prototype._projectBody = function (
  direction,
  pixelSize,
  state,
  frameState,
  passState,
) {
  SceneGISPlanarCamera.getFrustumInfo(
    frameState.camera.frustum,
    this._frustumInfo,
  );
  return projectBody(this, direction, pixelSize, state, frameState, passState);
};

SceneGISPlanarCelestialBodyRenderer.prototype._ensureResources = function (
  context,
) {
  ensureResources(this, context);
};

SceneGISPlanarCelestialBodyRenderer.prototype.render = function (
  world,
  environment,
  frameState,
  passState,
) {
  environment._validateNativeBodyConflict(environment._scene);
  const context = frameState.context;
  SceneGISPlanarCamera.getWorldPose(frameState.camera, this._pose);
  const terrainHeight = world.getTerrainHeight(this._pose.position) ?? 0.0;
  if (this._pose.position.z < terrainHeight) {
    return;
  }

  SceneGISPlanarCamera.getFrustumInfo(
    frameState.camera.frustum,
    this._frustumInfo,
  );

  const renderSun =
    environment._showSun &&
    projectBody(
      this,
      environment._effectiveSunDirection,
      environment._sunPixelSize,
      this._sun,
      frameState,
      passState,
    );
  const renderMoon =
    environment._showMoon &&
    projectBody(
      this,
      environment._effectiveMoonDirection,
      environment._moonPixelSize,
      this._moon,
      frameState,
      passState,
    );
  if (!renderSun && !renderMoon) {
    return;
  }

  Color.clone(environment._sunColor, this._sun.color);
  Color.clone(environment._moonColor, this._moon.color);
  ensureResources(this, context);
  if (renderSun) {
    this._sunCommand.execute(context, passState);
  }
  if (renderMoon) {
    this._moonCommand.execute(context, passState);
  }
};

SceneGISPlanarCelestialBodyRenderer.prototype.isDestroyed = function () {
  return false;
};

SceneGISPlanarCelestialBodyRenderer.prototype._releaseResources = function () {
  if (defined(this._vertexArray) && !this._vertexArray.isDestroyed()) {
    this._vertexArray.destroy();
  }
  if (defined(this._shaderProgram) && !this._shaderProgram.isDestroyed()) {
    this._shaderProgram.destroy();
  }
  this._context = undefined;
  this._vertexArray = undefined;
  this._shaderProgram = undefined;
  this._sunCommand = undefined;
  this._moonCommand = undefined;
};

SceneGISPlanarCelestialBodyRenderer.prototype.destroy = function () {
  this._releaseResources();
  return destroyObject(this);
};

export default SceneGISPlanarCelestialBodyRenderer;
