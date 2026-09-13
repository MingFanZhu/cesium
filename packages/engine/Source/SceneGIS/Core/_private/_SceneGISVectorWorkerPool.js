import RuntimeError from "../../../Core/RuntimeError.js";
import TaskProcessor from "../../../Core/TaskProcessor.js";

/** A lazy, owner-scoped pair of Workers; only resource jobs may queue. @private */
function SceneGISVectorWorkerPool(configuration) {
  this.configuration = configuration;
  this.slots = [];
  this.queue = [];
  this.destroyed = false;
  this.failure = undefined;
  this.statistics = { started: 0, completed: 0, workerMs: 0 };
}

Object.defineProperty(SceneGISVectorWorkerPool.prototype, "available", {
  get() {
    return (
      !this.destroyed &&
      (this.slots.length < 2 || this.slots.some((slot) => !slot.busy))
    );
  },
});

SceneGISVectorWorkerPool.prototype.schedule = function (
  parameters,
  transfers = [],
) {
  if (this.destroyed) {
    throw new RuntimeError("The vector Worker pool was destroyed.");
  }
  if (this.failure) {
    return Promise.reject(this.failure);
  }
  let slot = this.slots.find((item) => !item.busy);
  if (!slot && this.slots.length < 2) {
    slot = { processor: new TaskProcessor("SceneGISVectorTileWorker", 1) };
    this.slots.push(slot);
  }
  if (!slot) {
    return undefined;
  }
  slot.busy = true;
  this.statistics.started++;
  const payload = { ...parameters };
  if (!slot.configured && this.configuration) {
    payload.configuration = this.configuration;
    slot.configured = true;
  }
  return new Promise((resolve, reject) => {
    slot.reject = reject;
    const settle = (result, error) => {
      if (this.destroyed || this.failure) {
        return;
      }
      slot.busy = false;
      slot.reject = undefined;
      this.statistics.completed++;
      if (error) {
        if (payload.configuration) {
          slot.configured = false;
        }
        reject(error);
      } else {
        this.statistics.workerMs += result.workerMs;
        resolve(result);
      }
      const next = this.queue.shift();
      if (next) {
        this.schedule(next.parameters, next.transfers).then(
          next.resolve,
          next.reject,
        );
      }
    };
    try {
      slot.processor.scheduleTask(payload, transfers).then(
        (result) => settle(result),
        (error) => settle(undefined, error),
      );
      if (!slot.listen) {
        const worker = slot.processor._worker;
        slot.listen = (event) => {
          event.preventDefault();
          this.failure = new RuntimeError(
            event.message || "Vector Worker communication failed.",
          );
          releaseWorkers(this, this.failure);
        };
        worker.addEventListener("error", slot.listen);
        worker.addEventListener("messageerror", slot.listen);
      }
    } catch (error) {
      settle(undefined, error);
    }
  });
};

function releaseWorkers(pool, error) {
  for (const slot of pool.slots) {
    slot.reject?.(error);
    slot.reject = undefined;
    const worker = slot.processor._worker;
    worker?.removeEventListener("error", slot.listen);
    worker?.removeEventListener("messageerror", slot.listen);
    slot.processor.destroy();
  }
  for (const job of pool.queue) {
    job.reject(error);
  }
  pool.queue.length = 0;
  pool.slots.length = 0;
}

SceneGISVectorWorkerPool.prototype.enqueue = function (
  parameters,
  transfers = [],
) {
  return (
    this.schedule(parameters, transfers) ??
    new Promise((resolve, reject) => {
      this.queue.push({ parameters, transfers, resolve, reject });
    })
  );
};

SceneGISVectorWorkerPool.prototype.destroy = function () {
  this.destroyed = true;
  const error = new RuntimeError("The vector Worker pool was destroyed.");
  releaseWorkers(this, error);
  this.configuration = undefined;
};

export default SceneGISVectorWorkerPool;
