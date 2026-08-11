import processSceneGISPlanarTerrainTask from "../SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerTasks.js";
import createTaskProcessorWorker from "./createTaskProcessorWorker.js";

export default createTaskProcessorWorker(processSceneGISPlanarTerrainTask);
