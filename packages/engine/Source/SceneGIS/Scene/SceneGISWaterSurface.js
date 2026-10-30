import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import Color from "../../Core/Color.js";
import CoplanarPolygonGeometry from "../../Core/CoplanarPolygonGeometry.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Ellipsoid from "../../Core/Ellipsoid.js";
import JulianDate from "../../Core/JulianDate.js";
import Matrix3 from "../../Core/Matrix3.js";
import Matrix4 from "../../Core/Matrix4.js";
import PolygonHierarchy from "../../Core/PolygonHierarchy.js";
import RuntimeError from "../../Core/RuntimeError.js";
import VertexFormat from "../../Core/VertexFormat.js";
import BufferUsage from "../../Renderer/BufferUsage.js";
import DrawCommand from "../../Renderer/DrawCommand.js";
import Pass from "../../Renderer/Pass.js";
import RenderState from "../../Renderer/RenderState.js";
import ShaderProgram from "../../Renderer/ShaderProgram.js";
import ShaderSource from "../../Renderer/ShaderSource.js";
import VertexArray from "../../Renderer/VertexArray.js";
import SceneMode from "../../Scene/SceneMode.js";
import Globe from "../../Scene/Globe.js";
import ray from "../../Shaders/SceneGIS/Reflections/SceneGISSSRRay.js";
import vertex from "../../Shaders/SceneGIS/Water/SceneGISWaterVS.js";
import fragment from "../../Shaders/SceneGIS/Water/SceneGISWaterFS.js";
import optics from "../../Shaders/SceneGIS/Water/SceneGISWaterOptics.js";
import foamMaterial from "../../Shaders/SceneGIS/Water/SceneGISWaterFoam.js";
import WaterFoam from "./_private/_SceneGISWaterFoam.js";
import waterEffects from "../../Shaders/SceneGIS/Water/SceneGISWaterEffects.js";
import waterWaves from "../../Shaders/SceneGIS/Water/SceneGISWaterWaves.js";
import caustics from "../../Shaders/SceneGIS/Water/SceneGISWaterCaustics.js";
import Underwater from "./_private/_SceneGISUnderwater.js";
import WaterDomain from "./_private/_SceneGISWaterDomain.js";
import riverFlow from "../../Shaders/SceneGIS/Water/SceneGISRiverFlow.js";
import curvedSurface from "../../Shaders/SceneGIS/Water/SceneGISWaterCurvedSurface.js";
import WaterFrame from "./_private/_SceneGISWaterFrame.js";
import WindWaves from "./SceneGISWindWaves.js";
import WaterMesh from "./_private/_SceneGISWaterMesh.js";
import EllipsoidWaterMesh from "./_private/_SceneGISEllipsoidWaterMesh.js";
import EnvironmentLighting from "./_private/_SceneGISModelEnvironmentLighting.js";

function cloneHierarchy(hierarchy) {
  if (!hierarchy?.positions || hierarchy.positions.length < 3) {
    throw new DeveloperError(
      "polygonHierarchy requires at least three positions per ring.",
    );
  }
  const positions = hierarchy.positions.map((p) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.z !== 0) {
      throw new DeveloperError(
        "Water positions must be finite local XY meters with z = 0. Use modelMatrix for placement.",
      );
    }
    return Cartesian3.clone(p);
  });
  return new PolygonHierarchy(
    positions,
    (hierarchy.holes ?? []).map(cloneHierarchy),
  );
}

function number(value, name, minimum, maximum = Infinity) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new DeveloperError(
      `${name} must be finite in [${minimum}, ${maximum}].`,
    );
  }
}

const rotationScratch = new Matrix3();
const transposeScratch = new Matrix3();
const orthogonalScratch = new Matrix3();

