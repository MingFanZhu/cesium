// @ts-check

/**
 * A tonemapping algorithm when rendering with high dynamic range.
 *
 * @enum {string}
 */
const Tonemapper = {
  /**
   * Use the Reinhard tonemapping.
   *
   * @type {string}
   * @constant
   */
  REINHARD: "REINHARD",

  /**
   * Use the modified Reinhard tonemapping.
   *
   * @type {string}
   * @constant
   */
  MODIFIED_REINHARD: "MODIFIED_REINHARD",

  /**
   * Use the Filmic tonemapping.
   *
   * @type {string}
   * @constant
   */
  FILMIC: "FILMIC",

  /**
   * Use the ACES tonemapping.
   *
   * @type {string}
   * @constant
   */
  ACES: "ACES",

  /**
   * Use the PBR Neutral tonemapping {@link https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral|from Khronos}.
   *
   * @type {string}
   * @constant
   */
  PBR_NEUTRAL: "PBR_NEUTRAL",
  // SCENEGIS_PATCH_BEGIN SGP-0060: Expose the owned AgX HDR display curve.
  /**
   * Use neutral-look AgX tonemapping in linear sRGB, followed by Scene gamma.
   * Exposure remains controlled by PostProcessStageCollection.
   *
   * @type {string}
   * @constant
   */
  AGX: "AGX",
  // SCENEGIS_PATCH_END SGP-0060
};

/**
 * Validate whether the provided value is a known Tonemapper type
 * @private
 *
 * @param {string} tonemapper
 */
export function validateTonemapper(tonemapper) {
  return (
    tonemapper === Tonemapper.REINHARD ||
    tonemapper === Tonemapper.MODIFIED_REINHARD ||
    tonemapper === Tonemapper.FILMIC ||
    tonemapper === Tonemapper.ACES ||
    // SCENEGIS_PATCH_BEGIN SGP-0060: Accept AgX through the existing selection API.
    tonemapper === Tonemapper.AGX ||
    // SCENEGIS_PATCH_END SGP-0060
    tonemapper === Tonemapper.PBR_NEUTRAL
  );
}

Object.freeze(Tonemapper);

export default Tonemapper;
