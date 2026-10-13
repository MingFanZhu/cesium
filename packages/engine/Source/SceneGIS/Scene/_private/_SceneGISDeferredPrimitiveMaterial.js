import Appearance from "../../../Scene/Appearance.js";
import instanceColor from "../../../Shaders/Appearances/PerInstanceColorAppearanceFS.js";
import basic from "../../../Shaders/Appearances/BasicMaterialAppearanceFS.js";
import textured from "../../../Shaders/Appearances/TexturedMaterialAppearanceFS.js";
import all from "../../../Shaders/Appearances/AllMaterialAppearanceFS.js";
import ellipsoid from "../../../Shaders/Appearances/EllipsoidSurfaceAppearanceFS.js";

const sources = new Set([instanceColor, basic, textured, all, ellipsoid]);

/** @private */
function preparePrimitiveMaterial(appearance, source) {
  if (
    !appearance.flat &&
    appearance.getFragmentShaderSource ===
      Appearance.prototype.getFragmentShaderSource &&
    sources.has(appearance.fragmentShaderSource)
  ) {
    return `#define SCENEGIS_DEFERRED_PHONG_MATERIAL\n${source}`;
  }
  return source;
}

export default preparePrimitiveMaterial;
