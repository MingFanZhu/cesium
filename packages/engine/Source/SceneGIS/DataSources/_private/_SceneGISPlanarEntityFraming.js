import BoundingSphere from "../../../Core/BoundingSphere.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Event from "../../../Core/Event.js";
import HeadingPitchRange from "../../../Core/HeadingPitchRange.js";
import Matrix4 from "../../../Core/Matrix4.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import Entity from "../../../DataSources/Entity.js";
import EntityCollection from "../../../DataSources/EntityCollection.js";
import Cesium3DTileset from "../../../Scene/Cesium3DTileset.js";
import PrimitiveCollection from "../../../Scene/PrimitiveCollection.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";
import SceneGISPlanarEntityTracker from "./_SceneGISPlanarEntityTracker.js";

function isPlanarWidget(widget) {
  const world = widget?.scene?.world;
  return world instanceof SceneGISPlanarWorld && !world.isDestroyed();
}

function validateFiniteOption(name, value, nonNegative) {
  if (
    defined(value) &&
    (!Number.isFinite(value) || (nonNegative && value < 0.0))
  ) {
    throw new DeveloperError(
      `${name} must be ${nonNegative ? "a finite non-negative number" : "finite"}.`,
    );
  }
}

function snapshotOptions(options, isFlight) {
  if (!defined(options)) {
    options = {};
  }
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new DeveloperError("Planar framing options must be an object.");
  }

  const offset = options.offset;
  if (defined(offset)) {
    if (!(offset instanceof HeadingPitchRange)) {
      throw new DeveloperError(
        "options.offset must be a HeadingPitchRange for planar framing.",
      );
    }
    validateFiniteOption("options.offset.heading", offset.heading, false);
    validateFiniteOption("options.offset.pitch", offset.pitch, false);
    validateFiniteOption("options.offset.range", offset.range, true);
  }
  if (isFlight) {
    validateFiniteOption("options.duration", options.duration, true);
    validateFiniteOption("options.maximumHeight", options.maximumHeight, false);
  }

  return {
    offset: defined(offset)
      ? new HeadingPitchRange(offset.heading, offset.pitch, offset.range)
      : undefined,
    duration: isFlight ? options.duration : undefined,
    maximumHeight: isFlight ? options.maximumHeight : undefined,
  };
}

function invalidTarget() {
  return new DeveloperError(
    "A planar zoom target must be an Entity, an Entity array, an EntityCollection, a DataSource with an EntityCollection, or a Cesium3DTileset in planar world coordinates.",
  );
}

function snapshotResolvedTarget(target) {
  if (target instanceof Cesium3DTileset) {
    return { tileset: target };
  }
  if (target instanceof Entity) {
    return { entities: [target] };
  }
  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; ++i) {
      if (!(target[i] instanceof Entity)) {
        throw invalidTarget();
      }
    }
    return { entities: target.slice() };
  }
  if (target instanceof EntityCollection) {
    return { entities: target.values.slice() };
  }
  if (
    defined(target) &&
    typeof target === "object" &&
    target.entities instanceof EntityCollection
  ) {
    if (target.isLoading === true) {
      if (!(target.loadingEvent instanceof Event)) {
        throw new DeveloperError(
          "A loading planar DataSource must provide an Event as loadingEvent.",
        );
      }
      return { dataSource: target, entityCollection: target.entities };
    }
    return { entities: target.entities.values.slice() };
  }
  throw invalidTarget();
}

function isThenable(value) {
  return (
    defined(value) &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.then === "function"
  );
}

function removeLoadingListener(operation) {
  const remove = operation.removeLoadingListener;
  operation.removeLoadingListener = undefined;
  if (defined(remove)) {
    remove();
  }
}

function clearCurrent(widget, operation) {
  if (widget._sceneGISPlanarFramingOperation === operation) {
    widget._sceneGISPlanarFramingOperation = undefined;
  }
  removeLoadingListener(operation);
  removeTargetListeners(operation);
}

