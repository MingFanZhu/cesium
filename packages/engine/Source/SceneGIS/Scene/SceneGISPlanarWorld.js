import Color from "../../Core/Color.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import Material from "../../Scene/Material.js";
import ClippingPlaneCollection from "../../Scene/ClippingPlaneCollection.js";
import ClippingPolygonCollection from "../../Scene/ClippingPolygonCollection.js";
import SceneMode from "../../Scene/SceneMode.js";
import ShadowMode from "../../Scene/ShadowMode.js";
import validatePlanarShadowMode from "./_private/_SceneGISPlanarShadowMode.js";
import SceneGISPlanarCoordinateSystem from "../Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarTilingScheme from "../Core/SceneGISPlanarTilingScheme.js";
/* eslint-disable no-unused-vars -- Public JSDoc type requires a runtime-resolvable import. */
import SceneGISPlanarTerrainProvider from "../Core/SceneGISPlanarTerrainProvider.js";
/* eslint-enable no-unused-vars */
import SceneGISPlanarCamera from "./_private/_SceneGISPlanarCamera.js";
import SceneGISPlanarAtmosphereRenderer from "./_private/_SceneGISPlanarAtmosphereRenderer.js";
import SceneGISPlanarCelestialBodyRenderer from "./_private/_SceneGISPlanarCelestialBodyRenderer.js";
import SceneGISPlanarSurface from "./_private/_SceneGISPlanarSurface.js";
import { validateTerrainProvider } from "./_private/_SceneGISPlanarTerrain.js";
import SceneGISPlanarImageryLayerCollection from "./SceneGISPlanarImageryLayerCollection.js";

const scratchPickRay = {
  origin: new Cartesian3(),
  direction: new Cartesian3(),
};

function validateRay(ray) {
  if (
    !ray ||
    !ray.origin ||
    !ray.direction ||
    !Number.isFinite(ray.origin.x) ||
    !Number.isFinite(ray.origin.y) ||
    !Number.isFinite(ray.origin.z) ||
    !Number.isFinite(ray.direction.x) ||
    !Number.isFinite(ray.direction.y) ||
    !Number.isFinite(ray.direction.z)
  ) {
    throw new DeveloperError(
      "ray must have finite origin and direction components.",
    );
  }
  const magnitude = Math.hypot(
    ray.direction.x,
    ray.direction.y,
    ray.direction.z,
  );
  if (!Number.isFinite(magnitude) || magnitude === 0.0) {
    throw new DeveloperError("ray.direction must be non-zero and finite.");
  }
}

function validateMaximumScreenSpaceError(value) {
  if (!Number.isFinite(value) || value <= 0.0) {
    throw new DeveloperError(
      "maximumScreenSpaceError must be a finite positive number.",
    );
  }
}

function validateTileCacheSize(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new DeveloperError("tileCacheSize must be a non-negative integer.");
  }
}

function validateMaximumTiltedTileDistance(value) {
  if (typeof value !== "number" || !(value > 0.0)) {
    throw new DeveloperError(
      "maximumTiltedTileDistance must be positive or Infinity.",
    );
  }
}

function validateBaseColor(value) {
  if (!(value instanceof Color) || value.alpha !== 1.0) {
    throw new DeveloperError("baseColor must be an opaque Color.");
  }
}

function validateEnableLighting(value) {
  if (typeof value !== "boolean") {
    throw new DeveloperError("enableLighting must be a boolean.");
  }
}

function validateLambertDiffuseMultiplier(value) {
  if (!Number.isFinite(value) || value < 0.0) {
    throw new DeveloperError(
      "lambertDiffuseMultiplier must be a finite non-negative number.",
    );
  }
}

function validateMaterial(value) {
  if (
    value !== undefined &&
    (!(value instanceof Material) || value.isDestroyed())
  ) {
    throw new DeveloperError(
      "material must be an undestroyed Material or undefined.",
    );
  }
}

function setClippingCollection(world, key, value, Type) {
  if (value === world[key]) {
    return;
  }
  if (
    value !== undefined &&
    (!(value instanceof Type) ||
      value.isDestroyed() ||
      value._owner !== undefined)
  ) {
    throw new DeveloperError(
      "A clipping collection must be live and owned by at most one World or object.",
    );
  }
  world[key]?.destroy();
  world[key] = value;
  if (value !== undefined) {
    value._owner = world;
  }
}

