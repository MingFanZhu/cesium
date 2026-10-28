// @ts-check

/**
 * The direction to display a primitive or ImageryLayer relative to the {@link Scene#splitPosition}.
 *
 * @enum {number}
 *
 * @see ImageryLayer#splitDirection
 * @see Cesium3DTileset#splitDirection
 */
const SplitDirection = {
  /**
   * Display the primitive or ImageryLayer to the left of the {@link Scene#splitPosition}.
   *
   * @type {number}
   * @constant
   */
  LEFT: -1.0,

  /**
   *  Always display the primitive or ImageryLayer.
   *
   * @type {number}
   * @constant
   */
  NONE: 0.0,

  /**
   * Display the primitive or ImageryLayer to the right of the {@link Scene#splitPosition}.
   *
   * @type {number}
   * @constant
   */
  RIGHT: 1.0,
  // SCENEGIS_PATCH_BEGIN SGP-0071: Extend native splitting to the vertical axis.
  /**
   * Display the primitive or ImageryLayer above the {@link Scene#splitPosition}.
   * The split position is measured from the top of the viewport.
   *
   * @type {number}
   * @constant
   */
  TOP: -2.0,

  /**
   * Display the primitive or ImageryLayer below the {@link Scene#splitPosition}.
   * The split position is measured from the top of the viewport.
   *
   * @type {number}
   * @constant
   */
  BOTTOM: 2.0,
  // SCENEGIS_PATCH_END SGP-0071
};

Object.freeze(SplitDirection);

export default SplitDirection;
