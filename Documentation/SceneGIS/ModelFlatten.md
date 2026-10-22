# 模型局部压平

`SceneGISModelFlatten` 是可直接赋给 `Cesium3DTileset.customShader` 的
`CustomShader` 子类。首版支持静态三角网格 3D Tiles 的球面与平面 SCENE3D 渲染，
包括凹面和直接孔洞；复用原生瓦片加载、LOD、材质与拾取标识。

```js
const frame = Cesium.Transforms.eastNorthUpToFixedFrame(
  Cesium.Cartesian3.fromDegrees(118.8, 32.0, 0),
);
const polygon = new Cesium.PolygonHierarchy(
  [
    new Cesium.Cartesian3(-100, -100, 0),
    new Cesium.Cartesian3(100, -100, 0),
    new Cesium.Cartesian3(100, 100, 0),
    new Cesium.Cartesian3(-100, 100, 0),
  ],
  [
    new Cesium.PolygonHierarchy([
      new Cesium.Cartesian3(-20, -20, 0),
      new Cesium.Cartesian3(20, -20, 0),
      new Cesium.Cartesian3(20, 20, 0),
      new Cesium.Cartesian3(-20, 20, 0),
    ]),
  ],
);
const flatten = new Cesium.SceneGISModelFlatten({
  polygonHierarchy: polygon,
  modelMatrix: frame,
  height: 5,
});
tileset.customShader = flatten;
flatten.height = 10;
flatten.inverse = true; // Preserve the polygon; flatten its exterior and holes.
flatten.enabled = false;
scene.requestRender();

// Detach before destroying the caller-owned shader.
tileset.customShader = undefined;
flatten.destroy();
```

平面用 `Matrix4.fromTranslation(new Cartesian3(originX, originY, 0))` 作为
`modelMatrix`，范围点为相对该原点的米制 XY，此时 `height` 对应世界 Z。
球面示例使用 ENU 的局部 Z 水平面，**不是严格等椭球高曲面**；不要直接给每块
瓦片的模型 Z 赋值。范围及 frame 在构造时复制，不随 tileset 后续移动而移动。
每个绘制命令的模型到范围坐标变换在 CPU 双精度计算，避免 GPU 大坐标相减。

`inverse` 可在构造时设置，默认 `false`，也可在运行时切换。开启后，选中的多边形
保留原高度，外部与孔洞压到 `height`；作用范围仅限使用此 Shader 的模型，不影响
地形或其他图层。高度仍使用同一局部坐标系，无须另设反向高度。

## 范围和开销

- 一个实例管理一个外环和若干直接孔洞，输入合计最多 256 点，支持闭合重复末点。
- 输入 XY 转 Float32 后校验简单环、孔洞包含与相交关系；Z 忽略。
- 默认外环边界压平、孔洞边界保留；反向时外环边界保留、孔洞边界压平。
  边上判断采用局部米制 `0.0001` 容差，两种模式严格互补。
- 范围和 frame 不可变。改变范围时创建新实例、替换 `customShader`，然后销毁旧实例。
- 高度、启停、反向开关只更新数值，无须重建 Shader 或范围纹理。
- 一张固定 `256 × 2 RGBA32F` 纹理，共 8 KiB；不新增 draw call、FBO 或 Worker。
- 顶点先做 AABB 排除，再遍历范围边。范围内部顶点成本随边数线性增加，
  256 点是容量上限，不代表复杂范围对大型模型没有性能成本。
- 启用时维护覆盖原始和变形位置的保守包围体，关闭或移除恢复原值。
  保留原生 SSE 算法，包围体变大可能使选级、可见性更保守。
  反向模式不再排除范围 AABB 外的包围体，所有瓦片都可能受到变形影响；
  因此可能选中更多瓦片，但不增加绘制 pass 或修改原生调度。

## 资格边界

已有顶点满足当前模式的范围判断才改变高度；**不切开跨边界三角形**。边缘可能出现斜坡，
范围很小或孔洞很小时可能没有足够顶点表达，LOD 改变也可能改变边缘。
不会重建侧壁、消除重复共面表面，或修改原始摄影纹理里已经烘焙的阴影。
变形三角形使用几何法线，未变形区域保留原始材质法线。

原生渲染拾取与深度位置拾取使用变形后的表面；CPU 原始三角形查询、离线数据和导出
仍表示原数据。点线、skin、morph 与 legacy i3dm 世界坐标实例在活动绘制时拒绝；
classification、动态动画、高级材质扩展和多个 CustomShader 组合未纳入本轮资格。
继承的 uniforms 是内部实现细节，请通过 `height` / `enabled` / `inverse` 修改状态。
调用方负责将 frame 放到与 tileset 相同的 World，不自动投影或猜测 CRS。

Shader 限制单 Context，调用方拥有生命周期。先从全部消费者卸下，再销毁 Shader，
最后销毁 Scene/Context。销毁 Viewer 也必须显式释放调用方持有的 Shader。

## 验收与 SDK 接入

直接打开 [模型压平示例](../../Test/模型压平.html)，切换球面/平面、真实摄影/确定性网格、
凹面/孔洞、正向/反向、启停、高度和范围。网格示例可以对照粗细 LOD；摄影数据复用本仓库
AGI HQ fixture，许可证保留在原目录，不依赖公网或 token。

SDK 后续只需封装此实例和生命周期，不需要注入 Shader 源码或访问私有字段。
待负责人视觉验收后再由 SDK 对话集成。
原生 CPU 包围体接入见 [ADR-0175](Decisions/ADR-0175-model-flatten.md) / SGP-0064。
