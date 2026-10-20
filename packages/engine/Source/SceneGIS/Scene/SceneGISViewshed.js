import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import Color from "../../Core/Color.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Matrix4 from "../../Core/Matrix4.js";
import PerspectiveFrustum from "../../Core/PerspectiveFrustum.js";
import ContextLimits from "../../Renderer/ContextLimits.js";
import Camera from "../../Scene/Camera.js";
import PostProcessStage from "../../Scene/PostProcessStage.js";
import SceneMode from "../../Scene/SceneMode.js";
import Viewsheds from "./_private/_SceneGISViewsheds.js";
import fragmentShader from "../../Shaders/SceneGIS/Viewshed/SceneGISViewshed.js";

function finiteVector(value, name) {
  if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new DeveloperError(`${name} must be a finite Cartesian3.`);
  }
  return Cartesian3.clone(value);
}

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DeveloperError(`${name} must be finite and positive.`);
  }
  return value;
}

/**
 * Directed, depth-map viewshed bound to one Scene and World. Add it to that
 * Scene's postProcessStages; the collection then owns its destruction.
 * Position, direction and up use the World's native coordinates (ECEF for a
 * Globe, Cartesian metres for a planar World), without implicit projection.
 *
 * Opaque and alpha-masked explicit sources and optional World terrain occlude.
 * Terrain skirts, annotations, classification and transparent media do not.
 * Tile selection uses the observer view, sharing loaded geometry with the Scene.
 * Pending or failed coverage leaves the display unchanged. analysisReady refers
 * to observer coverage; inherited ready only describes post-process resources.
 * Resolution and source LOD bound accuracy; this is not an exact geometry query.
 * Camera-scaled models (minimumPixelSize), frozen tile traversal and stereo
 * rendering are not supported. This initial analysis API is experimental.
 *
 * @alias SceneGISViewshed
 * @extends PostProcessStage
 * @param {object} options Configuration.
 * @param {Scene} options.scene The live SCENE3D Scene.
 * @param {Globe|SceneGISWorld} options.world The exact World attached to scene.
 * @param {Cartesian3} options.position Observer position in World metres.
 * @param {Cartesian3} options.direction Observer forward direction.
 * @param {Cartesian3} options.up Observer up direction, not parallel to direction.
 * @param {number} [options.distance=1000] Maximum radial distance in metres.
 * @param {number} [options.near=0.5] Near clipping distance in metres.
 * @param {number} [options.horizontalAngle=Math.PI/2] Horizontal angle in radians, between 0 and PI.
 * @param {number} [options.verticalAngle=Math.PI/3] Vertical angle in radians, between 0 and PI.
 * @param {number} [options.resolution=1024] Square observer depth-map size.
 * @param {Array<Model|Cesium3DTileset|SceneGISS3MLayer|Primitive|SceneGISPlanarPrimitive>} [options.sources=[]] Explicit occluders in scene.primitives, borrowed.
 * @param {boolean} [options.terrain=true] Include the bound World's surface.
 * @param {number} [options.depthBias=0.1] Observer depth comparison tolerance in metres.
 * @param {Color} [options.visibleColor=Color.GREEN] Visible overlay color and opacity.
 * @param {Color} [options.hiddenColor=Color.RED] Occluded overlay color and opacity.
 * @param {boolean} [options.enabled=true] Whether to select, capture and display.
 * @param {string} [options.name] Unique native post-process stage name.
 * @exception {DeveloperError} Invalid geometry, unsupported source or Scene / World mismatch.
 * @example
 * const analysis = scene.postProcessStages.add(new Cesium.SceneGISViewshed({
 *   scene, world: scene.world, position, direction, up,
 *   sources: [tileset], distance: 1500,
 * }));
 * analysis.setView({ position: nextPosition, direction, up });
 * // Removing the stage releases analysis resources, never source geometry.
 * scene.postProcessStages.remove(analysis);
 */
class SceneGISViewshed extends PostProcessStage {
  constructor(options = {}) {
    const scene = options.scene;
    if (
      !scene ||
      scene.isDestroyed() ||
      !options.world ||
      options.world !== scene.world ||
      scene.mode !== SceneMode.SCENE3D ||
      scene.useWebVR ||
      !scene.context.webgl2
    ) {
      throw new DeveloperError(
        "Viewshed requires its live SCENE3D Scene and exact World.",
      );
    }
    const resolution = options.resolution ?? 1024;
    if (
      !Number.isInteger(resolution) ||
      resolution < 16 ||
      resolution > ContextLimits.maximumTextureSize
    ) {
      throw new DeveloperError(
        "resolution must be an integer from 16 to maximumTextureSize.",
      );
    }
    const depthBias = options.depthBias ?? 0.1;
    if (!Number.isFinite(depthBias) || depthBias < 0) {
      throw new DeveloperError("depthBias must be finite and non-negative.");
    }
    const terrain = options.terrain ?? true;
    if (typeof terrain !== "boolean") {
      throw new DeveloperError("terrain must be boolean.");
    }
    const state = {
      scene,
      world: options.world,
      camera: new Camera(scene),
      resolution,
      terrain,
      depthBias,
      sources: Viewsheds.validateSources(scene, options.sources ?? []),
      commands: [],
      viewToObserver: new Matrix4(),
      inverseProjection: new Matrix4(),
      depthRange: new Cartesian2(),
      analysisReady: false,
      status: "loading",
      error: undefined,
      errorEvent: new Event(),
      statistics: { drawCalls: 0, captureMilliseconds: 0 },
      terrainView: undefined,
      depth: undefined,
      sourceStates: new Map(),
      visible: Color.clone(options.visibleColor ?? Color.GREEN.withAlpha(0.35)),
      hidden: Color.clone(options.hiddenColor ?? Color.RED.withAlpha(0.35)),
    };
    super({
      name: options.name,
      fragmentShader,
      uniforms: {
        u_analysisReady: () => state.analysisReady,
        u_observerDepth: () =>
          state.depth?.texture ?? scene.context.defaultTexture,
        u_surfaceDepth: () => Viewsheds.surfaceDepth(scene),
        u_viewToObserver: () => state.viewToObserver,
        u_inverseMainProjection: () => state.inverseProjection,
        u_observerProjection: () => state.camera.frustum.projectionMatrix,
        u_depthRange: () => state.depthRange,
        u_distance: () => state.distance,
        u_depthBias: () => state.depthBias,
        u_mainPerspective: () => state.perspective,
        u_mainJitter: () => {
          const temporal = scene._sceneGISTemporalAntialiasing?._state;
          return temporal?.active ? temporal.jitter : Cartesian2.ZERO;
        },
        u_visibleColor: () => state.visible,
        u_hiddenColor: () => state.hidden,
      },
    });
    this._viewshed = state;
    this.enabled = options.enabled ?? true;
    this.setView(options);
    (scene._sceneGISViewsheds ??= new Set()).add(this);
  }

