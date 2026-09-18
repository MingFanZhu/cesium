import DeveloperError from "../../../Core/DeveloperError.js";
import DistanceDisplayCondition from "../../../Core/DistanceDisplayCondition.js";
import DistanceDisplayConditionGeometryInstanceAttribute from "../../../Core/DistanceDisplayConditionGeometryInstanceAttribute.js";
import Property from "../../../DataSources/Property.js";

// Native distance attributes use Float32, while the public default far is MAX_VALUE.
const maximumFloat = 3.4028234663852886e38;

function toValue(condition, result) {
  const value = DistanceDisplayConditionGeometryInstanceAttribute.toValue(
    condition,
    result,
  );
  value[1] = Math.min(condition.far, maximumFloat);
  return value;
}

/**
 * Shares native distance attributes between planar line and polygon visualizers.
 *
 * @alias SceneGISPlanarDistanceDisplayCondition
 * @private
 */
const SceneGISPlanarDistanceDisplayCondition = {
  getValue: function (property, time) {
    const condition = Property.getValueOrUndefined(property, time);
    if (
      condition !== undefined &&
      (!Number.isFinite(condition.near) ||
        !Number.isFinite(condition.far) ||
        !Number.isFinite(Math.fround(condition.near)) ||
        condition.near < 0 ||
        condition.far <= condition.near)
    ) {
      throw new DeveloperError(
        "distanceDisplayCondition must have ordered finite bounds and a representable near distance.",
      );
    }
    return condition;
  },

  createAttribute: function (condition) {
    if (condition === undefined) {
      return undefined;
    }
    const attribute =
      DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(
        condition,
      );
    toValue(condition, attribute.value);
    return attribute;
  },

  update: function (owner, condition) {
    if (
      DistanceDisplayCondition.equals(owner.distanceDisplayCondition, condition)
    ) {
      return true;
    }
    if (owner.primitives.some((primitive) => !primitive.ready)) {
      return false;
    }
    for (const primitive of owner.primitives) {
      const attributes = primitive.getGeometryInstanceAttributes();
      attributes.distanceDisplayCondition = toValue(
        condition,
        attributes.distanceDisplayCondition,
      );
    }
    owner.distanceDisplayCondition = DistanceDisplayCondition.clone(
      condition,
      owner.distanceDisplayCondition,
    );
    return true;
  },
};

export default SceneGISPlanarDistanceDisplayCondition;
