import BoundingSphere from "../../../Core/BoundingSphere.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Event from "../../../Core/Event.js";
import HeadingPitchRange from "../../../Core/HeadingPitchRange.js";
import Matrix4 from "../../../Core/Matrix4.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import Entity from "../../../DataSources/Entity.js";
import EntityCollection from "../../../DataSources/EntityCollection.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";

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
    "A planar zoom target must be an Entity, an Entity array, an EntityCollection, or a DataSource with an EntityCollection.",
  );
}

function snapshotResolvedTarget(target) {
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
    removeLoadingListener: undefined,
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
  if (!defined(operation) || !defined(operation.entities)) {
    return;
  }
  if (operation.entities.length === 0) {
    settle(widget, operation, false, false);
    return;
  }

  try {
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

    const camera = widget.scene.camera;
    const framingOptions = operation.options;
    if (operation.isFlight) {
      operation.entities = undefined;
      camera.flyToBoundingSphere(operation.boundingSphere, {
        duration: framingOptions.duration,
        maximumHeight: framingOptions.maximumHeight,
        offset: framingOptions.offset,
        complete() {
          if (widget._sceneGISPlanarFramingOperation === operation) {
            settle(widget, operation, false, true);
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
    } else {
      camera.viewBoundingSphere(
        operation.boundingSphere,
        framingOptions.offset,
      );
      camera.lookAtTransform(Matrix4.IDENTITY);
      settle(widget, operation, false, true);
    }
  } catch (error) {
    settle(widget, operation, true, error);
  }
}

/**
 * Isolated planar Entity/DataSource framing lifecycle.
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
