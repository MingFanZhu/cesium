import {
  defined,
  DeveloperError,
  SceneGISPlanarCameraController,
} from "@cesium/engine";
import createCommand from "../createCommand.js";
import knockout from "../ThirdParty/knockout.js";

/**
 * The view model for {@link SceneGISPlanarHomeButton}.
 *
 * @alias SceneGISPlanarHomeButtonViewModel
 * @constructor
 *
 * @param {Scene} scene The planar scene to control.
 * @param {SceneGISPlanarCameraController} planarCameraController The controller
 *        that owns planar navigation for the scene.
 *
 * @exception {DeveloperError} <code>scene</code> is required.
 * @exception {DeveloperError} <code>planarCameraController</code> must be a live
 *            {@link SceneGISPlanarCameraController} for <code>scene.world</code>.
 */
function SceneGISPlanarHomeButtonViewModel(scene, planarCameraController) {
  //>>includeStart('debug', pragmas.debug);
  if (!defined(scene)) {
    throw new DeveloperError("scene is required.");
  }
  if (
    !(planarCameraController instanceof SceneGISPlanarCameraController) ||
    planarCameraController.world.isDestroyed() ||
    scene.world !== planarCameraController.world
  ) {
    throw new DeveloperError(
      "planarCameraController must be a live SceneGISPlanarCameraController for scene.world.",
    );
  }
  //>>includeEnd('debug');

  this._scene = scene;
  this._planarCameraController = planarCameraController;

  const that = this;
  this._command = createCommand(function () {
    that._planarCameraController.viewHome(that._scene);
  });

  /**
   * Gets or sets the tooltip. This property is observable.
   *
   * @type {string}
   */
  this.tooltip = "View Home";

  knockout.track(this, ["tooltip"]);
}

Object.defineProperties(SceneGISPlanarHomeButtonViewModel.prototype, {
  /**
   * Gets the planar scene to control.
   *
   * @memberof SceneGISPlanarHomeButtonViewModel.prototype
   * @type {Scene}
   * @readonly
   */
  scene: {
    get: function () {
      return this._scene;
    },
  },

  /**
   * Gets the planar camera controller.
   *
   * @memberof SceneGISPlanarHomeButtonViewModel.prototype
   * @type {SceneGISPlanarCameraController}
   * @readonly
   */
  planarCameraController: {
    get: function () {
      return this._planarCameraController;
    },
  },

  /**
   * Gets the command that immediately restores the planar home view.
   *
   * @memberof SceneGISPlanarHomeButtonViewModel.prototype
   * @type {Command}
   * @readonly
   */
  command: {
    get: function () {
      return this._command;
    },
  },
});

export default SceneGISPlanarHomeButtonViewModel;