/**
 * 有界米制平面主世界，提供平坦或高度图地形表面，默认不透明，可选几何光照，以及有序的栅格影像图层集合。支持在 {@link SceneMode.SCENE3D} 中以程序设置透视或正交相机。
 *
 * @alias SceneGISPlanarWorld
 * @constructor
 *
 * @param {object} options 包含以下属性的对象：
 * @param {SceneGISPlanarCoordinateSystem} [options.coordinateSystem] 平面坐标系，未提供 tilingScheme 时必需。
 * @param {SceneGISPlanarTilingScheme} [options.tilingScheme] 已有标准切片方案，例如元数据地形提供者的方案。若同时提供 coordinateSystem，两者须引用同一对象。
 * @param {number} options.maximumLevel 可选的最高地表层级。
 * @param {number} [options.maximumScreenSpaceError=2.0] 细化阈值，单位为像素。
 * @param {number} [options.tileCacheSize=100] 每帧后保留的未保护瓦片数。
 * @param {Color} [options.baseColor=Color.GRAY] 不透明地表颜色。
 * @param {boolean} [options.enableLighting=false] 是否启用几何 Lambert 光照。
 * @param {ShadowMode} [options.shadows=ShadowMode.RECEIVE_ONLY] 场景阴影启用时地表是否投射或接收几何阴影。
 * @param {number} [options.lambertDiffuseMultiplier=0.9] 应用于 Lambert 漫反射光照的非负倍率。
 *
 * @exception {DeveloperError} <code>options.coordinateSystem</code> 不是 SceneGISPlanarCoordinateSystem。
 * @exception {DeveloperError} <code>options.maximumLevel</code> 无效或超过坐标系安全层级。
 * @exception {DeveloperError} 根瓦片或最高层级瓦片比例无法表示为有限正 Float32。
 * @exception {DeveloperError} <code>options.maximumScreenSpaceError</code> 不是有限正数。
 * @exception {DeveloperError} <code>options.tileCacheSize</code> 不是非负整数。
 * @exception {DeveloperError} <code>options.baseColor</code> 不是不透明 Color。
 * @exception {DeveloperError} <code>options.enableLighting</code> 不是布尔值。
 * @exception {DeveloperError} <code>options.lambertDiffuseMultiplier</code> 不是有限非负数。
 */
