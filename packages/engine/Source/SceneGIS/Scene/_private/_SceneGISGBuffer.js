import destroyObject from "../../../Core/destroyObject.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import PostProcessStage from "../../../Scene/PostProcessStage.js";
import debugShader from "../../../Shaders/SceneGIS/Rendering/SceneGISGBufferDebug.js";

/** Read-only inspector of the Scene's deferred material targets. @private */
class _SceneGISGBuffer {
  constructor(scene) {
    if (
      !scene ||
      scene.isDestroyed() ||
      !scene._sceneGISDeferred ||
      scene._sceneGISGBuffer
    ) {
      throw new DeveloperError(
        "G-buffer inspection requires a live deferred Scene without an existing inspector.",
      );
    }
    this._scene = scene;
    this._enabled = false;
    this.debugView = 0;
    const texture = (index) =>
      this.ready
        ? scene._sceneGISDeferred._raw.getColorTexture(index)
        : scene.context.defaultTexture;
    this._debug = scene.postProcessStages.add(
      new PostProcessStage({
        fragmentShader: debugShader,
        uniforms: {
          u_diffuse: () => texture(0),
          u_normal: () => texture(1),
          u_specular: () => texture(2),
          u_emission: () => texture(3),
          u_depth: () =>
            this.ready
              ? scene._sceneGISDeferred._linearDepth
              : scene.context.defaultTexture,
          u_view: () => this.debugView,
          u_ready: () => this.ready,
        },
      }),
    );
    this._debug.enabled = false;
    this._removePreRender = scene.preRender.addEventListener(() => {
      this._debug.enabled = this.enabled && this.debugView !== 0;
    });
    scene._sceneGISGBuffer = this;
  }

  get enabled() {
    return this._enabled;
  }
  set enabled(value) {
    if (typeof value !== "boolean") {
      throw new DeveloperError("enabled must be boolean.");
    }
    this._enabled = value;
    this._debug.enabled = value && this.debugView !== 0;
    this._scene.requestRender();
  }
  get ready() {
    return this.enabled && this._scene._sceneGISDeferred?.ready === true;
  }

  isDestroyed() {
    return false;
  }
  destroy() {
    this._removePreRender();
    this._scene.postProcessStages.remove(this._debug);
    this._scene._sceneGISGBuffer = undefined;
    this._scene = undefined;
    return destroyObject(this);
  }
}
export default _SceneGISGBuffer;
