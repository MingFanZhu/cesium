import DeveloperError from "../../../Core/DeveloperError.js";

/** A batch-local, linearly packed table of periodic dash intervals. @private */
function SceneGISVectorTileDashes() {
  this.values = [];
  this._patterns = new Map();
}

SceneGISVectorTileDashes.prototype.add = function (array) {
  if (array === undefined) {
    return [0, 0, 0];
  }
  if (
    !Array.isArray(array) ||
    array.length === 0 ||
    array.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new DeveloperError(
      "line-dasharray must contain finite nonnegative lengths.",
    );
  }
  const period = array.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(period) || period <= 0) {
    throw new DeveloperError(
      "line-dasharray must have a finite positive total length.",
    );
  }
  const key = JSON.stringify(array);
  let entry = this._patterns.get(key);
  if (entry !== undefined) {
    return entry;
  }
  const start = this.values.length / 4;
  let position = 0;
  for (let i = 0; i < array.length; i++) {
    if (i % 2 === 0) {
      const left =
        i === 0 && array.length % 2 === 1 ? -array[array.length - 1] : position;
      this.values.push(left, position + array[i], 0, 0);
    }
    position += array[i];
  }
  entry = [start, this.values.length / 4 - start, period];
  this._patterns.set(key, entry);
  return entry;
};

export default SceneGISVectorTileDashes;