function SceneGISPlanarWorld(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  const suppliedScheme = options.tilingScheme;
  if (
    suppliedScheme !== undefined &&
    !(suppliedScheme instanceof SceneGISPlanarTilingScheme)
  ) {
    throw new DeveloperError(
      "options.tilingScheme must be a SceneGISPlanarTilingScheme.",
    );
  }
  const coordinateSystem =
    options.coordinateSystem ?? suppliedScheme?.coordinateSystem;
  if (!(coordinateSystem instanceof SceneGISPlanarCoordinateSystem)) {
    throw new DeveloperError(
      "options.coordinateSystem must be a SceneGISPlanarCoordinateSystem.",
    );
  }

  if (
    suppliedScheme !== undefined &&
    suppliedScheme.coordinateSystem !== coordinateSystem
  ) {
    throw new DeveloperError(
      "options.coordinateSystem must be the tiling scheme's coordinateSystem.",
    );
  }
  const tilingScheme =
    suppliedScheme ?? new SceneGISPlanarTilingScheme({ coordinateSystem });
  if (
    !Number.isInteger(options.maximumLevel) ||
    options.maximumLevel < 0 ||
    options.maximumLevel > tilingScheme.maximumSafeLevel
  ) {
    throw new DeveloperError(
      "options.maximumLevel must be a non-negative integer not exceeding maximumSafeLevel.",
    );
  }

  const rootScale = Math.fround(tilingScheme.getTileSizeAtLevel(0));
  const maximumScale = Math.fround(
    tilingScheme.getTileSizeAtLevel(options.maximumLevel),
  );
  if (
    !Number.isFinite(rootScale) ||
    rootScale <= 0.0 ||
    !Number.isFinite(maximumScale) ||
    maximumScale <= 0.0
  ) {
    throw new DeveloperError(
      "The root and maximum-level tile scales must be positive finite Float32 values.",
    );
  }

  const maximumScreenSpaceError = options.maximumScreenSpaceError ?? 2.0;
  const tileCacheSize = options.tileCacheSize ?? 100;
  const baseColor = options.baseColor ?? Color.GRAY;
  const enableLighting = options.enableLighting ?? false;
  const lambertDiffuseMultiplier = options.lambertDiffuseMultiplier ?? 0.9;
  validateMaximumScreenSpaceError(maximumScreenSpaceError);
  validateTileCacheSize(tileCacheSize);
  validateBaseColor(baseColor);
  validateEnableLighting(enableLighting);
  const shadows = validatePlanarShadowMode(
    options.shadows ?? ShadowMode.RECEIVE_ONLY,
  );
  validateLambertDiffuseMultiplier(lambertDiffuseMultiplier);

  this._coordinateSystem = coordinateSystem;
  this._tilingScheme = tilingScheme;
  this._maximumLevel = options.maximumLevel;
  this._maximumScreenSpaceError = maximumScreenSpaceError;
  this._maximumTiltedTileDistance = Infinity;
  this._tileCacheSize = tileCacheSize;
  this._baseColor = Color.clone(baseColor);
  this._opacity = 1.0;
  this._depthTestAgainstTerrain = true;
  this._enableLighting = enableLighting;
  this._shadows = shadows;
  this._lambertDiffuseMultiplier = lambertDiffuseMultiplier;
  this._material = undefined;
  this._clippingPlanes = undefined;
  this._clippingPolygons = undefined;
  this._environment = undefined;
  this._show = true;
  this._terrainProvider = undefined;
  this._imageryLayers = new SceneGISPlanarImageryLayerCollection({
    tilingScheme,
  });
  this._imageryLayers._owner = this;
  this._surface = new SceneGISPlanarSurface(tilingScheme, this._imageryLayers);
  this._atmosphereRenderer = new SceneGISPlanarAtmosphereRenderer();
  this._celestialBodyRenderer = new SceneGISPlanarCelestialBodyRenderer();
  this._frameState = undefined;
  this._requestRenderIfLoading = () => !this.isDestroyed() && !this.tilesLoaded;
}

