import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import JulianDate from "../../../Core/JulianDate.js";
import PathVisualizer from "../../../DataSources/PathVisualizer.js";
import ReferenceFrame from "../../../Core/ReferenceFrame.js";

/**
 * Samples a fixed-frame PositionProperty through Cesium's isolated path helper.
 *
 * @param {PositionProperty} property The fixed-frame position property.
 * @param {JulianDate} start The inclusive sampling start.
 * @param {JulianDate} stop The inclusive sampling stop.
 * @param {JulianDate} updateTime The current update time.
 * @param {number} resolution The positive maximum sampling step in seconds.
 * @param {Cartesian3[]} result The reusable result array.
 * @returns {Cartesian3[]} Fixed-frame Cartesian snapshots.
 * @private
 */
function sample(property, start, stop, updateTime, resolution, result) {
  if (
    property === undefined ||
    property.referenceFrame !== ReferenceFrame.FIXED
  ) {
    throw new DeveloperError("position must use ReferenceFrame.FIXED.");
  }
  if (
    !(start instanceof JulianDate) ||
    !(stop instanceof JulianDate) ||
    !(updateTime instanceof JulianDate) ||
    JulianDate.compare(start, stop) >= 0 ||
    !Number.isFinite(resolution) ||
    resolution <= 0.0 ||
    !Array.isArray(result)
  ) {
    throw new DeveloperError(
      "The path interval, resolution, and result must be valid.",
    );
  }
  const sampled = PathVisualizer._subSample(
    property,
    start,
    stop,
    updateTime,
    ReferenceFrame.FIXED,
    resolution,
    result,
  );
  for (let i = 0; i < sampled.length; i++) {
    const position = sampled[i];
    if (
      !(position instanceof Cartesian3) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new DeveloperError("Sampled path positions must be finite.");
    }
    sampled[i] = Cartesian3.clone(position, sampled[i]);
  }
  return sampled;
}

const SceneGISPlanarPathSampler = { sample };
Object.freeze(SceneGISPlanarPathSampler);

export default SceneGISPlanarPathSampler;
