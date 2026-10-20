import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Intersect from "../../../Core/Intersect.js";
import Matrix4 from "../../../Core/Matrix4.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import Pass from "../../../Renderer/Pass.js";
import Cesium3DTileContentState from "../../../Scene/Cesium3DTileContentState.js";
import Cesium3DTilePass from "../../../Scene/Cesium3DTilePass.js";
import Cesium3DTilePassState from "../../../Scene/Cesium3DTilePassState.js";
import Cesium3DTileRefine from "../../../Scene/Cesium3DTileRefine.js";
import Cesium3DTileset from "../../../Scene/Cesium3DTileset.js";
import Cesium3DTilesetTraversal from "../../../Scene/Cesium3DTilesetTraversal.js";
import Globe from "../../../Scene/Globe.js";
import Model from "../../../Scene/Model/Model.js";
import Primitive from "../../../Scene/Primitive.js";
import PrimitiveCollection from "../../../Scene/PrimitiveCollection.js";
import SceneMode from "../../../Scene/SceneMode.js";
import SceneGISPlanarPrimitive from "../SceneGISPlanarPrimitive.js";
import SceneGISS3MLayer from "../SceneGISS3MLayer.js";
import Depth from "./_SceneGISViewshedDepth.js";
import GlobeSelection from "./_SceneGISViewshedGlobe.js";

function contains(collection, source) {
  if (collection.contains(source)) {
    return true;
  }
  for (let i = 0; i < collection.length; i++) {
    const child = collection.get(i);
    if (child instanceof PrimitiveCollection && contains(child, source)) {
      return true;
    }
  }
  return false;
}

function modelComplete(model) {
  return (
    model.ready &&
    (!model._loader.incrementallyLoadTextures || model._texturesLoaded)
  );
}

function contentComplete(content) {
  if (content.innerContents) {
    return content.innerContents.every(contentComplete);
  }
  return !content._model || modelComplete(content._model);
}

function appendModel(model, frameState, update) {
  if (model.minimumPixelSize !== 0) {
    throw new DeveloperError("Viewshed occluders require minimumPixelSize=0.");
  }
  if (update) {
    model.update(frameState);
  } else if (model.ready && model.show && !model.isInvisible()) {
    model._sceneGraph.pushDrawCommands(frameState);
  }
  return modelComplete(model);
}

function tilesetCoverage(tileset, frame) {
  // Base / skip traversal do not return pass.ready; that flag is only populated
  // by the native most-detailed traversal. Check the selected SSE frontier.
  const root = tileset.root;
  if (
    !root.isVisible ||
    root.getScreenSpaceError(frame, true) <=
      tileset.memoryAdjustedScreenSpaceError
  ) {
    return true;
  }
  const selected = new Set(tileset._selectedTiles);
  const stack = [root];
  while (stack.length) {
    const tile = stack.pop();
    Cesium3DTilesetTraversal.updateTile(tile, frame);
    if (!tile.isVisible) {
      continue;
    }
    if (tile._contentState === Cesium3DTileContentState.FAILED) {
      throw new RuntimeError("A required observer tile failed to load.");
    }
    const traverse = Cesium3DTilesetTraversal.canTraverse(tile);
    if (
      !tile.hasEmptyContent &&
      !tile.hasRenderableContent &&
      !tile.contentAvailable
    ) {
      return false;
    }
    if (
      (!traverse || tile.refine === Cesium3DTileRefine.ADD) &&
      tile.hasRenderableContent &&
      tile.contentVisibility(frame) !== Intersect.OUTSIDE &&
      (!tile.contentReady ||
        !selected.has(tile) ||
        !contentComplete(tile.content))
    ) {
      return false;
    }
    if (traverse) {
      stack.push(...tile.children);
    }
  }
  return true;
}