function validate(surface) {
  if (surface._gridMesh) {
    if (!Matrix4.equals(surface.modelMatrix, Matrix4.IDENTITY)) {
      throw new DeveloperError(
        "Ellipsoid water requires identity modelMatrix. Author ECEF positions and ellipsoid heights instead.",
      );
    }
    number(surface.maximumScreenSpaceError, "maximumScreenSpaceError", 0.1);
    number(surface.maximumTileCount, "maximumTileCount", 4, 4096);
    if (!Number.isInteger(surface.maximumTileCount)) {
      throw new DeveloperError("maximumTileCount must be an integer.");
    }
  }
  if (
    typeof surface.show !== "boolean" ||
    typeof surface.reflections !== "boolean"
  ) {
    throw new DeveloperError("show and reflections must be boolean.");
  }
  number(surface.roughness, "roughness", 0.02, 1);
  number(surface.waveAmplitude, "waveAmplitude", 0);
  number(surface.waveLength, "waveLength", 0.001);
  number(surface.flowSpeed, "flowSpeed", 0);
  number(surface.foamWidth, "foamWidth", 0);
  number(surface.foamIntensity, "foamIntensity", 0, 1);
  number(surface.underwaterDepth, "underwaterDepth", 0);
  number(surface.causticsIntensity, "causticsIntensity", 0, 2);
  if (surface._gridMesh && surface.underwaterDepth > 0) {
    const mesh = surface._gridMesh;
    if (
      mesh.ellipsoid &&
      surface.underwaterDepth >= mesh.radius + mesh.root.minHeight
    ) {
      throw new DeveloperError(
        "underwaterDepth must leave the curved bottom above the curvature center.",
      );
    }
  }
  number(surface.scatteringAnisotropy, "scatteringAnisotropy", -0.9, 0.9);
  number(surface.refractionStrength, "refractionStrength", 0, 1);
  number(surface.maximumReflectionDistance, "maximumReflectionDistance", 0.001);
  number(surface.reflectionThickness, "reflectionThickness", 0.001);
  number(surface.reflectionSteps, "reflectionSteps", 16, 256);
  if (!Number.isInteger(surface.reflectionSteps)) {
    throw new DeveloperError("reflectionSteps must be an integer.");
  }
  for (const color of [surface.waterColor, surface.reflectionColor]) {
    for (const channel of ["red", "green", "blue"]) {
      number(color?.[channel], channel, 0);
    }
  }
  for (const channel of ["x", "y", "z"]) {
    number(surface.absorption?.[channel], `absorption.${channel}`, 0);
    if (surface.scattering !== undefined) {
      number(surface.scattering?.[channel], `scattering.${channel}`, 0);
    }
  }
  if (
    !Number.isFinite(surface.flowDirection?.x) ||
    !Number.isFinite(surface.flowDirection?.y) ||
    Cartesian2.magnitudeSquared(surface.flowDirection) === 0
  ) {
    throw new DeveloperError(
      "flowDirection must be a finite nonzero Cartesian2.",
    );
  }
  const m = surface.modelMatrix;
  const rotation = Matrix4.getMatrix3(m, rotationScratch);
  const orthogonal = Matrix3.multiply(
    Matrix3.transpose(rotation, transposeScratch),
    rotation,
    orthogonalScratch,
  );
  if (
    !Matrix3.equalsEpsilon(orthogonal, Matrix3.IDENTITY, 1e-7) ||
    Math.abs(Matrix3.determinant(rotation) - 1) > 1e-7 ||
    m[3] !== 0 ||
    m[7] !== 0 ||
    m[11] !== 0 ||
    m[15] !== 1 ||
    !Number.isFinite(m[12]) ||
    !Number.isFinite(m[13]) ||
    !Number.isFinite(m[14])
  ) {
    throw new DeveloperError(
      "modelMatrix must be a finite rigid transform without scale or reflection.",
    );
  }
}

