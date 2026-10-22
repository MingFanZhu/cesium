import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PointPrimitive from "../../../Scene/PointPrimitive.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";

const scratchOffset = new Cartesian3();

/**
 * Instance-local spatial policy for native EntityCluster. Owns no GPU resources.
 * @private
 */
class SceneGISPlanarEntityCluster {
  constructor(scene) {
    this._scene = scene;
    this._world = scene.world;
    this._view = new Matrix4();
    this._projection = new Matrix4();
    this._width = undefined;
    this._height = undefined;
  }

  static create(scene, cluster) {
    if (
      cluster._removeEventListener !== undefined &&
      cluster._scene !== scene &&
      (scene.world instanceof SceneGISPlanarWorld ||
        cluster._sceneGISPlanar !== undefined)
    ) {
      throw new DeveloperError(
        "A live planar EntityCluster cannot be shared across Scenes.",
      );
    }
    return scene.world instanceof SceneGISPlanarWorld
      ? new SceneGISPlanarEntityCluster(scene)
      : undefined;
  }

  update(cluster) {
    const scene = this._scene;
    if (this._world.isDestroyed() || scene.world !== this._world) {
      throw new DeveloperError(
        "EntityCluster must remain bound to its planar World.",
      );
    }
    if (!cluster.enabled) {
      return;
    }
    const camera = scene.camera;
    const projection = camera.frustum.projectionMatrix;
    const width = scene.canvas.clientWidth;
    const height = scene.canvas.clientHeight;
    if (
      !Matrix4.equals(this._view, camera.viewMatrix) ||
      !Matrix4.equals(this._projection, projection) ||
      this._width !== width ||
      this._height !== height
    ) {
      cluster._clusterDirty = true;
      Matrix4.clone(camera.viewMatrix, this._view);
      Matrix4.clone(projection, this._projection);
      this._width = width;
      this._height = height;
    }
  }

  isPointVisible(position) {
    const camera = this._scene.camera;
    Cartesian3.subtract(position, camera.positionWC, scratchOffset);
    return Cartesian3.dot(scratchOffset, camera.directionWC) > 0.0;
  }

  computeScreenSpacePosition(item) {
    if (item._pointPrimitiveCollection !== undefined) {
      // The native public Point method applies an additional Y flip. Use the
      // common top-left window convention and the current resolved XYZ instead.
      return PointPrimitive._computeScreenSpacePosition(
        item._pointPrimitiveCollection.modelMatrix,
        item.position,
        this._scene,
        new Cartesian2(),
      );
    }
    return item.computeScreenSpacePosition(this._scene);
  }

  prepare(cluster) {
    // Restore types excluded by the current flags as well as former members.
    for (const collection of [
      cluster._pointCollection,
      cluster._billboardCollection,
      cluster._labelCollection,
    ]) {
      if (collection !== undefined) {
        for (let i = 0; i < collection.length; ++i) {
          collection.get(i).clusterShow = true;
        }
      }
    }
  }
}

export default SceneGISPlanarEntityCluster;