/** Runs a bounded observer operation without replacing the Scene's Camera. @private */
function withView(state, callback) {
  const scene = state.scene;
  const frame = scene.frameState;
  const uniforms = scene.context.uniformState;
  state.savedFrustum = frame.camera.frustum.clone(state.savedFrustum);
  state.savedFrustum.near = uniforms.currentFrustum.x;
  state.savedFrustum.far = uniforms.currentFrustum.y;
  state.savedViewport = BoundingRectangle.clone(
    uniforms.viewport,
    state.savedViewport,
  );
  const saved = {
    camera: frame.camera,
    cullingVolume: frame.cullingVolume,
    commandList: frame.commandList,
    pixelRatio: frame.pixelRatio,
    occluder: frame.occluder,
    cameraUnderground: frame.cameraUnderground,
    viewport: frame._sceneGISObserverViewport,
    jitter: uniforms._sceneGISProjectionJitter,
    pass: uniforms.pass,
  };
  try {
    frame.camera = state.camera;
    frame.cullingVolume = state.cullingVolume;
    frame.commandList = state.commands;
    frame.pixelRatio = 1;
    frame.occluder = undefined;
    frame.cameraUnderground =
      state.world instanceof Globe
        ? state.camera.positionCartographic.height < 0
        : state.camera.positionWC.z < 0;
    frame._sceneGISObserverViewport = state.resolution;
    uniforms._sceneGISProjectionJitter = undefined;
    uniforms.updateCamera(state.camera);
    return callback(frame);
  } finally {
    frame.camera = saved.camera;
    frame.cullingVolume = saved.cullingVolume;
    frame.commandList = saved.commandList;
    frame.pixelRatio = saved.pixelRatio;
    frame.occluder = saved.occluder;
    frame.cameraUnderground = saved.cameraUnderground;
    frame._sceneGISObserverViewport = saved.viewport;
    uniforms._sceneGISProjectionJitter = saved.jitter;
    uniforms.updateCamera(saved.camera);
    uniforms.updateFrustum(state.savedFrustum);
    uniforms.viewport = state.savedViewport;
    uniforms.updatePass(saved.pass);
  }
}

