import BoundingSphere from "../../../Core/BoundingSphere.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import SceneGISPlanarGroundPrimitive from "../../Scene/SceneGISPlanarGroundPrimitive.js";

const scratchSphere = new BoundingSphere();

/**
 * Aggregates last-successful bounds for one visible primitive owner.
 *
 * @param {SceneGISPlanarPrimitiveOwner} owner The primitive owner.
 * @param {BoundingSphere} result The result sphere.
 * @returns {BoundingSphereState} The aggregate state.
 * @private
 */
function getSceneGISPlanarGroundBounds(owner, result) {
  let found = false;
  for (const primitive of owner.primitives) {
    if (
      primitive instanceof SceneGISPlanarGroundPrimitive &&
      !primitive.ready
    ) {
      return BoundingSphereState.PENDING;
    }
    primitive.getBoundingSphere(scratchSphere);
    if (!found) {
      BoundingSphere.clone(scratchSphere, result);
    } else {
      BoundingSphere.union(result, scratchSphere, result);
    }
    found = true;
  }
  return found ? BoundingSphereState.DONE : BoundingSphereState.FAILED;
}

export default getSceneGISPlanarGroundBounds;
