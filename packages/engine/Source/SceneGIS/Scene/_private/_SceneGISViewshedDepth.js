import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import destroyObject from "../../../Core/destroyObject.js";
import Intersect from "../../../Core/Intersect.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PassState from "../../../Renderer/PassState.js";
import RenderState from "../../../Renderer/RenderState.js";
import DerivedCommand from "../../../Scene/DerivedCommand.js";

function derive(instance, command) {
  let entry = instance._commands.get(command);
  if (!entry) {
    entry = {};
    instance._commands.set(command, entry);
  }
  const context = instance._scene.context;
  entry.log = DerivedCommand.createLogDepthCommand(command, context, entry.log);
  entry.depth = DerivedCommand.createDepthOnlyDerivedCommand(
    instance._scene,
    entry.log.command,
    context,
    entry.depth,
  );
  const depth = entry.depth.depthOnlyCommand;
  const sourceState = command.renderState;
  let renderState = instance._renderStates.get(sourceState);
  if (!renderState) {
    const state = RenderState.getState(sourceState);
    state.depthTest.enabled = true;
    state.depthMask = true;
    state.depthRange = { near: 0, far: 1 };
    state.colorMask = { red: false, green: false, blue: false, alpha: false };
    // Main-view tile stencil, scissor and viewport are not observer coverage.
    state.stencilTest.enabled = false;
    state.scissorTest.enabled = false;
    state.blending.enabled = false;
    state.viewport = undefined;
    renderState = RenderState.fromCache(state);
    instance._renderStates.set(sourceState, renderState);
  }
  depth.renderState = renderState;
  depth.framebuffer = undefined;
  return depth;
}

/**
 * Owns one observer's logarithmic depth target. Callers supply independently
 * selected commands; this helper does not infer streaming completeness.
 * Native vertex transforms, discard and fragment-depth writes are preserved.
 * Source commands, geometry and ShaderCache programs remain borrowed.
 *
 * @private
 */
class SceneGISViewshedDepth {
  constructor(scene) {
    this._scene = scene;
    this._target = new FramebufferManager({
      color: false,
      depth: true,
      supportsDepthTexture: true,
    });
    this._passState = new PassState(scene.context);
    this._passState.viewport = new BoundingRectangle();
    this._passState.blendingEnabled = false;
    this._passState.scissorTest = { enabled: false };
    this._clear = new ClearCommand({ depth: 1 });
    this._commands = new WeakMap();
    this._renderStates = new Map();
    this._savedViewport = new BoundingRectangle();
    this._savedFrustum = undefined;
    this.drawCount = 0;
    this.captureMilliseconds = 0;
    this.ready = false;
  }

  get texture() {
    return this._target.getDepthTexture();
  }

  capture(camera, commands, width, height = width) {
    const scene = this._scene;
    const context = scene.context;
    const uniforms = context.uniformState;
    const mainCamera = scene.frameState.camera;
    const oldPass = uniforms.pass;
    const jitter = uniforms._sceneGISProjectionJitter;
    const savedFrustum = mainCamera.frustum.clone(this._savedFrustum);
    this._savedFrustum = savedFrustum;
    savedFrustum.near = uniforms.currentFrustum.x;
    savedFrustum.far = uniforms.currentFrustum.y;
    BoundingRectangle.clone(uniforms.viewport, this._savedViewport);
    const cullingVolume = camera.frustum.computeCullingVolume(
      camera.positionWC,
      camera.directionWC,
      camera.upWC,
    );
    const start = performance.now();
    this.ready = false;
    this.drawCount = 0;
    try {
      this._target.update(context, width, height);
      const passState = this._passState;
      passState.framebuffer = this._target.framebuffer;
      passState.viewport.width = width;
      passState.viewport.height = height;
      this._clear.execute(context, passState);
      uniforms._sceneGISProjectionJitter = undefined;
      uniforms.updateCamera(camera);
      for (const command of commands) {
        const gaussian = command._sceneGISGaussianObserver === true;
        if (
          (!gaussian &&
            command.pass !== Pass.OPAQUE &&
            command.pass !== Pass.CESIUM_3D_TILE &&
            command.pass !== Pass.GLOBE) ||
          !command.renderState.depthMask ||
          (command.boundingVolume &&
            cullingVolume.computeVisibility(command.boundingVolume) ===
              Intersect.OUTSIDE)
        ) {
          continue;
        }
        uniforms.updatePass(command.pass);
        (gaussian ? command : derive(this, command)).execute(
          context,
          passState,
        );
        this.drawCount++;
      }
      this.ready = true;
    } finally {
      uniforms._sceneGISProjectionJitter = jitter;
      uniforms.updateCamera(mainCamera);
      uniforms.updateFrustum(savedFrustum);
      uniforms.updatePass(oldPass);
      uniforms.viewport = this._savedViewport;
      this.captureMilliseconds = performance.now() - start;
    }
  }

  isDestroyed() {
    return false;
  }

  destroy() {
    this._target.destroy();
    for (const state of this._renderStates.values()) {
      RenderState.removeFromCache(state);
    }
    this._renderStates.clear();
    return destroyObject(this);
  }
}

export default SceneGISViewshedDepth;