function removeTargetListeners(operation) {
  const removers = operation.removeTargetListeners;
  operation.removeTargetListeners = undefined;
  if (defined(removers)) {
    for (let i = 0; i < removers.length; i++) {
      removers[i]();
    }
  }
}

function findTilesetPath(collection, tileset, path) {
  if (collection.isDestroyed()) {
    return false;
  }
  path.push(collection);
  if (collection.contains(tileset)) {
    return true;
  }
  for (let i = 0; i < collection.length; i++) {
    const child = collection.get(i);
    // removeAll raises events before truncating its backing array.
    if (
      child instanceof PrimitiveCollection &&
      collection.contains(child) &&
      findTilesetPath(child, tileset, path)
    ) {
      return true;
    }
  }
  path.pop();
  return false;
}

function observeTileset(widget, operation, requireAttachment = true) {
  removeTargetListeners(operation);
  const scene = widget.scene;
  const tileset = operation.tileset;
  const path = [];
  if (scene.isDestroyed() || tileset.isDestroyed() || !defined(tileset.root)) {
    cancel(widget);
    return;
  }
  if (!findTilesetPath(scene.primitives, tileset, path)) {
    if (requireAttachment) {
      cancel(widget);
    }
    return;
  }

  const removers = [];
  operation.removeTargetListeners = removers;
  for (let i = 0; i < path.length; i++) {
    const child = i + 1 < path.length ? path[i + 1] : tileset;
    removers.push(
      path[i].primitiveRemoved.addEventListener(function (removed) {
        if (
          removed === child &&
          widget._sceneGISPlanarFramingOperation === operation
        ) {
          // A primitive can belong to more than one collection.
          observeTileset(widget, operation);
        }
      }),
    );
  }
  removers.push(
    scene.preUpdate.addEventListener(function () {
      if (tileset.isDestroyed()) {
        cancel(widget);
      }
    }),
  );
}

function settle(widget, operation, reject, value) {
  if (operation.settled) {
    return;
  }
  operation.settled = true;
  clearCurrent(widget, operation);
  if (reject) {
    operation.reject(value);
  } else {
    operation.resolve(value);
  }
}

function cancel(widget) {
  const operation = widget._sceneGISPlanarFramingOperation;
  if (!defined(operation)) {
    return false;
  }
  const flight = operation.flight;
  settle(widget, operation, false, false);
  if (defined(flight) && widget.scene.camera._currentFlight === flight) {
    widget.scene.camera.cancelFlight();
  }
  return true;
}

function publishSnapshot(widget, operation, snapshot) {
  if (widget._sceneGISPlanarFramingOperation !== operation) {
    return;
  }
  if (defined(snapshot.tileset)) {
    operation.tileset = snapshot.tileset;
    // The caller may attach the resolved target before the next postRender.
    observeTileset(widget, operation, false);
    return;
  }
  if (defined(snapshot.dataSource)) {
    const dataSource = snapshot.dataSource;
    const entityCollection = snapshot.entityCollection;
    operation.removeLoadingListener = dataSource.loadingEvent.addEventListener(
      function () {
        if (
          widget._sceneGISPlanarFramingOperation !== operation ||
          dataSource.isLoading === true
        ) {
          return;
        }
        removeLoadingListener(operation);
        operation.entities = entityCollection.values.slice();
        widget.scene.requestRender();
      },
    );
    return;
  }
  operation.entities = snapshot.entities;
}