/**
 * 湖泊、河流或水池表面，支持基于深度的透射、动画法线波浪、介电反射、浅水接触白沫及可选有限水下观察。加入 Scene.primitives。PolygonHierarchy 位置为 z=0 的局部 XY 米制坐标，modelMatrix 将平面放置到任一 World，球面通常使用 ENU。
 * 显式 geometryMode="ellipsoid" 则接受 ECEF 位置及恒定椭球高，或在固定区域图表中插值的逐点高度。此模式要求 windWaves、单位 modelMatrix 和匹配的 Globe 椭球。轮廓须位于一个开放切向半球内，边在区域球心投影图表中为直线。它是存在投影畸变的区域可视化风浪合成，不是全球海洋或水力模拟。
 * 要求 SCENE3D、HDR 和 WebGL2 浮点目标，不改变原生 Water 材质。使用场景不透明深度/颜色。通过 underwaterDepth 显式开启局部几何、逐点高度椭球几何和有向河流剖面的水下观察；不支持重叠水层或水下透明对象。反射未命中时，物理天空启用则使用天空，否则使用 reflectionColor。散射色调与白沫在物理光照启用时随其受光。
 * 动画遵循 Scene 时间，不启动渲染循环。requestRenderMode 下修改属性后须请求一帧，规则与其他应用管理的图元相同。集合拥有图元，Scene 拥有共享捕获目标和白沫纹理。白沫细节从随包 Assets/SceneGIS/Water/Foam 异步加载；加载中水面几何仍可见，失败通过 Scene 渲染错误报告。
 * @alias SceneGISWaterSurface
 * @constructor
 * @param {object} options 初始化选项。
 * @param {PolygonHierarchy} options.polygonHierarchy 局部 XY 或显式椭球模式 ECEF 多边形，包含孔洞，构造时复制。
 * @param {string} [options.geometryMode="local"] 取值 "local" 或 "ellipsoid"，构造时固定。
 * @param {Ellipsoid} [options.ellipsoid=Ellipsoid.WGS84] 曲面模式椭球，构造时复制，须与 Globe 匹配。
 * @param {number} [options.height=0] 曲面模式椭球高，单位为米，构造时固定。
 * @param {boolean} [options.perPositionHeight=false] 曲面模式使用 ECEF 边界高度而非 height，构造时固定。
 * @param {number} [options.maximumScreenSpaceError=2] 曲面格网曲率误差目标，单位为像素，至少 0.1。
 * @param {number} [options.maximumTileCount=512] 曲面四叉树叶节点预算，整数，范围 [4,4096]；预算可能限制请求精度。
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] 局部到世界的刚体变换。
 * @param {*} [options.id] 拾取标识。
 * @param {boolean} [options.show=true] 是否绘制表面。
 * @param {Color} [options.waterColor] 传统场景线性深水散射色，默认 (0.015,0.12,0.14)，定义 scattering 时忽略；忽略 alpha。
 * @param {Cartesian3} [options.absorption] 每米 RGB 吸收，默认 (0.45,0.12,0.06)。
 * @param {Cartesian3} [options.scattering] 可选非负每米 RGB 散射系数。定义时启用均匀单次散射光学，undefined 保留 waterColor 光学，零启用仅吸收光学。
 * @param {number} [options.scatteringAnisotropy=0] Henyey-Greenstein 平均余弦，范围 [-0.9,0.9]，正值偏向向前传播，仅在使用 scattering 时有效。
 * @param {Color} [options.reflectionColor] 无物理天空时的场景线性环境辐亮度，默认 (0.2,0.3,0.4)。
 * @param {number} [options.roughness=0.12] 感知粗糙度，范围 [0.02,1]。
 * @param {SceneGISWindWaves} [options.windWaves] 可选的调用方所有风浪模拟，构造时固定，替换仅法线波浪。
 * @param {number} [options.meshSpacing=1] 最精细风浪格网间距，单位为米，范围 [0.25,4]，构造时固定；未使用 windWaves 时忽略。
 * @param {number} [options.waveAmplitude=0.05] 仅法线波浪高度，单位为米，传入 windWaves 时忽略。
 * @param {number} [options.waveLength=3.0] 最大法线波长，单位为米。
 * @param {Cartesian2} [options.flowDirection=Cartesian2.UNIT_X] 局部流向，无需归一化。
 * @param {number} [options.flowSpeed=0.6] 波浪相位速度，单位为米/秒。
 * @param {number} [options.foamWidth=0.3] 屏幕深度接触范围，单位为米，0 禁用。
 * @param {number} [options.foamIntensity=0.5] 接触白沫强度，范围 [0,1]。
 * @param {number} [options.underwaterDepth=0] 插值平均水面下的有限竖直深度，单位为米，0 关闭水下观察。原始岸线使用空间索引，变水位剖面单独保留 1024 三角形预算。曲面射线裁剪采用相机相对球近似。按平均高度判定浸没，不是精确波浪弯月面。
 * @param {number} [options.maximumUnderwaterBoundaryBytes=8388608] 不可变岸线索引纹理预算，包含填充；为正整数字节数，最大 67108864。不简化输入几何以适应预算。
 * @param {number} [options.causticsIntensity=0] 可见接收面近似焦散强度，范围 [0,2]；0 禁用，使用场景深度与真实波浪。
 * @param {number} [options.refractionStrength=0.2] 屏幕空间折射扭曲强度，范围 [0,1]。
 * @param {boolean} [options.reflections=true] 是否追踪场景反射，天空反射保持启用。
 * @param {number} [options.maximumReflectionDistance=100.0] 反射射线最大长度，单位为米。
 * @param {number} [options.reflectionThickness=0.5] 反射命中的深度容差，单位为米。
 * @param {number} [options.reflectionSteps=64] 整数反射遍历预算，范围 [16,256]。
 * @example
 * viewer.scene.highDynamicRange = true;
 * const water = viewer.scene.primitives.add(new Cesium.SceneGISWaterSurface({
 *   polygonHierarchy: new Cesium.PolygonHierarchy([
 *     new Cesium.Cartesian3(-20, -20, 0), new Cesium.Cartesian3(20, -20, 0),
 *     new Cesium.Cartesian3(20, 20, 0), new Cesium.Cartesian3(-20, 20, 0),
 *   ]),
 *   modelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, 2)),
 * }));
 */
