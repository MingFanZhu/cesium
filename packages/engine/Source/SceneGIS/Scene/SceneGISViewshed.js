import Color from "../../Core/Color.js";
import DeveloperError from "../../Core/DeveloperError.js";
import PostProcessStage from "../../Scene/PostProcessStage.js";
import Observer from "./_private/_SceneGISObserverState.js";
import observerShader from "../../Shaders/SceneGIS/Viewshed/SceneGISObserverVisibility.js";
import fragmentShader from "../../Shaders/SceneGIS/Viewshed/SceneGISViewshed.js";

/**
 * 绑定单个 Scene 与 World、基于方向深度图的通视分析。加入对应 Scene 的 postProcessStages 后由集合负责销毁。position、direction 和 up 使用 World 原生坐标：Globe 为 ECEF，平面为米制笛卡尔坐标，不隐式投影。
 *
 * 不透明和 alpha 掩码的显式源，以及可选 World 地形可遮挡；地形裙边、注记、分类与透明介质不遮挡。瓦片选择使用观察者视图，与 Scene 共享已加载几何。覆盖等待或失败时保持原画面。analysisReady 表示观察者覆盖，继承的 ready 仅表示后处理资源。精度受分辨率和源 LOD 限制，不是精确几何查询。不支持随相机缩放的模型（minimumPixelSize）、冻结瓦片遍历或立体渲染。此首版分析 API 为实验性。
 *
 * @alias SceneGISViewshed
 * @extends PostProcessStage
 * @param {object} options 配置。
 * @param {Scene} options.scene 存活的 SCENE3D Scene。
 * @param {Globe|SceneGISWorld} options.world 挂载到 scene 的精确 World。
 * @param {Cartesian3} options.position 观察者位置，单位为 World 米。
 * @param {Cartesian3} options.direction 观察者前向方向。
 * @param {Cartesian3} options.up 观察者向上方向，不得与 direction 平行。
 * @param {number} [options.distance=1000] 最大径向距离，单位为米。
 * @param {number} [options.near=0.5] 近裁剪距离，单位为米。
 * @param {number} [options.horizontalAngle=Math.PI/2] 水平角，单位为弧度，介于 0 和 PI 之间。
 * @param {number} [options.verticalAngle=Math.PI/3] 竖直角，单位为弧度，介于 0 和 PI 之间。
 * @param {number} [options.resolution=1024] 正方形观察者深度图尺寸。
 * @param {Array<Model|Cesium3DTileset|SceneGISS3MLayer|Primitive|SceneGISPlanarPrimitive>} [options.sources=[]] 借用 scene.primitives 中的显式遮挡物。
 * @param {boolean} [options.terrain=true] 包含绑定 World 的表面。
 * @param {number} [options.depthBias=0.1] 观察者深度比较容差，单位为米。
 * @param {Color} [options.visibleColor=Color.GREEN] 可见覆盖色与不透明度。
 * @param {Color} [options.hiddenColor=Color.RED] 被遮挡覆盖色与不透明度。
 * @param {boolean} [options.enabled=true] 是否选择、捕获并显示。
 * @param {boolean} [options.showFrustum=false] 独立于 enabled 显示观察者范围轮廓。
 * @param {string} [options.name] 唯一的原生后处理阶段名称。
 * @exception {DeveloperError} 几何无效、源不支持或 Scene/World 不匹配。
 * @example
 * const analysis = scene.postProcessStages.add(new Cesium.SceneGISViewshed({
 *   scene, world: scene.world, position, direction, up,
 *   sources: [tileset], distance: 1500,
 * }));
 * analysis.setView({ position: nextPosition, direction, up });
 * // Removing the stage releases analysis resources, never source geometry.
 * scene.postProcessStages.remove(analysis);
 */
class SceneGISViewshed extends PostProcessStage {
  constructor(options = {}) {
    const state = Observer.create(options);
    state.visible = Color.clone(
      options.visibleColor ?? Color.GREEN.withAlpha(0.35),
    );
    state.hidden = Color.clone(
      options.hiddenColor ?? Color.RED.withAlpha(0.35),
    );
    super({
      name: options.name,
      fragmentShader: observerShader + fragmentShader,
      uniforms: {
        ...Observer.uniforms(state),
        u_visibleColor: () => state.visible,
        u_hiddenColor: () => state.hidden,
      },
    });
    this._observer = state;
    this.enabled = options.enabled ?? true;
    (state.scene._sceneGISObservers ??= new Set()).add(this);
  }

  /**
   *  拥有此分析的精确 Scene。
   * @type {Scene}
   * @readonly
   */
  get scene() {
    return this._observer.scene;
  }

  /**
   *  构造时绑定的精确 World。
   * @type {Globe|SceneGISWorld}
   * @readonly
   */
  get world() {
    return this._observer.world;
  }

  /**
   * 显示角度、近平面及径向范围边界的黄色轮廓，独立于 enabled 和覆盖就绪状态。轮廓进行深度测试，不写深度、不投影、不遮挡分析、不参与拾取。隐藏时保留几何复用，阶段销毁时释放。
   * @type {boolean}
   * @default false
   */
  get showFrustum() {
    return this._observer.showFrustum;
  }

  set showFrustum(value) {
    if (typeof value !== "boolean") {
      throw new DeveloperError("showFrustum must be boolean.");
    }
    this._observer.showFrustum = value;
    this._observer.scene.requestRender();
  }

  /**
   *  当前观察者深度是否包含完整选中源覆盖。
   * @type {boolean}
   * @readonly
   */
  get analysisReady() {
    return this.enabled && this._observer.analysisReady;
  }

  /**
   *  状态为 loading、ready、disabled 或 error。
   * @type {string}
   * @readonly
   */
  get status() {
    return this.enabled ? this._observer.status : "disabled";
  }

  /**
   *  最近覆盖或捕获失败，成功捕获后为 undefined。
   * @type {Error|undefined}
   * @readonly
   */
  get error() {
    return this._observer.error;
  }

  /**
   *  覆盖或捕获错误时触发，无效绑定仍抛异常。
   * @type {Event}
   * @readonly
   */
  get errorEvent() {
    return this._observer.errorEvent;
  }

  /**
   *  最近捕获绘制调用与 CPU 提交时间的快照。
   * @type {object}
   * @readonly
   */
  get statistics() {
    return { ...this._observer.statistics };
  }

  /**
   * 原子修改观察者，省略的标量保留原值；新姿态须同时提供 position、direction、up。
   * @param {object} options 观察者配置。
   * @param {Cartesian3} options.position 世界位置。
   * @param {Cartesian3} options.direction 前向方向。
   * @param {Cartesian3} options.up 向上方向。
   * @param {number} [options.distance] 最大径向距离，单位为米。
   * @param {number} [options.near] 近裁剪距离，单位为米。
   * @param {number} [options.horizontalAngle] 水平角，单位为弧度。
   * @param {number} [options.verticalAngle] 竖直角，单位为弧度。
   */
  setView(options) {
    Observer.setView(this._observer, options);
  }

  /** @private */
  update(context, useLogDepth) {
    const state = this._observer;
    if (context !== state.scene.context || state.world !== state.scene.world) {
      throw new DeveloperError(
        "Viewshed cannot be used with a different Scene or World.",
      );
    }
    super.update(context, useLogDepth);
  }

  /**
   *  释放分析目标并注销观察者，源仅借用。
   * @returns {undefined}
   */
  destroy() {
    Observer.destroy(this);
    return super.destroy();
  }
}

export default SceneGISViewshed;