Object.defineProperties(SceneGISPlanarWorld.prototype, {
  /**
   * 获取或设置普通场景内容是否与地形进行深度测试。false 时在贴地分类后清除地形深度，内容之间仍互相进行深度测试。地形查询与贴地分类保留真实地表。默认保留平面地形遮挡，与 {@link Globe#depthTestAgainstTerrain} 不同。下一渲染生效，requestRenderMode 下须调用 Scene.requestRender。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {boolean}
   * @default true
   * @exception {DeveloperError} 数值不是布尔值。
   */
  depthTestAgainstTerrain: {
    get: function () {
      return this._depthTestAgainstTerrain;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("depthTestAgainstTerrain must be a boolean.");
      }
      this._depthTestAgainstTerrain = value;
    },
  },
  /**
   * 获取或设置地形是否投射或接收几何阴影，场景阴影也须启用。仅已提交地形瓦片投射阴影。
   * @memberof SceneGISPlanarWorld.prototype
   * @type {ShadowMode}
   * @default ShadowMode.RECEIVE_ONLY
   */
  shadows: {
    get: function () {
      return this._shadows;
    },
    set: function (value) {
      this._shadows = validatePlanarShadowMode(value);
    },
  },
  /**
   * 获取或设置 World 所有的地形裁剪平面。平面坐标为平面世界米，经集合 modelMatrix 变换。裁去负半空间，保留 Cesium 交并语义。下一正常渲染发布变化，要求 WebGL 2 和浮点纹理。替换集合或销毁此 World 会销毁集合。
   * @memberof SceneGISPlanarWorld.prototype
   * @type {ClippingPlaneCollection|undefined}
   * @default undefined
   */
  clippingPlanes: {
    get: function () {
      return this._clippingPlanes;
    },
    set: function (value) {
      setClippingCollection(
        this,
        "_clippingPlanes",
        value,
        ClippingPlaneCollection,
      );
    },
  },
  /**
   * 获取或设置 World 所有的地形裁剪多边形，复用 Globe 的集合及多边形 API。位置为直边平面世界 XY 米，不使用 Z 或 ellipsoid。下一正常渲染发布变化。已渲染地形拾取遵守裁剪，驻留高度查询与独立采样保留源高度。替换集合或销毁此 World 会销毁集合。
   * @memberof SceneGISPlanarWorld.prototype
   * @type {ClippingPolygonCollection|undefined}
   * @default undefined
   */
  clippingPolygons: {
    get: function () {
      return this._clippingPolygons;
    },
    set: function (value) {
      setClippingCollection(
        this,
        "_clippingPolygons",
        value,
        ClippingPolygonCollection,
      );
    },
  },
  /**
   * 获取平面坐标系。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {SceneGISPlanarCoordinateSystem}
   * @readonly
   */
  coordinateSystem: {
    get: function () {
      return this._coordinateSystem;
    },
  },
  /**
   * 获取标准单根切片方案。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {SceneGISPlanarTilingScheme}
   * @readonly
   */
  tilingScheme: {
    get: function () {
      return this._tilingScheme;
    },
  },
  /**
   * 获取可选的最高地表层级。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {number}
   * @readonly
   */
  maximumLevel: {
    get: function () {
      return this._maximumLevel;
    },
  },
  /**
   * 获取当前视图的地形与全部可见影像图层是否就绪或已最终失败。隐藏世界按定义视为已加载。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {boolean}
   * @readonly
   */
  tilesLoaded: {
    get: function () {
      return !this._show || this._surface.tilesLoaded;
    },
  },
  /**
   * 获取 World 所有的有序平面影像图层集合。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {SceneGISPlanarImageryLayerCollection}
   * @readonly
   */
  imageryLayers: {
    get: function () {
      return this._imageryLayers;
    },
  },
  /**
   * 获取当前注册到此世界、调用方所有的平面 Environment，没有时为 undefined。World 仅保留引用，不销毁 Environment 或其光源。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {SceneGISPlanarEnvironment|undefined}
   * @readonly
   */
  environment: {
    get: function () {
      return this._environment;
    },
  },
  /**
   * 获取或设置调用方所有、用于平面地形样式的 Cesium Material。赋值由下一成功正常渲染发布。替换、清空或销毁世界均不销毁材质。已验证内置材质为 ElevationContour、ElevationRamp、SlopeRamp、AspectRamp。自定义 Fabric 可使用平面 materialInput：归一化瓦片 st/s/str、拓扑向上 normalEC、positionToEyeEC、固定东/北/天 tangentToEyeMatrix、绝对世界 Z 高度、相对 +Z 坡度、从北顺时针的下坡坡向及 waterMask=0。仅合成 diffuse 与 alpha，不支持 normal、specular、shininess、emission、透明通道或完整 Globe Material 兼容性。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {Material|undefined}
   * @default undefined
   * @exception {DeveloperError} 赋值不是未销毁的 Material 或 undefined。
   */
  material: {
    get: function () {
      return this._material;
    },
    set: function (value) {
      if (value === this._material) {
        return;
      }
      validateMaterial(value);
      this._material = value;
    },
  },
  /**
   * 获取或设置调用方所有的平面地形提供者，须使用此世界的标准切片方案。赋值 undefined 恢复平坦 Z=0 表面。替换或销毁世界不销毁提供者。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {SceneGISPlanarTerrainProvider|undefined}
   * @exception {DeveloperError} 提供者契约、标准切片方案身份、高度范围、最高层级或几何误差曲线无效。
   */
  terrainProvider: {
    get: function () {
      return this._terrainProvider;
    },
    set: function (provider) {
      if (provider === this._terrainProvider) {
        return;
      }
      let geometricErrors;
      if (provider !== undefined) {
        geometricErrors = validateTerrainProvider(
          provider,
          this._tilingScheme,
          this._maximumLevel,
        );
      }
      this._surface.setTerrainProvider(provider, geometricErrors);
      this._terrainProvider = provider;
    },
  },
  /**
   * 获取或设置是否显示平面世界。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {boolean}
   * @exception {DeveloperError} 赋值不是布尔值。
   */
  show: {
    get: function () {
      return this._show;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("show must be a boolean.");
      }
      this._show = value;
      if (!value) {
        this._surface.invalidateTerrainQuerySnapshot();
      }
    },
  },
  /**
   * 获取或设置屏幕空间误差细化阈值，单位为像素。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {number}
   * @exception {DeveloperError} 赋值不是有限正数。
   */
  maximumScreenSpaceError: {
    get: function () {
      return this._maximumScreenSpaceError;
    },
    set: function (value) {
      validateMaximumScreenSpaceError(value);
      this._maximumScreenSpaceError = value;
    },
  },
  /**
   * 获取或设置低角度透视的瓦片细节距离，单位为平面米。远处瓦片保留粗覆盖；相对水平面 10 度内完全应用限制，随后平滑放宽，20 度时禁用。正交和俯视不变，不修改相机可见性或裁剪。设为 Infinity 可保持不受限的屏幕空间误差细化。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {number}
   * @default Infinity
   * @exception {DeveloperError} 赋值不是正数或 Infinity。
   */
  maximumTiltedTileDistance: {
    get: function () {
      return this._maximumTiltedTileDistance;
    },
    set: function (value) {
      validateMaximumTiltedTileDistance(value);
      this._maximumTiltedTileDistance = value;
    },
  },
  /**
   * 获取或设置每帧后保留的未保护瓦片记录数。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {number}
   * @exception {DeveloperError} 赋值不是非负整数。
   */
  tileCacheSize: {
    get: function () {
      return this._tileCacheSize;
    },
    set: function (value) {
      validateTileCacheSize(value);
      this._tileCacheSize = value;
    },
  },
  /**
   * 获取或设置不透明地表颜色，读取和赋值时均复制。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {Color}
   * @exception {DeveloperError} 赋值不是不透明 Color。
   */
  baseColor: {
    get: function () {
      return Color.clone(this._baseColor);
    },
    set: function (value) {
      validateBaseColor(value);
      Color.clone(value, this._baseColor);
    },
  },
  /**
   * 获取或设置合成地表颜色的不透明度，包含影像和材质，不乘矢量图层不透明度。小于 1 时走透明通道，不写不透明场景深度，从而显示地表后的对象。任意不透明度下地形高度和射线查询仍可用，场景深度拾取遵循透明拾取设置。变化在下一正常渲染发布，透明排序遵循场景顺序无关透明配置。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {number}
   * @default 1.0
   * @exception {DeveloperError} 数值非有限值或不在零到一之间。
   */
  opacity: {
    get: function () {
      return this._opacity;
    },
    set: function (value) {
      if (!Number.isFinite(value) || value < 0.0 || value > 1.0) {
        throw new DeveloperError("opacity must be a finite number in [0, 1].");
      }
      this._opacity = value;
    },
  },
  /**
   * 获取或设置是否启用片元几何 Lambert 光照。光照消费所属 Scene 光源，不改变地表几何、地形选择或资源所有权。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {boolean}
   * @default false
   * @exception {DeveloperError} 赋值不是布尔值。
   */
  enableLighting: {
    get: function () {
      return this._enableLighting;
    },
    set: function (value) {
      validateEnableLighting(value);
      this._enableLighting = value;
    },
  },
  /**
   * 获取或设置 Lambert 漫反射光照倍率，{@link SceneGISPlanarWorld#enableLighting} 为 false 时无效。
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {number}
   * @default 0.9
   * @exception {DeveloperError} 赋值不是有限非负数。
   */
  lambertDiffuseMultiplier: {
    get: function () {
      return this._lambertDiffuseMultiplier;
    },
    set: function (value) {
      validateLambertDiffuseMultiplier(value);
      this._lambertDiffuseMultiplier = value;
    },
  },
});

