import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import HeightReference from "../../../Scene/HeightReference.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";

function validateWorld(world) {
  if (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed()) {
    throw new DeveloperError("world must be a live SceneGISPlanarWorld.");
  }
}

function validatePosition(position) {
  if (
    !(position instanceof Cartesian3) ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    throw new DeveloperError(
      "position must be a Cartesian3 with finite components.",
    );
  }
}

function validateHeightReference(heightReference) {
  if (
    heightReference !== HeightReference.NONE &&
    heightReference !== HeightReference.CLAMP_TO_GROUND &&
    heightReference !== HeightReference.RELATIVE_TO_GROUND
  ) {
    throw new DeveloperError(
      "heightReference must be NONE, CLAMP_TO_GROUND, or RELATIVE_TO_GROUND.",
    );
  }
}

function validateResult(result) {
  if (result !== undefined && !(result instanceof Cartesian3)) {
    throw new DeveloperError("result must be a Cartesian3.");
  }
}

/**
 * Resolves planar content positions against a bounded planar world and its
 * currently resident terrain height.
 *
 * @namespace SceneGISPlanarPositionResolver
 * @private
 */
const SceneGISPlanarPositionResolver = {};

/**
 * Resolves a finite planar position to an absolute position.
 *
 * @param {SceneGISPlanarWorld} world The live planar world.
 * @param {Cartesian3} position The position in meters using fixed planar axes.
 * @param {HeightReference} heightReference The supported height reference.
 * @param {Cartesian3} [result] The object in which to store the result.
 * @returns {Cartesian3|undefined} The resolved position, or undefined when the anchor is outside the world extent.
 *
 * @exception {DeveloperError} <code>world</code> is not a live SceneGISPlanarWorld.
 * @exception {DeveloperError} <code>position</code> is not a Cartesian3 with finite components.
 * @exception {DeveloperError} <code>heightReference</code> is unsupported.
 * @exception {DeveloperError} <code>result</code> is defined and is not a Cartesian3.
 * @exception {DeveloperError} The resident terrain height or derived relative height is not finite.
 */
SceneGISPlanarPositionResolver.resolve = function (
  world,
  position,
  heightReference,
  result,
) {
  validateWorld(world);
  validatePosition(position);
  validateHeightReference(heightReference);
  validateResult(result);

  const x = position.x;
  const y = position.y;
  const inputZ = position.z;
  const extent = world.coordinateSystem.extent;
  if (
    x < extent.minimumX ||
    x > extent.maximumX ||
    y < extent.minimumY ||
    y > extent.maximumY
  ) {
    return undefined;
  }

  let resolvedZ = inputZ;
  if (heightReference !== HeightReference.NONE) {
    const terrainHeight = world.getTerrainHeight(position);
    const surfaceHeight = terrainHeight ?? 0.0;
    if (!Number.isFinite(surfaceHeight)) {
      throw new DeveloperError(
        "The resident terrain height must be finite when defined.",
      );
    }

    resolvedZ =
      heightReference === HeightReference.CLAMP_TO_GROUND
        ? surfaceHeight
        : surfaceHeight + inputZ;
    if (!Number.isFinite(resolvedZ)) {
      throw new DeveloperError("The resolved height must be finite.");
    }
  }

  if (result === undefined) {
    return new Cartesian3(x, y, resolvedZ);
  }

  result.x = x;
  result.y = y;
  result.z = resolvedZ;
  return result;
};

export default SceneGISPlanarPositionResolver;