function SceneGISWaterSurface(options = {}) {
  this._maximumUnderwaterBoundaryBytes =
    options.maximumUnderwaterBoundaryBytes ?? 8388608;
  if (
    !Number.isSafeInteger(this._maximumUnderwaterBoundaryBytes) ||
    this._maximumUnderwaterBoundaryBytes < 1 ||
    this._maximumUnderwaterBoundaryBytes > 67108864
  ) {
    throw new DeveloperError(
      "maximumUnderwaterBoundaryBytes must be an integer in [1, 67108864].",
    );
  }
  this._geometryMode = options.geometryMode ?? "local";
  if (this._geometryMode !== "local" && this._geometryMode !== "ellipsoid") {
    throw new DeveloperError('geometryMode must be "local" or "ellipsoid".');
  }
  this._windWaves = options.windWaves;
  this._meshSpacing = options.meshSpacing ?? 1;
  number(this._meshSpacing, "meshSpacing", 0.25, 4);
  if (
    this._windWaves !== undefined &&
    !(this._windWaves instanceof WindWaves)
  ) {
    throw new DeveloperError("windWaves must be a SceneGISWindWaves instance.");
  }
  this._gridMesh = options._riverMesh;
  this._river = options._river;
  this._pickOwner = options._river ?? this;
  if (this._gridMesh) {
    // Prepared river geometry shares the water renderer without changing its public coordinate modes.
  } else if (this._geometryMode === "ellipsoid") {
    if (!this._windWaves) {
      throw new DeveloperError("Ellipsoid water requires windWaves.");
    }
    const ellipsoid = options.ellipsoid ?? Ellipsoid.WGS84;
    if (!(ellipsoid instanceof Ellipsoid) || ellipsoid.minimumRadius <= 0) {
      throw new DeveloperError("ellipsoid must have positive radii.");
    }
    const height = options.height ?? 0,
      perPositionHeight = options.perPositionHeight ?? false;
    if (!Number.isFinite(height) || typeof perPositionHeight !== "boolean") {
      throw new DeveloperError(
        "height must be finite and perPositionHeight must be boolean.",
      );
    }
    this._ellipsoidMesh = new EllipsoidWaterMesh(
      options.polygonHierarchy,
      Ellipsoid.clone(ellipsoid),
      height,
      perPositionHeight,
      this._meshSpacing,
    );
  } else {
    this._hierarchy = cloneHierarchy(options.polygonHierarchy);
  }
  this._gridMesh ??= this._ellipsoidMesh;
  this._profileWater =
    !!this._gridMesh &&
    (!!this._river ||
      this._gridMesh.root.maxHeight - this._gridMesh.root.minHeight > 1e-7);
  /**
   * 曲面格网曲率误差目标，单位为像素。
   * @type {number}
   */
  this.maximumScreenSpaceError = options.maximumScreenSpaceError ?? 2;
  /**
   * 曲面四叉树叶节点预算。
   * @type {number}
   */
  this.maximumTileCount = options.maximumTileCount ?? 512;
  /**
   * 局部到世界的刚体变换。
   * @type {Matrix4}
   */
  this.modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);
  /**
   * 拾取标识。
   * @type {*}
   */
  this.id = options.id;
  /**
   * 表面是否可见。
   * @type {boolean}
   */
  this.show = options.show ?? true;
  /**
   * 传统场景线性深水散射色，定义 scattering 时忽略；忽略 alpha。
   * @type {Color}
   */
  this.waterColor = Color.clone(
    options.waterColor ?? new Color(0.015, 0.12, 0.14),
  );
  /**
   * RGB 吸收系数，单位为每米。
   * @type {Cartesian3}
   */
  this.absorption = Cartesian3.clone(
    options.absorption ?? new Cartesian3(0.45, 0.12, 0.06),
  );
  /**
   * 非负有限 RGB 散射系数，单位为每米，构造时复制。定义时启用均匀单次散射，undefined 恢复传统 waterColor 光学，零表示仅吸收。修改仅更新 uniform，不重新分配资源。
   * @type {Cartesian3|undefined}
   */
  this.scattering = Cartesian3.clone(options.scattering);
  /**
   * Henyey-Greenstein 平均余弦，范围 [-0.9,0.9]。正值偏向向前传播，仅在定义 scattering 时影响直接单次散射源。
   * @type {number}
   */
  this.scatteringAnisotropy = options.scatteringAnisotropy ?? 0;
  /**
   * 未启用物理天空时的环境辐亮度。
   * @type {Color}
   */
  this.reflectionColor = Color.clone(
    options.reflectionColor ?? new Color(0.2, 0.3, 0.4),
  );
  /**
   * 感知粗糙度，范围 [0.02,1]。
   * @type {number}
   */
  this.roughness = options.roughness ?? 0.12;
  /**
   * 法线波高倍率，单位为米。
   * @type {number}
   */
  this.waveAmplitude = options.waveAmplitude ?? 0.05;
  /**
   * 最大法线波长，单位为米。
   * @type {number}
   */
  this.waveLength = options.waveLength ?? 3;
  /**
   * 局部流向。
   * @type {Cartesian2}
   */
  this.flowDirection = Cartesian2.clone(
    options.flowDirection ?? Cartesian2.UNIT_X,
  );
  /**
   * 相位速度，单位为米/秒。
   * @type {number}
   */
  this.flowSpeed = options.flowSpeed ?? 0.6;
  /**
   * 屏幕深度接触范围，单位为米，0 禁用。
   * @type {number}
   */
  this.foamWidth = options.foamWidth ?? 0.3;
  /**
   * 接触白沫强度，范围 [0,1]。
   * @type {number}
   */
  this.foamIntensity = options.foamIntensity ?? 0.5;
  /**
   * 插值平均水面下的有限竖直水深，单位为米；0 关闭效果。支持局部、逐点高度椭球和有向河流剖面。曲面裁剪采用相机相对球近似，以平均高度判定浸没；原始凹边界及孔洞使用空间索引。
   * @type {number}
   */
  this.underwaterDepth = options.underwaterDepth ?? 0;
  /**
   * 可见接收面的近似焦散强度，范围 [0,2]，使用场景深度与真实波浪。
   * @type {number}
   */
  this.causticsIntensity = options.causticsIntensity ?? 0;
  /**
   * 折射扭曲强度，范围 [0,1]。
   * @type {number}
   */
  this.refractionStrength = options.refractionStrength ?? 0.2;
  /**
   * 是否追踪屏幕空间场景反射。
   * @type {boolean}
   */
  this.reflections = options.reflections ?? true;
  /**
   * 反射射线最大长度，单位为米。
   * @type {number}
   */
  this.maximumReflectionDistance = options.maximumReflectionDistance ?? 100;
  /**
   * 反射命中的深度容差，单位为米。
   * @type {number}
   */
  this.reflectionThickness = options.reflectionThickness ?? 0.5;
  /**
   * 整数遍历预算，范围 [16,256]。
   * @type {number}
   */
  this.reflectionSteps = options.reflectionSteps ?? 64;
  validate(this);
  this._sceneGISWater = true;
  this._context = undefined;
  this._command = undefined;
  this._epoch = undefined;
  this._time = 0;
  this._sky = undefined;
}

