import DeveloperError from "../../Core/DeveloperError.js";
import PostProcessStage from "../../Scene/PostProcessStage.js";
import Observer from "./_private/_SceneGISObserverState.js";
import VideoTexture from "./_private/_SceneGISVideoTexture.js";
import observerShader from "../../Shaders/SceneGIS/Viewshed/SceneGISObserverVisibility.js";
import fragmentShader from "../../Shaders/SceneGIS/Viewshed/SceneGISVideoProjection.js";

function opacity(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new DeveloperError("opacity must be between zero and one.");
  }
  return value;
}

function boolean(value, name) {
  if (typeof value !== "boolean") {
    throw new DeveloperError(`${name} must be boolean.`);
  }
  return value;
}

/**
 * Projects a borrowed SDR video onto observer-visible opaque scene surfaces.
 * Add to the bound Scene's postProcessStages, which owns destruction. Globe
 * coordinates are ECEF; planar coordinates are the current World's metre XYZ.
 * Source selection and depth capture are independent of the display camera and
 * solar shadow map. Missing media or observer coverage leaves the scene intact.
 *
 * Video is contained inside the angular rectangle without stretching. Letterbox
 * regions retain scene colors. Black is content. Compositing follows exposure and
 * tone mapping; this is a display overlay, not a physical projector light.
 * Opaque depth defines receivers. Transparent surfaces neither receive nor block;
 * the overlay can cover transparent foreground at an opaque receiver's pixel.
 * Native post-process ordering defines overlap between projections and analyses.
 *
 * The caller controls playback, audio, seeking, src and srcObject. This class never
 * pauses the video or stops stream tracks. Requires WebGL2, SCENE3D and video frame
 * callback support. Finite depth resolution and source LOD bound precision.
 * This API is experimental.
 *
 * @alias SceneGISVideoProjection
 * @extends PostProcessStage
 * @param {object} options Configuration.
 * @param {Scene} options.scene Live SCENE3D Scene.
 * @param {Globe|SceneGISWorld} options.world Exact World attached to scene.
 * @param {HTMLVideoElement} options.video Borrowed, WebGL-readable SDR video.
 * @param {Cartesian3} options.position Projector position in World metres.
 * @param {Cartesian3} options.direction Projector forward direction.
 * @param {Cartesian3} options.up Projector up, not parallel to direction.
 * @param {number} [options.distance=1000] Maximum radial distance in metres.
 * @param {number} [options.near=0.5] Near clipping distance in metres.
 * @param {number} [options.horizontalAngle=Math.PI/2] Horizontal angle, radians in (0, PI).
 * @param {number} [options.verticalAngle=Math.PI/3] Vertical angle, radians in (0, PI).
 * @param {number} [options.resolution=1024] Square observer depth-map size.
 * @param {Array<Model|Cesium3DTileset|SceneGISS3MLayer|Primitive|SceneGISPlanarPrimitive>} [options.sources=[]] Borrowed explicit occluders in scene.primitives, not a receiver filter.
 * @param {boolean} [options.terrain=true] Include World terrain in occlusion.
 * @param {number} [options.depthBias=0.1] Metric depth comparison tolerance.
 * @param {number} [options.opacity=1] Display blend weight, in [0, 1].
 * @param {boolean} [options.flipY=false] Additional vertical media flip.
 * @param {boolean} [options.enabled=true] Select, capture and project.
 * @param {boolean} [options.showFrustum=false] Show range outline independently.
 * @param {string} [options.name] Unique post-process stage name.
 * @exception {DeveloperError} Invalid geometry, media capabilities or Scene / World binding.
 * @example
 * const projection = scene.postProcessStages.add(new Cesium.SceneGISVideoProjection({
 *   scene, world: scene.world, video, position, direction, up,
 *   sources: [tileset], distance: 2000, showFrustum: true,
 * }));
 * projection.opacity = 0.8;
 * // Removing releases GPU resources, but leaves the borrowed video playing.
 * scene.postProcessStages.remove(projection);
 */
