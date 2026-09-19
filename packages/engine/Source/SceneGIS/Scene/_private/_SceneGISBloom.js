import PixelDatatype from "../../../Renderer/PixelDatatype.js";

function setDatatype(stage, datatype) {
  if (stage.length !== undefined) {
    let changed = false;
    for (let i = 0; i < stage.length; i++) {
      changed = setDatatype(stage.get(i), datatype) || changed;
    }
    return changed;
  }
  if (stage._pixelDatatype === datatype) {
    return false;
  }
  stage._pixelDatatype = datatype;
  return true;
}

/** Keep native bloom intermediates in the Scene framebuffer's precision.
 * @private
 */
const SceneGISBloom = {
  update(bloom, context, useHdr) {
    const datatype = useHdr
      ? context.halfFloatingPointTexture
        ? PixelDatatype.HALF_FLOAT
        : PixelDatatype.FLOAT
      : PixelDatatype.UNSIGNED_BYTE;
    return setDatatype(bloom, datatype);
  },
};

export default SceneGISBloom;
