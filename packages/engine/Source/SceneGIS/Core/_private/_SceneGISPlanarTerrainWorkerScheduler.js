import TaskProcessor from "../../../Core/TaskProcessor.js";

let taskProcessor;

function getTaskProcessor() {
  taskProcessor ??= new TaskProcessor("SceneGISPlanarTerrainWorker");
  return taskProcessor;
}

/**
 * Private lazy scheduler for the shared SceneGIS planar terrain Worker.
 *
 * @private
 */
const SceneGISPlanarTerrainWorkerScheduler = {
  scheduleDecodeLerc(parameters, transferableObjects) {
    return getTaskProcessor().scheduleTask(parameters, transferableObjects);
  },
  scheduleCreateHeightmapMesh(parameters, transferableObjects) {
    return getTaskProcessor().scheduleTask(parameters, transferableObjects);
  },
  scheduleDecodeQuantizedMesh(parameters, transferableObjects) {
    return getTaskProcessor().scheduleTask(parameters, transferableObjects);
  },
  scheduleCreateQuantizedMeshMesh(parameters, transferableObjects) {
    return getTaskProcessor().scheduleTask(parameters, transferableObjects);
  },
  scheduleUpsampleQuantizedMesh(parameters, transferableObjects) {
    return getTaskProcessor().scheduleTask(parameters, transferableObjects);
  },
  _getTaskProcessor: getTaskProcessor,
};

export default SceneGISPlanarTerrainWorkerScheduler;
