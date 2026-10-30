// @ts-check

import DeveloperError from "../../Core/DeveloperError.js";

/**
 * 定义 {@link Scene} 所有的主世界生命周期契约。实现在场景构造时选择，并与此接口保持结构兼容。此类型不应直接实例化。
 *
 * @interface
 * @exception {DeveloperError} 此接口不能直接实例化。
 */
class SceneGISWorld {
  constructor() {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 获取或设置是否显示世界。
   *
   * @type {boolean}
   */
  show;

  /**
   * 获取当前视图必需瓦片是否已加载。
   *
   * @type {boolean}
   * @readonly
   */
  tilesLoaded;

  /**
   * 渲染开始前更新与通道无关的世界状态。
   *
   * @param {object} frameState 当前帧状态。
   * @returns {void}
   */
  update(frameState) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 渲染帧开始时准备世界。
   *
   * @param {object} frameState 当前帧状态。
   * @returns {void}
   */
  beginFrame(frameState) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 添加此世界当前帧的渲染命令。
   *
   * @param {object} frameState 当前帧状态。
   * @returns {void}
   */
  render(frameState) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 在普通几何之前绘制 World 所有的背景环境内容。
   *
   * @param {object} frameState 当前帧状态。
   * @param {object} passState 当前渲染通道状态。
   * @returns {void}
   */
  renderEnvironment(frameState, passState) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 渲染帧结束时完成世界工作。
   *
   * @param {object} frameState 当前帧状态。
   * @returns {void}
   */
  endFrame(frameState) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 此对象已销毁时返回 true，否则返回 false。
   *
   * @returns {boolean} 此对象已销毁时为 true，否则为 false。
   *
   * @see SceneGISWorld#destroy
   */
  isDestroyed() {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 销毁此世界所有的资源。
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