/**
 * 更新与通道无关的状态，验证所支持的场景模式。
 *
 * @param {object} frameState 当前帧状态。
 * @exception {DeveloperError} 当前帧未使用 {@link SceneMode.SCENE3D}。
 */
SceneGISPlanarWorld.prototype.update = function (frameState) {
  if (frameState.mode !== SceneMode.SCENE3D) {
    throw new DeveloperError(
      "SceneGISPlanarWorld only supports SceneMode.SCENE3D.",
    );
  }
  if (this._frameState !== undefined && this._frameState !== frameState) {
    throw new DeveloperError(
      "SceneGISPlanarWorld must remain bound to one reusable frameState.",
    );
  }
  this._frameState = frameState;
  if (!this.tilesLoaded) {
    frameState.afterRender.push(this._requestRenderIfLoading);
  }
};

/**
 * 重置逐帧平面选择状态。
 *
 * @param {object} frameState 当前帧状态。
 * @exception {DeveloperError} 使用了第二个 WebGL Context 推进此世界。
 */
SceneGISPlanarWorld.prototype.beginFrame = function (frameState) {
  this._surface.beginFrame(frameState);
};

/**
 * 选择可见平面瓦片并提交地表颜色和深度命令。
 *
 * @param {object} frameState 当前帧状态。
 * @exception {DeveloperError} 使用了第二个 WebGL Context 渲染世界。
 */