/** Explicit Scene integration for directed observer analysis. @private */
const Viewsheds = {
  withView,

  validateSources(scene, sources) {
    if (!Array.isArray(sources)) {
      throw new DeveloperError(
        "sources must be an array of supported scene primitives.",
      );
    }
    for (const source of sources) {
      if (
        !(source instanceof Model) &&
        !(source instanceof Cesium3DTileset) &&
        !(source instanceof SceneGISS3MLayer) &&
        !(source instanceof Primitive) &&
        !(source instanceof SceneGISPlanarPrimitive)
      ) {
        throw new DeveloperError("Unsupported viewshed source.");
      }
      if (source.isDestroyed() || !contains(scene.primitives, source)) {
        throw new DeveloperError(
          "Viewshed sources must belong to the bound Scene.",
        );
      }
    }
    return [...new Set(sources)];
  },

  prepare(scene) {
    const frame = scene.frameState;
    const active = (frame._sceneGISViewsheds ??= []);
    active.length = 0;
    frame._sceneGISObserverTerrainTiles?.clear();
    if (!frame.passes.render || frame.passes.pick || frame.passes.depth) {
      return;
    }
    for (const stage of scene._sceneGISViewsheds ?? []) {
      if (!stage.enabled || !scene.postProcessStages.contains(stage)) {
        continue;
      }
      const state = stage._viewshed;
      if (
        state.world !== scene.world ||
        scene.mode !== SceneMode.SCENE3D ||
        scene.useWebVR
      ) {
        throw new DeveloperError(
          "Viewshed requires its original World in SCENE3D.",
        );
      }
      this.validateSources(scene, state.sources);
      state.analysisReady = false;
      state.status = "loading";
      state.commands.length = 0;
      state.statistics.drawCalls = 0;
      state.cullingVolume = state.camera.frustum.computeCullingVolume(
        state.camera.positionWC,
        state.camera.directionWC,
        state.camera.upWC,
      );
      active.push(state);
    }
  },

  execute(scene) {
    const frame = scene.frameState;
    if (!frame.passes.render || frame.passes.pick || frame.passes.depth) {
      return;
    }
    const mainCommands = frame.commandList;
    for (const state of frame._sceneGISViewsheds ?? []) {
      const start = performance.now();
      let complete = true;
      try {
        withView(state, (observerFrame) => {
          if (state.terrain && state.world.show) {
            if (state.world instanceof Globe) {
              if (!frame.globeTranslucencyState.translucent) {
                complete = GlobeSelection.collect(state, observerFrame);
              }
            } else {
              complete = state.terrainView?.ready === true;
              if (state.terrainView?.error) {
                throw state.terrainView.error;
              }
              state.world._surface.appendObserverCommands(state, observerFrame);
            }
          }
          for (const source of state.sources) {
            if (!source.show) {
              continue;
            }
            if (source instanceof Cesium3DTileset) {
              if (source.debugFreezeFrame) {
                throw new DeveloperError(
                  "Viewshed requires live tile traversal (debugFreezeFrame=false).",
                );
              }
              let passState = state.sourceStates.get(source);
              if (!passState) {
                passState = new Cesium3DTilePassState({
                  pass: Cesium3DTilePass.SHADOW,
                });
                state.sourceStates.set(source, passState);
              }
              passState.camera = state.camera;
              passState.cullingVolume = state.cullingVolume;
              passState.commandList = state.commands;
              source.updateForPass(observerFrame, passState);
              complete = tilesetCoverage(source, observerFrame) && complete;
            } else if (source instanceof SceneGISS3MLayer) {
              const selection = state.sourceStates.get(source);
              complete = selection?.ready === true && complete;
              if (selection?.error) {
                throw selection.error;
              }
              for (const { model } of selection?.selected ?? []) {
                model.show = true;
                complete = appendModel(model, observerFrame, true) && complete;
              }
            } else if (source instanceof Model) {
              complete = appendModel(source, observerFrame, false) && complete;
            } else {
              complete = source.ready && complete;
              for (const command of mainCommands) {
                if (
                  command.owner === source ||
                  command.owner === source._current
                ) {
                  state.commands.push(command);
                }
              }
            }
          }
          for (const command of state.commands) {
            if (command.pass === Pass.COMPUTE) {
              scene.context.uniformState.updatePass(Pass.COMPUTE);
              command.execute(scene._computeEngine);
            }
          }
          state.depth ??= new Depth(scene);
          state.depth.capture(state.camera, state.commands, state.resolution);
          state.statistics.drawCalls = state.depth.drawCount;
        });
        state.analysisReady = complete;
        state.status = complete ? "ready" : "loading";
        state.error = undefined;
        if (!complete) {
          frame.afterRender.push(() => !scene.isDestroyed());
        }
      } catch (error) {
        state.analysisReady = false;
        state.status = "error";
        const changed = state.error?.message !== error.message;
        state.error = error;
        if (changed) {
          state.errorEvent.raiseEvent(error);
        }
        if (error instanceof DeveloperError) {
          throw error;
        }
      } finally {
        Matrix4.multiply(
          state.camera.viewMatrix,
          scene.camera.inverseViewMatrix,
          state.viewToObserver,
        );
        Matrix4.inverse(
          scene.camera.frustum.projectionMatrix,
          state.inverseProjection,
        );
        state.perspective = "infiniteProjectionMatrix" in scene.camera.frustum;
        state.statistics.captureMilliseconds = performance.now() - start;
      }
    }
  },

  surfaceDepth(scene) {
    const temporal = scene._sceneGISTemporalAntialiasing?._state;
    return (
      (temporal?.active && temporal.deferredCaptured
        ? temporal.depth.getColorTexture()
        : scene._sceneGISDeferred?.opaqueDepthTexture) ??
      scene.context.defaultTexture
    );
  },
};

export default Viewsheds;
