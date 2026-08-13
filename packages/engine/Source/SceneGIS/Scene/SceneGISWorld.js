// @ts-check

import DeveloperError from "../../Core/DeveloperError.js";

/**
 * Defines the lifecycle contract for the primary world owned by a {@link Scene}.
 * Implementations are selected when the scene is constructed and are structurally
 * compatible with this interface. This type is not intended to be instantiated
 * directly.
 *
 * @interface
 * @exception {DeveloperError} This interface must not be instantiated directly.
 */
class SceneGISWorld {
  constructor() {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Gets or sets whether the world is shown.
   *
   * @type {boolean}
   */
  show;

  /**
   * Gets whether the tiles required for the current view are loaded.
   *
   * @type {boolean}
   * @readonly
   */
  tilesLoaded;

  /**
   * Updates pass-invariant world state before rendering begins.
   *
   * @param {object} frameState The state for the current frame.
   * @returns {void}
   */
  update(frameState) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Prepares the world at the beginning of a rendered frame.
   *
   * @param {object} frameState The state for the current frame.
   * @returns {void}
   */
  beginFrame(frameState) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Adds the world's rendering commands for the current frame.
   *
   * @param {object} frameState The state for the current frame.
   * @returns {void}
   */
  render(frameState) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Renders world-owned background environment content before ordinary geometry.
   *
   * @param {object} frameState The state for the current frame.
   * @param {object} passState The active render pass state.
   * @returns {void}
   */
  renderEnvironment(frameState, passState) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Completes the world's work at the end of a rendered frame.
   *
   * @param {object} frameState The state for the current frame.
   * @returns {void}
   */
  endFrame(frameState) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Returns true if this object was destroyed; otherwise, false.
   *
   * @returns {boolean} True if this object was destroyed; otherwise, false.
   *
   * @see SceneGISWorld#destroy
   */
  isDestroyed() {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Destroys resources owned by this world.
   *
   * @returns {void}
   *
   * @see SceneGISWorld#isDestroyed
   */
  destroy() {
    DeveloperError.throwInstantiationError();
  }
}

export default SceneGISWorld;
