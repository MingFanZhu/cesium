import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import RuntimeError from "../../../Core/RuntimeError.js";

/** CPU pattern metadata and per-feature attributes shared by all map backends. @private */
const VectorPattern = {};

VectorPattern.image = function (images, name) {
  const image = images?.[name];
  if (!image) {
    throw new RuntimeError(`Missing vector pattern image: ${name}`);
  }
  const { x, y, width, height, pixelRatio = 1 } = image;
  if (
    ![x, y, width, height].every(Number.isSafeInteger) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(pixelRatio) ||
    pixelRatio <= 0 ||
    image.sdf
  ) {
    throw new RuntimeError(`Invalid ordinary sprite pattern: ${name}`);
  }
  return {
    rect: [x, y, width, height],
    size: [width / pixelRatio, height / pixelRatio],
  };
};

VectorPattern.attach = function (geometry, image) {
  const count = geometry.attributes.position.values.length / 3;
  for (const [name, value] of [
    ["patternRect", image.rect],
    ["patternSize", image.size],
  ]) {
    const values = new Float32Array(count * value.length);
    for (let i = 0; i < count; i++) {
      values.set(value, i * value.length);
    }
    geometry.attributes[name] = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: value.length,
      values,
    });
  }
};

export default VectorPattern;
