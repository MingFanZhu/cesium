import DeveloperError from "../../Core/DeveloperError.js";
import PostProcessStage from "../../Scene/PostProcessStage.js";
import Observer from "./_private/_SceneGISObserverState.js";
import VideoTexture from "./_private/_SceneGISVideoTexture.js";
import observerShader from "../../Shaders/SceneGIS/Viewshed/SceneGISObserverVisibility.js";
import fragmentShader from "../../Shaders/SceneGIS/Viewshed/SceneGISVideoProjection.js";

function opacity(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new DeveloperError("opacity must be between zero and one.");
  }
  return value;
}

function boolean(value, name) {
  if (typeof value !== "boolean") {
    throw new DeveloperError(`${name} must be boolean.`);
  }
  return value;
}

/**
 * 将借用的 SDR 视频投射到观察者可见的不透明场景表面。加入所绑定 Scene 的 postProcessStages，由集合负责销毁。球面坐标为 ECEF，平面为当前 World 的米制 XYZ。源选择与深度捕获独立于显示相机及太阳阴影图；媒体或观察者覆盖缺失时保留原画面。
 *
 * 视频等比例容纳于角度矩形内，不拉伸；留黑边区域保留场景颜色，视频黑色本身仍是内容。合成位于曝光和色调映射之后，是显示覆盖而非物理投影灯。不透明深度定义接收者，透明面既不接收也不阻挡，因此覆盖可能绘制在不透明接收点像素前的透明物体之上。多个投影和分析的叠加遵循原生后处理顺序。
 *
 * 播放、音频、跳转、src 和 srcObject 均由调用方控制。此类不会暂停视频或停止流轨道。要求 WebGL2、SCENE3D 及视频帧回调支持。精度受有限深度分辨率与源 LOD 约束，此 API 为实验性。
 *
 * gaussianTargets 非空时，仅向这些自有分段高斯投射，不再执行不透明表面覆盖。高斯共享显示和投影相机的选级预算，以片元透明度阈值近似遮挡表面；视频在高斯捕获 RGB 中混合，随后参与场景曝光与显示变换，保留原透明度。每个目标最多同时接收四路视频，顺序与 postProcessStages 一致。不修改数据页、SH 或借用目标的所有权。
 *
 * @alias SceneGISVideoProjection
 * @extends PostProcessStage
 * @param {object} options 配置。
 * @param {Scene} options.scene 存活的 SCENE3D Scene。
 * @param {Globe|SceneGISWorld} options.world 挂载到 scene 的精确 World。
 * @param {HTMLVideoElement} options.video 借用且可由 WebGL 读取的 SDR 视频。
 * @param {Cartesian3} options.position 投影器位置，单位为 World 米。
 * @param {Cartesian3} options.direction 投影器前向方向。
 * @param {Cartesian3} options.up 投影器向上方向，不得与 direction 平行。
 * @param {number} [options.distance=1000] 最大径向距离，单位为米。
 * @param {number} [options.near=0.5] 近裁剪距离，单位为米。
 * @param {number} [options.horizontalAngle=Math.PI/2] 水平角，单位为弧度，范围 (0,PI)。
 * @param {number} [options.verticalAngle=Math.PI/3] 竖直角，单位为弧度，范围 (0,PI)。
 * @param {number} [options.resolution=1024] 正方形观察者深度图尺寸。
 * @param {Array<Model|Cesium3DTileset|SceneGISS3MLayer|Primitive|SceneGISPlanarPrimitive>} [options.sources=[]] 借用 scene.primitives 中的显式遮挡物，不是接收者过滤器。
 * @param {Array<SceneGISGaussianSegmentedPrimitive>} [options.gaussianTargets=[]] 同一 Scene 任意层级集合中的自有高斯接收者，同时作为高斯遮挡物。非空时切换为高斯接收路径；创建后不可更换列表。
 * @param {number} [options.gaussianAlphaThreshold=0.3] 高斯遮挡深度的单片元透明度阈值，范围 (0,1]；不是多粒子累积透明度。
 * @param {boolean} [options.terrain=true] 遮挡是否包含 World 地形。
 * @param {number} [options.depthBias=0.1] 米制深度比较容差。
 * @param {number} [options.opacity=1] 显示混合权重，范围 [0,1]。
 * @param {boolean} [options.flipY=false] 附加的媒体竖直翻转。
 * @param {boolean} [options.enabled=true] 选择、捕获并投影。
 * @param {boolean} [options.showFrustum=false] 独立显示范围轮廓。
 * @param {string} [options.name] 唯一后处理阶段名称。
 * @exception {DeveloperError} 几何、媒体能力或 Scene/World 绑定无效。
 * @example
 * const projection = scene.postProcessStages.add(new Cesium.SceneGISVideoProjection({
 *   scene, world: scene.world, video, position, direction, up,
 *   sources: [tileset], distance: 2000, showFrustum: true,
 * }));
 * projection.opacity = 0.8;
 * // Removing releases GPU resources, but leaves the borrowed video playing.
 * scene.postProcessStages.remove(projection);
 */