function waterVertex(surface) {
  return new ShaderSource({
    defines: [...waterDefines(surface), "SCENEGIS_RIVER_VERTEX"],
    sources: [riverFlow, vertex],
  });
}
function waterDefines(surface) {
  const defines = surface._windWaves ? ["SCENEGIS_WIND_WAVES"] : [];
  if (surface._gridMesh) {
    defines.push("SCENEGIS_CURVED_WATER");
  }
  if (surface._river) {
    defines.push("SCENEGIS_RIVER_WATER");
  }
  if (surface._profileWater) {
    defines.push("SCENEGIS_PROFILE_WATER");
  }
  return defines;
}
function waterAttributes(surface) {
  return surface._gridMesh
    ? EllipsoidWaterMesh.attributeLocations
    : { position: 0, waveData: 1 };
}
const inverseScratch = new Matrix4();
const cameraScratch = new Cartesian3();
function updateTiles(surface, frameState) {
  const mesh = surface._mesh;
  const camera = Matrix4.multiplyByPoint(
    Matrix4.inverseTransformation(surface.modelMatrix, inverseScratch),
    frameState.camera.positionWC,
    cameraScratch,
  );
  surface._commands ??= [];
  surface._commands.length = 0;
  for (const tile of mesh.tiles) {
    tile.worldBounds = BoundingSphere.transform(
      tile.bounds,
      surface.modelMatrix,
      tile.worldBounds,
    );
    tile.worldBounds.radius += surface._windWaves._maximumDisplacement;
    if (frameState.cullingVolume.computeVisibility(tile.worldBounds) === -1) {
      continue;
    }
    const distance = Math.hypot(
      Math.max(tile.x - camera.x, 0, camera.x - tile.x - mesh.size),
      Math.max(tile.y - camera.y, 0, camera.y - tile.y - mesh.size),
      camera.z,
    );
    const level = Math.max(
      0,
      Math.min(6, Math.floor(Math.log2(Math.max(1, distance * mesh.lodScale)))),
    );
    let entry = tile.cache.find((e) => e.level === level);
    if (!entry) {
      const geometry = mesh.createGeometry(tile, level);
      entry = {
        level,
        vertexArray: VertexArray.fromGeometry({
          context: frameState.context,
          geometry,
          attributeLocations: { position: 0, waveData: 1 },
          bufferUsage: BufferUsage.STATIC_DRAW,
        }),
        triangles: geometry.indices.length / 3,
        bytes:
          geometry.attributes.position.values.byteLength +
          geometry.attributes.waveData.values.byteLength +
          geometry.indices.byteLength,
      };
      if (tile.cache.length === 2) {
        tile.cache.shift().vertexArray.destroy();
      }
      tile.cache.push(entry);
    }
    entry.lastUsed = frameState.frameNumber;
    tile.command ??= new DrawCommand({
      owner: surface,
      pass: Pass.OPAQUE,
      pickId: "u_pickColor",
    });
    const command = tile.command,
      base = surface._command;
    command.vertexArray = entry.vertexArray;
    command.shaderProgram = base.shaderProgram;
    command.uniformMap = base.uniformMap;
    command.renderState = base.renderState;
    command.modelMatrix = surface.modelMatrix;
    command.boundingVolume = tile.worldBounds;
    tile.level = level;
    tile.triangles = entry.triangles;
    surface._commands.push(command);
    frameState.commandList.push(command);
  }
  // Keep active geometry plus at most 16 MiB of inactive LODs, even after touring the lake.
  const inactive = [];
  let inactiveBytes = 0;
  for (const tile of mesh.tiles) {
    for (const entry of tile.cache) {
      if (entry.lastUsed !== frameState.frameNumber) {
        inactive.push({ tile, entry });
        inactiveBytes += entry.bytes;
      }
    }
  }
  if (inactiveBytes > 16 * 1024 * 1024) {
    inactive.sort((a, b) => a.entry.lastUsed - b.entry.lastUsed);
    for (const { tile, entry } of inactive) {
      if (inactiveBytes <= 16 * 1024 * 1024) {
        break;
      }
      tile.cache.splice(tile.cache.indexOf(entry), 1);
      entry.vertexArray.destroy();
      inactiveBytes -= entry.bytes;
    }
  }
}