class SceneGISVideoProjection extends PostProcessStage {
  constructor(options = {}) {
    const state = Observer.create(options);
    state.opacity = opacity(options.opacity ?? 1);
    state.flipY = boolean(options.flipY ?? false, "flipY");
    // Create the media owner after the native constructor accepts its options.
    super({
      name: options.name,
      fragmentShader: observerShader + fragmentShader,
      uniforms: {
        ...Observer.uniforms(state),
        u_video: () =>
          state.media.texture ?? state.scene.context.defaultTexture,
        u_videoReady: () => state.media.ready,
        u_videoAspect: () => {
          const texture = state.media.texture;
          return texture ? texture.width / texture.height : 1;
        },
        u_frustumAspect: () => state.camera.frustum.aspectRatio,
        u_opacity: () => state.opacity,
        u_flipY: () => state.flipY,
      },
    });
    state.media = new VideoTexture(
      state.scene,
      options.video,
      state.errorEvent,
    );
    this._observer = state;
    this.enabled = options.enabled ?? true;
    (state.scene._sceneGISObservers ??= new Set()).add(this);
  }

  /** Exact owning Scene.
   * @type {Scene}
   * @readonly
   */
  get scene() {
    return this._observer.scene;
  }

  /** Exact bound World.
   * @type {Globe|SceneGISWorld}
   * @readonly
   */
  get world() {
    return this._observer.world;
  }

  /** Borrowed media. Replacement detaches old callbacks without stopping playback.
   *
   * @type {HTMLVideoElement}
   */
  get video() {
    return this._observer.media.video;
  }
  set video(value) {
    if (value !== this.video) {
      this._observer.media.setVideo(value);
      this.scene.requestRender();
    }
  }

  /** Display blend weight.
   * @type {number}
   * @default 1
   */
  get opacity() {
    return this._observer.opacity;
  }
  set opacity(value) {
    this._observer.opacity = opacity(value);
    this.scene.requestRender();
  }

  /** Additional vertical media flip.
   * @type {boolean}
   * @default false
   */
  get flipY() {
    return this._observer.flipY;
  }
  set flipY(value) {
    this._observer.flipY = boolean(value, "flipY");
    this.scene.requestRender();
  }

  /** Show the depth-tested yellow observer outline, independently of enabled.
   *
   * @type {boolean}
   * @default false
   */
  get showFrustum() {
    return this._observer.showFrustum;
  }
  set showFrustum(value) {
    this._observer.showFrustum = boolean(value, "showFrustum");
    this.scene.requestRender();
  }

  /** Complete observer coverage for the current render.
   * @type {boolean}
   * @readonly
   */
  get analysisReady() {
    return this.enabled && this._observer.analysisReady;
  }

  /** A valid media frame has been uploaded.
   * @type {boolean}
   * @readonly
   */
  get videoReady() {
    return this._observer.media.ready;
  }

  /** Both media and observer coverage are ready.
   * @type {boolean}
   * @readonly
   */
  get projectionReady() {
    return this.analysisReady && this.videoReady;
  }

  /** One of disabled, error, loading-video, loading-coverage or ready.
   *
   * @type {string}
   * @readonly
   */
  get status() {
    if (!this.enabled) {
      return "disabled";
    }
    if (this.error) {
      return "error";
    }
    return !this.videoReady
      ? "loading-video"
      : this.analysisReady
        ? "ready"
        : "loading-coverage";
  }

  /** Most recent media or coverage failure.
   * @type {Error|undefined}
   * @readonly
   */
  get error() {
    return this._observer.media.error ?? this._observer.error;
  }

  /** Raised for media upload or observer capture errors.
   * @type {Event}
   * @readonly
   */
  get errorEvent() {
    return this._observer.errorEvent;
  }

  /** Capture draws / CPU time, cumulative upload count / RGBA bytes and last upload
   * CPU time. These times do not measure GPU completion.
   * @type {object}
   * @readonly
   */
  get statistics() {
    const media = this._observer.media;
    return {
      ...this._observer.statistics,
      videoUploads: media.uploads,
      videoUploadBytes: media.uploadBytes,
      videoUploadMilliseconds: media.uploadMilliseconds,
    };
  }

  /** Atomically changes the projector; omitted scalar values retain their value.
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

  /** @private
   */
  update(context, useLogDepth) {
    const state = this._observer;
    if (context !== state.scene.context || state.world !== state.scene.world) {
      throw new DeveloperError(
        "VideoProjection requires its original Scene and World.",
      );
    }
    state.media.setActive(this.enabled);
    state.media.update(context);
    super.update(context, useLogDepth);
  }

  /** Releases owned resources, never borrowed video, tracks or sources.
   * @returns {undefined}
   */
  destroy() {
    this._observer.media.destroy();
    Observer.destroy(this);
    return super.destroy();
  }
}

export default SceneGISVideoProjection;