SceneGISPlanarWorld.prototype.render = function (frameState) {
  if (!this._show) {
    this._surface.invalidateTerrainQuerySnapshot();
    return;
  }
  this._surface.render(
    frameState,
    this._maximumLevel,
    this._maximumScreenSpaceError,
    this._baseColor,
    this._enableLighting,
    this._lambertDiffuseMultiplier,
    this._material,
    this._maximumTiltedTileDistance,
    this._opacity,
    this._clippingPlanes,
    this._clippingPolygons,
    this._shadows,
  );
};

/**
 * 在普通场景几何之前绘制显式启用的平面 SkyBox、大气和天体。
 *
 * @param {object} frameState 当前帧状态。
 * @param {object} passState 当前环境通道状态。
 */
SceneGISPlanarWorld.prototype.renderEnvironment = function (
  frameState,
  passState,
) {
  renderPlanarEnvironment.call(this, frameState, passState);
};

function renderPlanarEnvironment(frameState, passState) {
  const environment = this._environment;
  if (
    frameState._sceneGISDeferredRendering ||
    environment?._scene?._sceneGISEnvironmentEffectsPipeline?.enabled
  ) {
    return;
  }
  if (
    !this._show ||
    environment === undefined ||
    !environment._enabled ||
    !environment._hasAuthority ||
    (!environment._showAtmosphere &&
      environment._skyBox === undefined &&
      !environment._showSun &&
      !environment._showMoon)
  ) {
    return;
  }
  if (frameState.passes.render !== true) {
    return;
  }
  environment._validateNativeEnvironmentConflict(environment._scene);
  const environmentState = this._atmosphereRenderer.prepare(this, frameState);
  const scene = environment._scene;
  if (environmentState.underground) {
    const nativeState = scene._environmentState;
    if (
      nativeState?.skyBoxCommand !== undefined ||
      nativeState?.isSkyAtmosphereVisible === true
    ) {
      this._atmosphereRenderer.renderMask(
        frameState,
        passState,
        scene.backgroundColor,
      );
    }
    return;
  }

  if (environment._skyBox !== undefined) {
    const skyBoxCommand = environment._skyBox._update(frameState, scene._hdr);
    if (skyBoxCommand !== undefined) {
      skyBoxCommand.execute(frameState.context, passState);
    }
  }
  if (environment._showAtmosphere) {
    this._atmosphereRenderer.render(
      environment,
      frameState,
      passState,
      environmentState,
    );
  }
  if (environment._showSun || environment._showMoon) {
    this._celestialBodyRenderer.render(
      this,
      environment,
      frameState,
      passState,
      environmentState,
    );
  }
}

/**
 * 命令执行后清理未保护瓦片记录。
 *
 * @param {object} frameState 当前帧状态。
 */
SceneGISPlanarWorld.prototype.endFrame = function (frameState) {
  this._surface.endFrame(this._tileCacheSize);
};