function createResources(surface, frameState) {
  const context = frameState.context;
  const curved = surface._gridMesh;
  const geometry = curved
    ? undefined
    : CoplanarPolygonGeometry.createGeometry(
        new CoplanarPolygonGeometry({
          polygonHierarchy: surface._hierarchy,
          vertexFormat: VertexFormat.POSITION_ONLY,
        }),
      );
  if (!curved && !geometry) {
    throw new DeveloperError("The water polygon must have a nonzero area.");
  }
  surface._localBounds = curved ? curved.root.bounds : geometry.boundingSphere;
  if (surface._windWaves && !curved) {
    surface._mesh = new WaterMesh(
      geometry,
      surface._hierarchy,
      surface._meshSpacing,
    );
  }
  surface._pickId = context.createPickId({
    primitive: surface._pickOwner,
    id: surface.id,
  });
  const state = WaterFrame.get(frameState);
  surface._command = new DrawCommand({
    owner: surface,
    vertexArray: curved
      ? undefined
      : VertexArray.fromGeometry({
          context,
          geometry,
          attributeLocations: { position: 0, waveData: 1 },
          bufferUsage: BufferUsage.STATIC_DRAW,
        }),
    shaderProgram: ShaderProgram.fromCache({
      context,
      vertexShaderSource: waterVertex(surface),
      fragmentShaderSource: new ShaderSource({
        defines: waterDefines(surface),
        sources: [
          curvedSurface,
          ray,
          riverFlow,
          optics,
          waterWaves,
          caustics,
          waterEffects,
          foamMaterial,
          fragment,
        ],
      }),
      attributeLocations: waterAttributes(surface),
    }),
    renderState: RenderState.fromCache({
      depthTest: { enabled: true },
      depthMask: true,
    }),
    pass: Pass.OPAQUE,
    pickId: "u_pickColor",
    uniformMap: {
      u_pickColor: () => surface._pickId.color,
      u_depth: () => state.depthTexture ?? context.defaultTexture,
      u_color: () => state.colorTexture ?? context.defaultTexture,
      u_waterColor: () => surface.waterColor,
      u_absorption: () => surface.absorption,
      u_mediumOptics: () => surface.scattering !== undefined,
      u_scattering: () => surface.scattering ?? Cartesian3.ZERO,
      u_scatteringAnisotropy: () => surface.scatteringAnisotropy,
      u_reflectionColor: () => surface.reflectionColor,
      u_sky: () => surface._sky?.texture ?? context.defaultCubeMap,
      u_hasSky: () => !!surface._sky?.texture,
      u_skyWorldToLocal: () => surface._sky?.worldToLocal ?? Matrix3.IDENTITY,
      u_skyLod: () => surface._sky?.maximumMipmapLevel ?? 0,
      u_radianceScale: () => surface._radianceScale,
      u_roughness: () => surface.roughness,
      u_waveAmplitude: () => surface.waveAmplitude,
      u_waveLength: () => surface.waveLength,
      u_flowDirection: () =>
        surface._windWaves?.windDirection ?? surface.flowDirection,
      u_wavePeriod: () => surface._windWaves.patchLength,
      u_waveResolution: () => surface._windWaves.resolution,
      u_waveLodScale: () => surface._mesh.lodScale,
      u_waterCurvatureRadius: () => surface._gridMesh.radius,
      u_riverTime: () => surface._time % 32,
      u_currentSpeedScale: () => surface._river.currentSpeedScale,
      u_currentRippleLength: () => surface._river.currentRippleLength,
      u_currentRippleAmplitude: () => surface._river.currentRippleAmplitude,
      u_riverDisplacement0: () =>
        surface._river._waves._state.bands[0].output.getColorTexture(0),
      u_riverDisplacement1: () =>
        surface._river._waves._state.bands[1].output.getColorTexture(0),
      u_displacement0: () =>
        surface._windWaves._state.bands[0].output.getColorTexture(0),
      u_displacement1: () =>
        surface._windWaves._state.bands[1].output.getColorTexture(0),
      u_displacement2: () =>
        surface._windWaves._state.bands[2].output.getColorTexture(0),
      u_waveNormal0: () =>
        surface._windWaves._state.bands[0].output.getColorTexture(1),
      u_waveNormal1: () =>
        surface._windWaves._state.bands[1].output.getColorTexture(1),
      u_waveNormal2: () =>
        surface._windWaves._state.bands[2].output.getColorTexture(1),
      u_time: () =>
        (surface._time * surface.flowSpeed * Math.PI * 2) / surface.waveLength,
      u_foamWidth: () => surface.foamWidth,
      u_foamIntensity: () => surface.foamIntensity,
      u_foamDetail: () => state.foamMaterial?.texture ?? context.defaultTexture,
      u_hasFoamDetail: () => !!state.foamMaterial?.texture,
      u_underwaterDepth: () => surface.underwaterDepth,
      u_cameraDepth: () =>
        surface._underwater?.active ? -surface._underwater.camera.z : 0,
      u_causticsIntensity: () => surface.causticsIntensity,
      u_refractionStrength: () => surface.refractionStrength,
      u_reflections: () => surface.reflections,
      u_maximumDistance: () => surface.maximumReflectionDistance,
      u_thickness: () => surface.reflectionThickness,
      u_maximumRoughness: () => 0.6,
      u_stepCount: () => surface.reflectionSteps,
      u_rayNear: () => state.near,
    },
  });
  surface._context = context;
  surface._lightingMode = "none";
}