class SceneGISVideoProjection extends PostProcessStage {
  constructor(options = {}) {
    const state = Observer.create(options);
    state.gaussianTargets = Observer.validateGaussianTargets(
      state.scene,
      options.gaussianTargets ?? [],
    );
    const threshold = options.gaussianAlphaThreshold ?? 0.3;
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
      throw new DeveloperError("gaussianAlphaThreshold must be in (0, 1].");
    }
    state.gaussianAlphaThreshold = threshold;
    state.opacity = opacity(options.opacity ?? 1);
    state.flipY = boolean(options.flipY ?? false, "flipY");
    // Create the media owner after the native constructor accepts its options.
    super({
      name: options.name,
      fragmentShader: observerShader + fragmentShader,
      uniforms: {
        ...Observer.uniforms(state),
        u_video: () =>
          state.media.texture ?? state.scene.context.defaultTexture,
        u_videoReady: () => state.media.ready,
        u_videoAspect: () => {
          const texture = state.media.texture;
          return texture ? texture.width / texture.height : 1;
        },
        u_frustumAspect: () => state.camera.frustum.aspectRatio,
        u_opacity: () => state.opacity,
        u_flipY: () => state.flipY,
        u_gaussianOnly: () => state.gaussianTargets.length > 0,
      },
    });
    state.media = new VideoTexture(
      state.scene,
      options.video,
      state.errorEvent,
    );
    this._observer = state;
    this.enabled = options.enabled ?? true;
    (state.scene._sceneGISObservers ??= new Set()).add(this);
  }

  /**
   *  精确所属 Scene。
   * @type {Scene}
   * @readonly
   */
  get scene() {
    return this._observer.scene;
  }

  /**
   * 借用的自有高斯目标列表，只读；非空表示高斯专用接收路径。
   * @type {Array<SceneGISGaussianSegmentedPrimitive>}
   * @readonly
   */
  get gaussianTargets() {
    return this._observer.gaussianTargets;
  }

  /**
   * 高斯遮挡的单片元透明度阈值，范围 (0,1]，不改变显示透明度。
   * @type {number}
   * @readonly
   */
  get gaussianAlphaThreshold() {
    return this._observer.gaussianAlphaThreshold;
  }

  /**
   * 是否启用投射。修改会请求重绘；禁用立即停止视频帧通知，但不暂停借用视频。
   * @type {boolean}
   * @default true
   */
  get enabled() {
    return this._videoEnabled;
  }
  set enabled(value) {
    this._videoEnabled = boolean(value, "enabled");
    // The base PostProcessStage constructor assigns enabled before the observer exists.
    const state = this._observer;
    if (state) {
      if (!value) {
        state.media.setActive(false);
      }
      state.analysisReady = false;
      state.scene.requestRender();
    }
  }

  /**
   *  精确绑定的 World。
   * @type {Globe|SceneGISWorld}
   * @readonly
   */
  get world() {
    return this._observer.world;
  }

  /**
   *  借用的媒体。替换仅解绑旧回调，不停止播放。
   *
   * @type {HTMLVideoElement}
   */
  get video() {
    return this._observer.media.video;
  }
  set video(value) {
    if (value !== this.video) {
      this._observer.media.setVideo(value);
      this.scene.requestRender();
    }
  }

  /**
   *  显示混合权重。
   * @type {number}
   * @default 1
   */
  get opacity() {
    return this._observer.opacity;
  }
  set opacity(value) {
    this._observer.opacity = opacity(value);
    this.scene.requestRender();
  }

  /**
   *  附加的媒体竖直翻转。
   * @type {boolean}
   * @default false
   */
  get flipY() {
    return this._observer.flipY;
  }
  set flipY(value) {
    this._observer.flipY = boolean(value, "flipY");
    this.scene.requestRender();
  }

  /**
   *  显示经深度测试的黄色观察者轮廓，独立于 enabled。
   *
   * @type {boolean}
   * @default false
   */
  get showFrustum() {
    return this._observer.showFrustum;
  }
  set showFrustum(value) {
    this._observer.showFrustum = boolean(value, "showFrustum");
    this.scene.requestRender();
  }

  /**
   *  当前渲染的完整观察者覆盖。
   * @type {boolean}
   * @readonly
   */
  get analysisReady() {
    return this.enabled && this._observer.analysisReady;
  }

  /**
   *  是否已上传有效媒体帧。
   * @type {boolean}
   * @readonly
   */
  get videoReady() {
    return this._observer.media.ready;
  }

  /**
   *  媒体与观察者覆盖是否均已就绪。
   * @type {boolean}
   * @readonly
   */
  get projectionReady() {
    return this.analysisReady && this.videoReady;
  }

  /**
   *  状态为 disabled、error、loading-video、loading-coverage 或 ready。
   *
   * @type {string}
   * @readonly
   */
  get status() {
    if (!this.enabled) {
      return "disabled";
    }
    if (this.error) {
      return "error";
    }
    return !this.videoReady
      ? "loading-video"
      : this.analysisReady
        ? "ready"
        : "loading-coverage";
  }

  /**
   *  最近媒体或覆盖失败。
   * @type {Error|undefined}
   * @readonly
   */
  get error() {
    return this._observer.media.error ?? this._observer.error;
  }

  /**
   *  媒体上传或观察者捕获错误时触发。
   * @type {Event}
   * @readonly
   */
  get errorEvent() {
    return this._observer.errorEvent;
  }

  /**
   *  捕获绘制次数与 CPU 时间、累计上传次数与 RGBA 字节数、最近上传 CPU 时间；这些时间不测量 GPU 完成耗时。
   * @type {object}
   * @readonly
   */
  get statistics() {
    const media = this._observer.media;
    return {
      ...this._observer.statistics,
      videoUploads: media.uploads,
      videoUploadBytes: media.uploadBytes,
      videoUploadMilliseconds: media.uploadMilliseconds,
    };
  }

  /**
   *  原子修改投影器，省略的标量保留原值。
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

  /** @private
   */
  update(context, useLogDepth) {
    const state = this._observer;
    if (context !== state.scene.context || state.world !== state.scene.world) {
      throw new DeveloperError(
        "VideoProjection requires its original Scene and World.",
      );
    }
    state.media.setActive(this.enabled);
    state.media.update(context);
    super.update(context, useLogDepth);
  }

  /**
   *  释放自有资源，不释放借用视频、轨道或源。
   * @returns {undefined}
   */
  destroy() {
    this.scene.requestRender();
    this._observer.media.destroy();
    Observer.destroy(this);
    return super.destroy();
  }
}

export default SceneGISVideoProjection;
