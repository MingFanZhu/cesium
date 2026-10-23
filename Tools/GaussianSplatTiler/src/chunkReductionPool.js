import { Worker } from "node:worker_threads";

function deserializeError(serialized) {
  const error = new Error(serialized.message);
  error.name = serialized.name;
  error.stack = serialized.stack;
  return error;
}

export class ChunkReductionPool {
  constructor(size) {
    if (!Number.isSafeInteger(size) || size < 2) {
      throw new RangeError("ChunkReductionPool size must be at least 2");
    }
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.tasks = new Map();
    this.nextTaskId = 1;
    this.failure = undefined;
    this.destroyed = false;
    for (let index = 0; index < size; index++) {
      const worker = new Worker(
        new URL("./chunkReductionWorker.js", import.meta.url),
      );
      const owner = { worker, taskId: undefined };
      worker.on("message", (message) => this.#settle(owner, message));
      worker.on("error", (error) => this.#fail(error));
      worker.on("exit", (code) => {
        if (!this.destroyed && code !== 0) {
          this.#fail(
            new Error(`Chunk reduction Worker exited with code ${code}`),
          );
        }
      });
      this.workers.push(owner);
      this.idle.push(owner);
    }
  }

  run(task, transferList) {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    if (this.destroyed) {
      return Promise.reject(new Error("Chunk reduction pool is destroyed"));
    }
    const taskId = this.nextTaskId++;
    return new Promise((resolve, reject) => {
      this.tasks.set(taskId, { resolve, reject });
      this.queue.push({ taskId, task, transferList });
      this.#pump();
    });
  }

  #pump() {
    while (!this.failure && this.idle.length > 0 && this.queue.length > 0) {
      const owner = this.idle.pop();
      const next = this.queue.shift();
      owner.taskId = next.taskId;
      owner.worker.postMessage(
        { taskId: next.taskId, task: next.task },
        next.transferList,
      );
    }
  }

  #settle(owner, message) {
    if (message.taskId !== owner.taskId) {
      this.#fail(new Error("Chunk reduction Worker task identity mismatch"));
      return;
    }
    const task = this.tasks.get(message.taskId);
    if (!task) {
      this.#fail(new Error("Chunk reduction Worker settled an unknown task"));
      return;
    }
    this.tasks.delete(message.taskId);
    owner.taskId = undefined;
    this.idle.push(owner);
    if (message.error) {
      task.reject(deserializeError(message.error));
    } else {
      task.resolve(message.result);
    }
    this.#pump();
  }

  #fail(error) {
    if (this.failure || this.destroyed) {
      return;
    }
    this.failure = error;
    for (const task of this.tasks.values()) {
      task.reject(error);
    }
    this.tasks.clear();
    this.queue.length = 0;
  }

  async destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const error = this.failure ?? new Error("Chunk reduction pool destroyed");
    for (const task of this.tasks.values()) {
      task.reject(error);
    }
    this.tasks.clear();
    this.queue.length = 0;
    await Promise.all(this.workers.map(({ worker }) => worker.terminate()));
    this.workers.length = 0;
    this.idle.length = 0;
  }
}
