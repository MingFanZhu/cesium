import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Event from "../../../Core/Event.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PerspectiveFrustum from "../../../Core/PerspectiveFrustum.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import Camera from "../../../Scene/Camera.js";
import SceneMode from "../../../Scene/SceneMode.js";
import Passes from "./_SceneGISObserverPasses.js";

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

/** Shared observer state, uniforms and ownership. @private */
const ObserverState = {
  create(options) {
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
        "Observer requires its live SCENE3D Scene and exact World.",
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
    if (typeof (options.showFrustum ?? false) !== "boolean") {
      throw new DeveloperError("showFrustum must be boolean.");
    }
    const state = {
      scene,
      world: options.world,
      camera: new Camera(scene),
      resolution,
      terrain,
      depthBias,
      sources: Passes.validateSources(scene, options.sources ?? []),
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
      showFrustum: options.showFrustum ?? false,
      frustumGuide: undefined,
    };
    this.setView(state, options);
    return state;
  },
  setView(state, options) {
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
  },
  uniforms(state) {
    const scene = state.scene;
    return {
      u_analysisReady: () => state.analysisReady,
      u_observerDepth: () =>
        state.depth?.texture ?? scene.context.defaultTexture,
      u_surfaceDepth: () => Passes.surfaceDepth(scene),
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
    };
  },
  destroy(stage) {
    const state = stage._observer;
    state.scene._sceneGISObservers.delete(stage);
    state.depth?.destroy();
    state.frustumGuide?.destroy();
    state.commands.length = 0;
    state.sourceStates.clear();
  },
};
export default ObserverState;
