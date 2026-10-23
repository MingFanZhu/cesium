import { parentPort } from "node:worker_threads";
import {
  chunkReductionResultTransferList,
  dispatchChunkReductionTask,
} from "./chunkReduction.js";

if (!parentPort) {
  throw new Error("Chunk reduction Worker requires a parent port");
}

parentPort.on("message", async (message) => {
  try {
    const result = await dispatchChunkReductionTask(message.task);
    const transferList = chunkReductionResultTransferList(result);
    parentPort.postMessage(
      {
        taskId: message.taskId,
        result,
      },
      transferList,
    );
  } catch (error) {
    parentPort.postMessage({
      taskId: message.taskId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  }
});