/**
 * 从包含位置的最深驻留直接或上采样 Float32 表面网格读取地形高度。不请求、创建、晋升或保留瓦片。平坦后备内容不视为地形。
 *
 * @param {Cartesian3} position 有限平面位置，验证 Z，但 Z 不参与寻址。
 * @returns {number|undefined} 驻留地形高度，单位为米；没有驻留地形时为 undefined。
 *
 * @exception {DeveloperError} <code>position</code> 不是各分量有限的 Cartesian3。
 * @exception {DeveloperError} 此世界已销毁。
 */
SceneGISPlanarWorld.prototype.getTerrainHeight = function (position) {
  if (
    !(position instanceof Cartesian3) ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    throw new DeveloperError(
      "position must be a Cartesian3 with finite components.",
    );
  }
  if (!this._terrainProvider) {
    return undefined;
  }
  return this._surface.getTerrainHeight(position, this._maximumLevel);
};

/**
 * 将射线与最近一次成功正常渲染发布的实际地形覆盖求交，不包含裙边。最近的平坦后备会遮住更远地形，但自身不产生地形结果。
 *
 * @param {Ray} ray 待求交射线，方向无需归一化。
 * @param {Cartesian3} [result] 存储交点的对象。
 * @returns {Cartesian3|undefined} 最近地形交点；不可用时为 undefined。
 *
 * @exception {DeveloperError} <code>ray</code> 不具有有限原点和非零有限方向。
 * @exception {DeveloperError} 此世界已销毁。
 */
SceneGISPlanarWorld.prototype.pickTerrain = function (ray, result) {
  validateRay(ray);
  return this._surface.pickTerrain(ray, result);
};

/**
 * 计算适配四类视锥的窗口射线，与最近成功正常渲染发布的实际地形覆盖求交。不触发渲染、深度拾取或 Z=0 数学平面后备。
 *
 * @param {Cartesian2} windowPosition 左上原点、有限的客户端空间位置。
 * @param {Scene} scene 存活的 SCENE3D Scene，其主世界须为此世界。
 * @param {Cartesian3} [result] 存储交点的对象。
 * @returns {Cartesian3|undefined} 地形交点；画布尺寸为零或未命中时为 undefined。
 *
 * @exception {DeveloperError} 缺少 <code>windowPosition</code> 或数值非有限。
 * @exception {DeveloperError} 缺少 <code>scene</code>，或其已销毁、使用其他世界、或不处于 SCENE3D。
 * @exception {DeveloperError} 场景相机没有受支持的有限视锥和姿态。
 * @exception {DeveloperError} 此世界已销毁。
 */
SceneGISPlanarWorld.prototype.pickTerrainFromWindowPosition = function (
  windowPosition,
  scene,
  result,
) {
  if (
    !windowPosition ||
    !Number.isFinite(windowPosition.x) ||
    !Number.isFinite(windowPosition.y)
  ) {
    throw new DeveloperError(
      "windowPosition must have finite x and y components.",
    );
  }
  if (!scene || (scene.isDestroyed && scene.isDestroyed())) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (scene.world !== this) {
    throw new DeveloperError("scene.world must be this SceneGISPlanarWorld.");
  }
  if (scene.mode !== SceneMode.SCENE3D) {
    throw new DeveloperError(
      "Planar window terrain picking requires SceneMode.SCENE3D.",
    );
  }
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    windowPosition,
    scratchPickRay,
  );
  return ray ? this.pickTerrain(ray, result) : undefined;
};

/**
 * 将射线与 Z=0 的有界数学平面求交，独立于渲染、深度拾取和地表 LOD。
 *
 * @param {Ray} ray 待求交射线，方向无需归一化。
 * @param {Cartesian3} [result] 存储交点的对象。
 * @returns {Cartesian3|undefined} 交点；向前射线未命中有界表面时为 undefined。
 *
 * @exception {DeveloperError} <code>ray</code> 不具有有限原点和非零有限方向。
 * @exception {DeveloperError} 此世界已销毁。
 */
