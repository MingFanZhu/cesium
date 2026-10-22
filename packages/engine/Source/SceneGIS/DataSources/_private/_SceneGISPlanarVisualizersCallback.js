import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import destroyObject from "../../../Core/destroyObject.js";
import CustomDataSource from "../../../DataSources/CustomDataSource.js";
import CzmlDataSource from "../../../DataSources/CzmlDataSource.js";
import Entity from "../../../DataSources/Entity.js";
import GeoJsonDataSource from "../../../DataSources/GeoJsonDataSource.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";
import SceneGISPlanarAnchorVisualizer from "./_SceneGISPlanarAnchorVisualizer.js";
import SceneGISPlanarAreaVisualizer from "./_SceneGISPlanarAreaVisualizer.js";
import SceneGISPlanarModelVisualizer from "./_SceneGISPlanarModelVisualizer.js";
import SceneGISPlanarPolygonVisualizer from "./_SceneGISPlanarPolygonVisualizer.js";
import SceneGISPlanarPolylineVisualizer from "./_SceneGISPlanarPolylineVisualizer.js";
import SceneGISPlanarPathVisualizer from "./_SceneGISPlanarPathVisualizer.js";
import SceneGISPlanarRouteVisualizer from "./_SceneGISPlanarRouteVisualizer.js";
import SceneGISPlanarSolidVisualizer from "./_SceneGISPlanarSolidVisualizer.js";

const allowedPropertyNames = new Set([
  "billboard",
  "box",
  "cylinder",
  "corridor",
  "description",
  "label",
  "ellipse",
  "ellipsoid",
  "model",
  "orientation",
  "point",
  "plane",
  "path",
  "polygon",
  "polyline",
  "polylineVolume",
  "position",
  "properties",
  "rectangle",
  "viewFrom",
  "wall",
]);

function getDataSourceName(dataSource) {
  return dataSource.name ?? "CustomDataSource";
}

function validateEntityProfile(dataSource) {
  const entities = dataSource.entities.values;
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const propertyNames = entity.propertyNames;
    for (let j = 0; j < propertyNames.length; j++) {
      const propertyName = propertyNames[j];
      if (
        !allowedPropertyNames.has(propertyName) &&
        Object.prototype.hasOwnProperty.call(Entity.prototype, propertyName) &&
        defined(entity[propertyName])
      ) {
        throw new DeveloperError(
          `Data source ${getDataSourceName(dataSource)} entity ${entity.id} has unsupported planar property ${propertyName}.`,
        );
      }
    }
  }
}

function validateGate(gate) {
  const world = gate._world;
  const scene = gate._scene;
  const dataSource = gate._dataSource;
  const entityCluster = gate._entityCluster;

  if (world.isDestroyed()) {
    throw new DeveloperError("world must remain live.");
  }
  if (scene.isDestroyed?.() === true || scene.world !== world) {
    throw new DeveloperError("scene must remain associated with world.");
  }
  if (
    !(dataSource instanceof CustomDataSource) &&
    !(
      dataSource instanceof GeoJsonDataSource &&
      dataSource._sceneGISGeoJson?.world === world
    ) &&
    !(
      dataSource instanceof CzmlDataSource &&
      dataSource._sceneGISCzml?.world === world
    )
  ) {
    throw new DeveloperError(
      "Planar visualization requires CustomDataSource, GeoJsonDataSource or CzmlDataSource loaded for this world.",
    );
  }
  if (entityCluster._scene !== scene) {
    throw new DeveloperError("entityCluster must belong to scene.");
  }
  validateEntityProfile(dataSource);
}

function destroyCandidates(candidates) {
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      candidates[i].destroy();
    } catch {
      // Preserve the constructor failure after best-effort rollback.
    }
  }
}

/**
 * Defers planar visualizer construction until the first validated update.
 *
 * @alias SceneGISPlanarVisualizersGate
 * @constructor
 * @private
 */
function SceneGISPlanarVisualizersGate(
  world,
  scene,
  entityCluster,
  dataSource,
  visualizers,
) {
  this._world = world;
  this._scene = scene;
  this._entityCluster = entityCluster;
  this._dataSource = dataSource;
  this._visualizers = visualizers;
  this._activated = false;
}

SceneGISPlanarVisualizersGate.prototype.update = function (time) {
  if (time === undefined) {
    throw new DeveloperError("time is required.");
  }
  validateGate(this);
  if (this._activated) {
    return true;
  }

  const dataSource = this._dataSource;
  const entities = dataSource.entities;
  const candidates = [];
  try {
    candidates.push(
      new SceneGISPlanarAnchorVisualizer(
        this._world,
        this._scene,
        this._entityCluster,
        entities,
      ),
    );
    candidates.push(
      new SceneGISPlanarModelVisualizer(
        this._world,
        this._scene,
        entities,
        dataSource._primitives,
      ),
    );
    candidates.push(
      new SceneGISPlanarPolylineVisualizer(
        this._world,
        this._scene,
        entities,
        dataSource._primitives,
      ),
    );
    candidates.push(
      new SceneGISPlanarPolygonVisualizer(
        this._world,
        this._scene,
        entities,
        dataSource._primitives,
      ),
    );
    candidates.push(
      new SceneGISPlanarSolidVisualizer(
        this._world,
        this._scene,
        entities,
        dataSource._primitives,
      ),
    );
    candidates.push(
      new SceneGISPlanarAreaVisualizer(
        this._world,
        this._scene,
        entities,
        dataSource._primitives,
      ),
    );
    candidates.push(
      new SceneGISPlanarRouteVisualizer(
        this._world,
        this._scene,
        entities,
        dataSource._primitives,
      ),
    );
    candidates.push(
      new SceneGISPlanarPathVisualizer(
        this._world,
        this._scene,
        entities,
        dataSource._primitives,
      ),
    );
  } catch (error) {
    destroyCandidates(candidates);
    throw error;
  }

  this._visualizers.push(...candidates);
  this._activated = true;
  return false;
};

SceneGISPlanarVisualizersGate.prototype.isDestroyed = function () {
  return false;
};

SceneGISPlanarVisualizersGate.prototype.destroy = function () {
  this._visualizers = undefined;
  return destroyObject(this);
};

/**
 * Creates an instance-local DataSourceDisplay callback for a planar world.
 *
 * @param {*} world The candidate primary world.
 * @returns {DataSourceDisplay.VisualizersCallback|undefined} The callback for a
 *          live planar world, or undefined to preserve Cesium's default path.
 * @private
 */
function createSceneGISPlanarVisualizersCallback(world) {
  if (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed()) {
    return undefined;
  }

  return function (scene, entityCluster, dataSource) {
    const visualizers = [];
    visualizers.push(
      new SceneGISPlanarVisualizersGate(
        world,
        scene,
        entityCluster,
        dataSource,
        visualizers,
      ),
    );
    return visualizers;
  };
}

export default createSceneGISPlanarVisualizersCallback;