Object.defineProperties(SceneGISWaterSurface.prototype, {
  /**
   * 不可变岸线索引纹理预算，单位为字节，包含填充。
   * @memberof SceneGISWaterSurface.prototype
   * @type {number}
   * @readonly
   */
  maximumUnderwaterBoundaryBytes: {
    get() {
      return this._maximumUnderwaterBoundaryBytes;
    },
  },
  /**
   * 已分配岸线索引纹理字节数，首次活动水下绘制前为零。
   * @memberof SceneGISWaterSurface.prototype
   * @type {number}
   * @readonly
   */
  underwaterBoundaryByteLength: {
    get() {
      return this._underwater?.texture?.sizeInBytes ?? 0;
    },
  },
  /**
   * 几何坐标契约。
   * @memberof SceneGISWaterSurface.prototype
   * @type {string}
   * @readonly
   */
  geometryMode: {
    get() {
      return this._geometryMode;
    },
  },
  /**
   * 曲面网格选择与缓存统计快照，局部水面为 undefined。
   * @memberof SceneGISWaterSurface.prototype
   * @type {SceneGISWaterSurface.MeshStatistics|undefined}
   * @readonly
   */
  statistics: {
    get() {
      return this._gridMesh ? { ...this._gridMesh.statistics } : undefined;
    },
  },
  /**
   *  借用的风浪模拟，移除其水面后才能销毁。
   * @memberof SceneGISWaterSurface.prototype
   * @type {SceneGISWindWaves|undefined}
   * @readonly
   */
  windWaves: {
    get() {
      return this._windWaves;
    },
  },
  /**
   *  最精细格网间距，单位为米。
   * @memberof SceneGISWaterSurface.prototype
   * @type {number}
   * @readonly
   */
  meshSpacing: {
    get() {
      return this._meshSpacing;
    },
  },
  /**
   * 几何是否已就绪可绘制。
   * @memberof SceneGISWaterSurface.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return !!this._command;
    },
  },
});

/**
 * Updates the primitive. Called by PrimitiveCollection; do not call directly.
 * @param {FrameState} frameState The frame state.
 * @private
 */
SceneGISWaterSurface.prototype.update = function (frameState) {
  if (!this.show || (!frameState.passes.render && !this._command)) {
    return;
  }
  const c = frameState.context;
  const state = WaterFrame.get(frameState);
  if (
    this._ellipsoidMesh &&
    (!(state.world instanceof Globe) ||
      !Cartesian3.equals(
        state.ellipsoid.radii,
        this._ellipsoidMesh.ellipsoid.radii,
      ))
  ) {
    throw new DeveloperError(
      "Ellipsoid water requires a Globe with the configured ellipsoid.",
    );
  }
  if (
    frameState.mode !== SceneMode.SCENE3D ||
    !state.hdr ||
    !c.webgl2 ||
    !c.depthTexture ||
    !c.colorBufferFloat ||
    !c.colorBufferHalfFloat ||
    !c.textureHalfFloatLinear
  ) {
    throw new RuntimeError(
      "SceneGISWaterSurface requires SCENE3D, HDR and WebGL2 floating-point color/depth textures.",
    );
  }
  if (this._context && this._context !== c) {
    throw new DeveloperError("A water surface belongs to one Scene context.");
  }
  validate(this);
  if (!this._command) {
    createResources(this, frameState);
  }
  if (this._windWaves && frameState.passes.render) {
    this._windWaves._update(frameState);
  }
  if (this._river && frameState.passes.render) {
    this._river._waves._update(
      frameState,
      Math.sqrt(12 / this._river.currentRippleLength),
    );
  }
  const command = this._command;
  command.modelMatrix = this.modelMatrix;
  command.boundingVolume = BoundingSphere.transform(
    this._localBounds,
    this.modelMatrix,
    command.boundingVolume,
  );
  this._pickId.object.id = this.id;
  if (frameState.passes.render) {
    const foamEnabled =
      (this.foamIntensity > 0 && this.foamWidth > 0) ||
      this._windWaves?.whitecapIntensity > 0;
    if (foamEnabled) {
      state.foamMaterial ??= new WaterFoam(state.requestRender);
      state.foamMaterial.update(c);
    }
    this._epoch ??= JulianDate.clone(frameState.time);
    this._time = JulianDate.secondsDifference(frameState.time, this._epoch);
    const record = frameState._sceneGISPlanarLighting?.active
      ? frameState._sceneGISPlanarLighting
      : frameState._sceneGISGlobeLighting;
    this._sky = record?.active ? record.skyReflections : undefined;
    this._sky?.update(frameState);
    this._radianceScale = record?.surfaceRadianceScale ?? 1;
    const lightingMode = record?.active
      ? frameState._sceneGISPlanarLighting?.active
        ? "planar"
        : "globe"
      : "none";
    if (this._lightingMode !== lightingMode) {
      const source =
        lightingMode === "none"
          ? new ShaderSource()
          : EnvironmentLighting.surfaceSource(lightingMode === "planar");
      if (lightingMode !== "none") {
        source.defines.push("SCENEGIS_WATER_PHYSICAL");
        Object.assign(
          command.uniformMap,
          EnvironmentLighting.surfaceUniforms(
            frameState,
            lightingMode === "planar",
          ),
        );
      }
      source.defines.push(...waterDefines(this));
      source.sources.push(
        curvedSurface,
        ray,
        riverFlow,
        optics,
        waterWaves,
        caustics,
        waterEffects,
        foamMaterial,
        fragment,
      );
      const previous = command.shaderProgram;
      command.shaderProgram = ShaderProgram.fromCache({
        context: c,
        vertexShaderSource: waterVertex(this),
        fragmentShaderSource: source,
        attributeLocations: waterAttributes(this),
      });
      previous.destroy();
      this._lightingMode = lightingMode;
    }
    if (this.underwaterDepth > 0) {
      if (this._profileWater) {
        this._domain ??= new WaterDomain(this._gridMesh);
      }
      this._underwater ??= new Underwater(
        this._hierarchy ?? this._gridMesh?.hierarchy,
        this._gridMesh,
        this._profileWater ? this._domain : undefined,
        this._maximumUnderwaterBoundaryBytes,
      );
    }
    this._underwater?.update(this, frameState);
    state.surfaces.push(this);
  }
  if (this._gridMesh) {
    this._gridMesh.update(this, frameState);
  } else if (this._mesh) {
    updateTiles(this, frameState);
  } else {
    frameState.commandList.push(command);
  }
};

/**
 *  @returns {boolean} 此水面是否已销毁。
 */
SceneGISWaterSurface.prototype.isDestroyed = function () {
  return false;
};

/**
 * 释放水面几何、着色器与拾取 ID，不拥有共享 Scene 输入。
 * @returns {undefined}
 */
SceneGISWaterSurface.prototype.destroy = function () {
  this._underwater?.destroy();
  this._domain?.destroy();
  this._gridMesh?.destroy();
  if (this._mesh) {
    for (const tile of this._mesh.tiles) {
      for (const entry of tile.cache) {
        entry.vertexArray.destroy();
      }
    }
  }
  this._command?.vertexArray?.destroy();
  this._command?.shaderProgram.destroy();
  this._pickId?.destroy();
  return destroyObject(this);
};
/**
 * 最近渲染更新的曲面水面网格统计。除单个 CPU 根外，首次更新前计数为零。字节数不包含 FFT 或 Scene 所有的捕获纹理，拾取通道不修改此快照。
 * @typedef {object} SceneGISWaterSurface.MeshStatistics
 * @property {number} visitedTiles 选择时考虑的 CPU 节点数。
 * @property {number} selectedTiles 可见网格绘制命令数。
 * @property {boolean} budgetLimited 叶节点预算是否阻止进一步细化。
 * @property {number} cachedTiles 保留的 CPU 节点数，包含没有 GPU 网格的节点。
 * @property {number} geometryBytes 保留的 GPU 网格总字节数。
 * @property {number} inactiveGeometryBytes 上次更新未绘制的 GPU 字节数，上限 16 MiB。
 * @property {number} triangles 选中三角形数。
 * @property {number} geometryBuilds 上次更新构建的 GPU 网格数。
 */
export default SceneGISWaterSurface;
