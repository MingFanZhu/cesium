import createVectorTaskHandler from "../SceneGIS/Core/_private/_SceneGISVectorWorkerTasks.js";
import createTaskProcessorWorker from "./createTaskProcessorWorker.js";

export default createTaskProcessorWorker(createVectorTaskHandler());
