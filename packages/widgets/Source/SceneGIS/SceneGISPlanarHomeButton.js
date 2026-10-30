import {
  defined,
  destroyObject,
  DeveloperError,
  getElement,
} from "@cesium/engine";
import knockout from "../ThirdParty/knockout.js";
import SceneGISPlanarHomeButtonViewModel from "./SceneGISPlanarHomeButtonViewModel.js";

/**
 * 立即恢复平面世界初始视图的按钮。
 *
 * @alias SceneGISPlanarHomeButton
 * @constructor
 *
 * @param {Element|string} container 包含 Widget 的 DOM 元素或 ID。
 * @param {Scene} scene 要控制的平面场景。
 * @param {SceneGISPlanarCameraController} planarCameraController 管理场景平面导航的控制器。
 *
 * @exception {DeveloperError} 必须提供 <code>container</code>。
 * @exception {DeveloperError} <code>scene</code> 或 <code>planarCameraController</code> 无效。
 */
function SceneGISPlanarHomeButton(container, scene, planarCameraController) {
  //>>includeStart('debug', pragmas.debug);
  if (!defined(container)) {
    throw new DeveloperError("container is required.");
  }
  //>>includeEnd('debug');

  container = getElement(container);

  const viewModel = new SceneGISPlanarHomeButtonViewModel(
    scene,
    planarCameraController,
  );
  viewModel._svgPath =
    "M14,4l-10,8.75h20l-4.25-3.7188v-4.6562h-2.812v2.1875l-2.938-2.5625zm-7.0938,9.906v10.094h14.094v-10.094h-14.094zm2.1876,2.313h3.3122v4.25h-3.3122v-4.25zm5.8442,1.281h3.406v6.438h-3.406v-6.438z";

  const element = document.createElement("button");
  element.type = "button";
  element.className = "cesium-button cesium-toolbar-button cesium-home-button";
  element.setAttribute(
    "data-bind",
    "\
attr: { title: tooltip },\
click: command,\
cesiumSvgPath: { path: _svgPath, width: 28, height: 28 }",
  );
  container.appendChild(element);
  knockout.applyBindings(viewModel, element);

  this._container = container;
  this._viewModel = viewModel;
  this._element = element;
}

Object.defineProperties(SceneGISPlanarHomeButton.prototype, {
  /**
   * 获取父容器。
   *
   * @memberof SceneGISPlanarHomeButton.prototype
   * @type {Element}
   * @readonly
   */
  container: {
    get: function () {
      return this._container;
    },
  },

  /**
   * 获取视图模型。
   *
   * @memberof SceneGISPlanarHomeButton.prototype
   * @type {SceneGISPlanarHomeButtonViewModel}
   * @readonly
   */
  viewModel: {
    get: function () {
      return this._viewModel;
    },
  },
});

/**
 * @returns {boolean} 对象已销毁时为 true，否则为 false。
 */
SceneGISPlanarHomeButton.prototype.isDestroyed = function () {
  return false;
};

/**
 * 销毁 Widget。
 */
SceneGISPlanarHomeButton.prototype.destroy = function () {
  knockout.cleanNode(this._element);
  this._container.removeChild(this._element);
  return destroyObject(this);
};

export default SceneGISPlanarHomeButton;
