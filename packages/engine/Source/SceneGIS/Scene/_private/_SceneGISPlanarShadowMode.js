import DeveloperError from "../../../Core/DeveloperError.js";
import ShadowMode from "../../../Scene/ShadowMode.js";

/** @private */
function validatePlanarShadowMode(value) {
  if (
    !Number.isInteger(value) ||
    value < ShadowMode.DISABLED ||
    value > ShadowMode.RECEIVE_ONLY
  ) {
    throw new DeveloperError("shadows must be a ShadowMode value.");
  }
  return value;
}
export default validatePlanarShadowMode;
