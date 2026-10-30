import {
  defined,
  DeveloperError,
  SceneGISPlanarCameraController,
} from "@cesium/engine";
import createCommand from "../createCommand.js";
import knockout from "../ThirdParty/knockout.js";

/**
 * {@link SceneGISPlanarHomeButton} 的视图模型。
 *
 * @alias SceneGISPlanarHomeButtonViewModel
 * @constructor
 *
 * @param {Scene} scene 要控制的平面场景。
 * @param {SceneGISPlanarCameraController} planarCameraController 管理场景平面导航的控制器。
 *
 * @exception {DeveloperError} 必须提供 <code>scene</code>。
 * @exception {DeveloperError} <code>planarCameraController</code> 必须是与 <code>scene.world</code> 对应的存活 {@link SceneGISPlanarCameraController}。
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
   * 获取或设置工具提示，此属性可观测。
   *
   * @type {string}
   */
  this.tooltip = "View Home";

  knockout.track(this, ["tooltip"]);
}

Object.defineProperties(SceneGISPlanarHomeButtonViewModel.prototype, {
  /**
   * 获取要控制的平面场景。
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
   * 获取平面相机控制器。
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
   * 获取立即恢复平面初始视图的命令。
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
