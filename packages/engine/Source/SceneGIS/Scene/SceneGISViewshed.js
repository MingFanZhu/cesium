import Color from "../../Core/Color.js";
import DeveloperError from "../../Core/DeveloperError.js";
import PostProcessStage from "../../Scene/PostProcessStage.js";
import Observer from "./_private/_SceneGISObserverState.js";
import observerShader from "../../Shaders/SceneGIS/Viewshed/SceneGISObserverVisibility.js";
import fragmentShader from "../../Shaders/SceneGIS/Viewshed/SceneGISViewshed.js";

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
 * @param {boolean} [options.showFrustum=false] Show the observer range outline independently of enabled.
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
    const state = Observer.create(options);
    state.visible = Color.clone(
      options.visibleColor ?? Color.GREEN.withAlpha(0.35),
    );
    state.hidden = Color.clone(
      options.hiddenColor ?? Color.RED.withAlpha(0.35),
    );
    super({
      name: options.name,
      fragmentShader: observerShader + fragmentShader,
      uniforms: {
        ...Observer.uniforms(state),
        u_visibleColor: () => state.visible,
        u_hiddenColor: () => state.hidden,
      },
    });
    this._observer = state;
    this.enabled = options.enabled ?? true;
    (state.scene._sceneGISObservers ??= new Set()).add(this);
  }

  /** Exact Scene owning this analysis.
   * @type {Scene}
   * @readonly
   */
  get scene() {
    return this._observer.scene;
  }

  /** Exact World bound at construction.
   * @type {Globe|SceneGISWorld}
   * @readonly
   */
  get world() {
    return this._observer.world;
  }

  /**
   * Shows a yellow outline of the angular, near-plane and radial range boundaries.
   * Independent of enabled and coverage readiness. The outline is depth-tested,
   * does not write depth, cast shadows, occlude analysis or participate in picking.
   * Hidden geometry is retained for reuse and released when this stage is destroyed.
   * @type {boolean}
   * @default false
   */
  get showFrustum() {
    return this._observer.showFrustum;
  }

  set showFrustum(value) {
    if (typeof value !== "boolean") {
      throw new DeveloperError("showFrustum must be boolean.");
    }
    this._observer.showFrustum = value;
    this._observer.scene.requestRender();
  }

  /** Whether the current observer depth has complete selected source coverage.
   * @type {boolean}
   * @readonly
   */
  get analysisReady() {
    return this.enabled && this._observer.analysisReady;
  }

  /** One of loading, ready, disabled or error.
   * @type {string}
   * @readonly
   */
  get status() {
    return this.enabled ? this._observer.status : "disabled";
  }

  /** Most recent coverage or capture failure; undefined after a successful capture.
   * @type {Error|undefined}
   * @readonly
   */
  get error() {
    return this._observer.error;
  }

  /** Raised with a coverage or capture error. Invalid bindings still throw.
   * @type {Event}
   * @readonly
   */
  get errorEvent() {
    return this._observer.errorEvent;
  }

  /** Snapshot of the most recent capture draw calls and CPU submission time.
   * @type {object}
   * @readonly
   */
  get statistics() {
    return { ...this._observer.statistics };
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
    Observer.setView(this._observer, options);
  }

  /** @private */
  update(context, useLogDepth) {
    const state = this._observer;
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
    Observer.destroy(this);
    return super.destroy();
  }
}

export default SceneGISViewshed;