  /** Exact Scene owning this analysis.
   * @type {Scene}
   * @readonly
   */
  get scene() {
    return this._viewshed.scene;
  }

  /** Exact World bound at construction.
   * @type {Globe|SceneGISWorld}
   * @readonly
   */
  get world() {
    return this._viewshed.world;
  }

  /** Whether the current observer depth has complete selected source coverage.
   * @type {boolean}
   * @readonly
   */
  get analysisReady() {
    return this.enabled && this._viewshed.analysisReady;
  }

  /** One of loading, ready, disabled or error.
   * @type {string}
   * @readonly
   */
  get status() {
    return this.enabled ? this._viewshed.status : "disabled";
  }

  /** Most recent coverage or capture failure; undefined after a successful capture.
   * @type {Error|undefined}
   * @readonly
   */
  get error() {
    return this._viewshed.error;
  }

  /** Raised with a coverage or capture error. Invalid bindings still throw.
   * @type {Event}
   * @readonly
   */
  get errorEvent() {
    return this._viewshed.errorEvent;
  }

  /** Snapshot of the most recent capture draw calls and CPU submission time.
   * @type {object}
   * @readonly
   */
  get statistics() {
    return { ...this._viewshed.statistics };
  }

  /**
   * Atomically changes the observer. Omitted scalar values retain their value.
   * A new pose requires position, direction and up together.
   * @param {object} options Observer configuration.
   * @param {Cartesian3} options.position World position.
   * @param {Cartesian3} options.direction Forward direction.
   * @param {Cartesian3} options.up Up direction.
   * @param {number} [options.distance] Maximum radial distance in metres.
   * @param {number} [options.near] Near clipping distance in metres.
   * @param {number} [options.horizontalAngle] Horizontal angle in radians.
   * @param {number} [options.verticalAngle] Vertical angle in radians.
   */
  setView(options) {
    const state = this._viewshed;
    const position = finiteVector(options.position, "position");
    const direction = finiteVector(options.direction, "direction");
    const up = finiteVector(options.up, "up");
    if (
      Cartesian3.magnitudeSquared(direction) === 0 ||
      Cartesian3.magnitudeSquared(up) === 0
    ) {
      throw new DeveloperError("direction and up must be nonzero.");
    }
    Cartesian3.normalize(direction, direction);
    Cartesian3.normalize(up, up);
    const right = Cartesian3.cross(direction, up, new Cartesian3());
    if (Cartesian3.magnitudeSquared(right) < 1e-12) {
      throw new DeveloperError("direction and up must not be parallel.");
    }
    Cartesian3.normalize(right, right);
    Cartesian3.cross(right, direction, up);
    const distance = positive(
      options.distance ?? state.distance ?? 1000,
      "distance",
    );
    const near = positive(options.near ?? state.near ?? 0.5, "near");
    const horizontal = positive(
      options.horizontalAngle ?? state.horizontal ?? Math.PI / 2,
      "horizontalAngle",
    );
    const vertical = positive(
      options.verticalAngle ?? state.vertical ?? Math.PI / 3,
      "verticalAngle",
    );
    if (near >= distance || horizontal >= Math.PI || vertical >= Math.PI) {
      throw new DeveloperError(
        "near must be below distance and angles below PI.",
      );
    }
    state.distance = distance;
    state.near = near;
    state.horizontal = horizontal;
    state.vertical = vertical;
    const aspectRatio = Math.tan(horizontal / 2) / Math.tan(vertical / 2);
    state.camera.frustum = new PerspectiveFrustum({
      near,
      far: distance,
      aspectRatio,
      fov: aspectRatio >= 1 ? horizontal : vertical,
    });
    state.camera.setView({
      destination: position,
      orientation: { direction, up },
    });
    state.depthRange.x = near;
    state.depthRange.y = distance;
    state.analysisReady = false;
    state.status = "loading";
    state.scene.requestRender();
  }

  /** @private */
  update(context, useLogDepth) {
    const state = this._viewshed;
    if (context !== state.scene.context || state.world !== state.scene.world) {
      throw new DeveloperError(
        "Viewshed cannot be used with a different Scene or World.",
      );
    }
    super.update(context, useLogDepth);
  }

  /** Releases analysis targets and unregisters this observer. Sources are borrowed.
   * @returns {undefined}
   */
  destroy() {
    const state = this._viewshed;
    state.scene._sceneGISViewsheds.delete(this);
    state.depth?.destroy();
    state.commands.length = 0;
    state.sourceStates.clear();
    return super.destroy();
  }
}

export default SceneGISViewshed;