function start(widget, target, options, isFlight) {
  const optionSnapshot = snapshotOptions(options, isFlight);
  const thenable = isThenable(target);
  const targetSnapshot = thenable ? undefined : snapshotResolvedTarget(target);

  cancel(widget);

  let resolveOperation;
  let rejectOperation;
  const promise = new Promise((resolve, reject) => {
    resolveOperation = resolve;
    rejectOperation = reject;
  });
  const operation = {
    promise,
    resolve: resolveOperation,
    reject: rejectOperation,
    settled: false,
    isFlight,
    options: optionSnapshot,
    entities: undefined,
    tileset: undefined,
    framingStarted: false,
    removeLoadingListener: undefined,
    removeTargetListeners: undefined,
    boundingSpheres: [],
    boundingSphere: new BoundingSphere(),
    flight: undefined,
  };
  widget._sceneGISPlanarFramingOperation = operation;

  if (thenable) {
    Promise.resolve(target).then(
      function (resolvedTarget) {
        if (widget._sceneGISPlanarFramingOperation !== operation) {
          return;
        }
        try {
          publishSnapshot(
            widget,
            operation,
            snapshotResolvedTarget(resolvedTarget),
          );
          widget.scene.requestRender();
        } catch (error) {
          settle(widget, operation, true, error);
        }
      },
      function (error) {
        if (widget._sceneGISPlanarFramingOperation === operation) {
          settle(widget, operation, true, error);
        }
      },
    );
  } else {
    try {
      publishSnapshot(widget, operation, targetSnapshot);
    } catch (error) {
      settle(widget, operation, true, error);
      return promise;
    }
  }

  widget.scene.requestRender();
  return promise;
}

const boundingSphereScratch = new BoundingSphere();

function update(widget) {
  const operation = widget._sceneGISPlanarFramingOperation;
  if (
    !defined(operation) ||
    operation.framingStarted ||
    (!defined(operation.entities) && !defined(operation.tileset))
  ) {
    return;
  }

  try {
    if (defined(operation.tileset)) {
      if (!defined(operation.removeTargetListeners)) {
        observeTileset(widget, operation);
        if (widget._sceneGISPlanarFramingOperation !== operation) {
          return;
        }
      }
      if (operation.tileset.isDestroyed()) {
        cancel(widget);
        return;
      }
      // The public getter refreshes bounds using current root/model transforms.
      BoundingSphere.clone(
        operation.tileset.boundingSphere,
        operation.boundingSphere,
      );
    } else {
      const spheres = operation.boundingSpheres;
      let count = 0;
      for (let i = 0; i < operation.entities.length; ++i) {
        const state = widget._dataSourceDisplay.getBoundingSphere(
          operation.entities[i],
          false,
          boundingSphereScratch,
        );
        if (state === BoundingSphereState.PENDING) {
          return;
        }
        if (state === BoundingSphereState.DONE) {
          spheres[count] = BoundingSphere.clone(
            boundingSphereScratch,
            spheres[count],
          );
          count++;
        }
      }
      if (count === 0) {
        settle(widget, operation, false, false);
        return;
      }
      spheres.length = count;
      BoundingSphere.fromBoundingSpheres(spheres, operation.boundingSphere);
    }

    const camera = widget.scene.camera;
    const framingOptions = operation.options;
    if (operation.isFlight) {
      operation.framingStarted = true;
      operation.entities = undefined;
      camera.flyToBoundingSphere(operation.boundingSphere, {
        duration: framingOptions.duration,
        maximumHeight: framingOptions.maximumHeight,
        offset: framingOptions.offset,
        complete() {
          if (widget._sceneGISPlanarFramingOperation === operation) {
            settle(
              widget,
              operation,
              false,
              !defined(operation.tileset) || !operation.tileset.isDestroyed(),
            );
          }
        },
        cancel() {
          if (widget._sceneGISPlanarFramingOperation === operation) {
            settle(widget, operation, false, false);
          }
        },
      });
      if (widget._sceneGISPlanarFramingOperation === operation) {
        operation.flight = camera._currentFlight;
      }
      SceneGISPlanarEntityTracker.clearForSuccessfulFraming(widget);
    } else {
      camera.viewBoundingSphere(
        operation.boundingSphere,
        framingOptions.offset,
      );
      camera.lookAtTransform(Matrix4.IDENTITY);
      SceneGISPlanarEntityTracker.clearForSuccessfulFraming(widget);
      settle(widget, operation, false, true);
    }
  } catch (error) {
    settle(widget, operation, true, error);
  }
}

/**
 * Isolated planar Entity/DataSource and native tileset framing lifecycle.
 *
 * @private
 */
const SceneGISPlanarEntityFraming = {
  isPlanarWidget,
  start,
  update,
  cancel,
};

export default SceneGISPlanarEntityFraming;