SceneGISPlanarWorld.prototype.pick = function (ray, result) {
  validateRay(ray);
  const intersection = SceneGISPlanarCamera.intersectPlane(ray, result);
  if (!intersection) {
    return undefined;
  }
  const extent = this._coordinateSystem.extent;
  if (
    intersection.x < extent.minimumX ||
    intersection.x > extent.maximumX ||
    intersection.y < extent.minimumY ||
    intersection.y > extent.maximumY
  ) {
    return undefined;
  }
  return intersection;
};

/**
 * 计算适配四类视锥的窗口射线，并与 Z=0 的有界数学平面求交。
 *
 * @param {Cartesian2} windowPosition 左上原点、有限的客户端空间位置。
 * @param {Scene} scene 存活的 SCENE3D Scene，其主世界须为此世界。
 * @param {Cartesian3} [result] 存储交点的对象。
 * @returns {Cartesian3|undefined} 交点；画布尺寸为零或未命中时为 undefined。
 *
 * @exception {DeveloperError} 缺少 <code>windowPosition</code> 或数值非有限。
 * @exception {DeveloperError} 缺少 <code>scene</code>，或其已销毁、使用其他世界、或不处于 SCENE3D。
 * @exception {DeveloperError} 场景相机没有受支持的有限视锥和姿态。
 * @exception {DeveloperError} 此世界已销毁。
 */
SceneGISPlanarWorld.prototype.pickFromWindowPosition = function (
  windowPosition,
  scene,
  result,
) {
  if (
    !windowPosition ||
    !Number.isFinite(windowPosition.x) ||
    !Number.isFinite(windowPosition.y)
  ) {
    throw new DeveloperError(
      "windowPosition must have finite x and y components.",
    );
  }
  if (!scene || (scene.isDestroyed && scene.isDestroyed())) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (scene.world !== this) {
    throw new DeveloperError("scene.world must be this SceneGISPlanarWorld.");
  }
  if (scene.mode !== SceneMode.SCENE3D) {
    throw new DeveloperError(
      "Planar window picking requires SceneMode.SCENE3D.",
    );
  }
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    windowPosition,
    scratchPickRay,
  );
  return ray ? this.pick(ray, result) : undefined;
};

/**
 * Registers the sole caller-owned Environment reference for this live world.
 *
 * @param {SceneGISPlanarEnvironment} environment The Environment being connected.
 * @private
 */
SceneGISPlanarWorld.prototype._registerEnvironment = function (environment) {
  if (this.isDestroyed()) {
    throw new DeveloperError(
      "A destroyed SceneGISPlanarWorld cannot register an Environment.",
    );
  }
  if (this._environment !== undefined) {
    throw new DeveloperError(
      "A SceneGISPlanarWorld may register only one Environment.",
    );
  }
  this._environment = environment;
};

/**
 * Clears this world's Environment reference when the matching controller is
 * disconnected. A stale controller cannot detach another registration.
 *
 * @param {SceneGISPlanarEnvironment} environment The Environment being disconnected.
 * @private
 */
SceneGISPlanarWorld.prototype._unregisterEnvironment = function (environment) {
  if (this._environment === environment) {
    this._environment = undefined;
  }
};

/**
 * 此对象已销毁时返回 true，否则返回 false。
 *
 * @returns {boolean} 此对象已销毁时为 true，否则为 false。
 */
SceneGISPlanarWorld.prototype.isDestroyed = function () {
  return false;
};

/**
 * 销毁此世界所有的瓦片记录和依赖 Context 的资源。
 *
 * @returns {void}
 */
SceneGISPlanarWorld.prototype.destroy = function () {
  const environment = this._environment;
  if (environment !== undefined) {
    environment._severWorld(this);
    this._environment = undefined;
  }
  this._frameState = undefined;
  this._atmosphereRenderer.destroy();
  this._celestialBodyRenderer.destroy();
  this._surface.destroy();
  this._clippingPlanes?.destroy();
  this._clippingPolygons?.destroy();
  this._clippingPlanes = this._clippingPolygons = undefined;
  this._imageryLayers._owner = undefined;
  this._imageryLayers.destroy();
  return destroyObject(this);
};

export default SceneGISPlanarWorld;
