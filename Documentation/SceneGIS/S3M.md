# S3M 图层

`SceneGISS3MLayer` 将 S3MB 在 Worker 中解码为原生 Model 输入，复用当前
材质、光照、深度和拾取管线。入口是 JSON SCP 或 iServer 单图层 `config`，
不直接接收整个 iServer 场景列表。

## 球面加载

```js
const layer = await Cesium.SceneGISS3MLayer.fromUrl("/data/cbd.scp");
viewer.scene.primitives.add(layer);
viewer.camera.flyToBoundingSphere(layer.boundingSphere);
layer.tileFailed.addEventListener((error, url) => {
  console.error(url, error);
});
```

默认使用 SCP `position.units === "Degree"` 的位置建立 ENU 变换。其他定位方式
必须提供 `modelMatrix`。不得将任意坐标参考系统猜测为经纬度或 Web Mercator。
`Resource` 输入会保留请求 headers 和 query parameters。

## 平面加载

```js
const layer = await Cesium.SceneGISS3MLayer.fromUrl("/data/cbd.scp", {
  world: viewer.scene.world,
  modelMatrix: Cesium.Matrix4.fromTranslation(
    new Cesium.Cartesian3(13000000, 4000000, 0),
  ),
});
viewer.scene.primitives.add(layer);
viewer.camera.flyToBoundingSphere(layer.boundingSphere);
```

`world` 必须是当前 Scene 的 live `SceneGISPlanarWorld`。矩阵将数据局部米制
XYZ 放入该 World；示例平移量仅作演示，不是地理转换。球面 ENU 数据放入平面时，
应用负责选择合适的局部坐标、朝向、比例与高程基准。

图层绑定一个 World / Scene / Context，只支持 SCENE3D。不允许在另一 World
复用已绑定实例；应重新创建。错误绑定在请求和 GPU 资源创建前拒绝。

## LOD、拾取和生命周期

- `fromUrl` 完成表示配置可用，GPU 内容在加入 Scene 后按视图加载。
- `boundingSphere` 是世界坐标包围球副本，可立即用于原生 Camera 定位。
- S3M 自身 PageLOD 的距离、投影半径和 geometric error 三种模式分别处理，
  不将所有范围强行解释成 3D Tiles geometric error。
- `lodRangeScale` 默认 1；增大趋向粗级。geometric error 模式另用
  `maximumScreenSpaceError`，默认 16。
- 子瓦片的全部模型和纹理就绪前保留父页；替换后不同时提交该父页。失败报告
  `tileFailed(error, url)`，保留父页，不自动重试。
- pick-only pass 重放上一正常渲染帧的选择，不触发下载、LOD 选择或缓存淘汰。
- `maximumDepth` 默认 Infinity，可显式限制子树。`maximumRequests` 默认 6，
  包含下载、Worker 解码及 GPU 准备；每个图层最多同时调度两个解码任务。
- `maximumCachedTiles` 默认 64，`maximumCachedBytes` 默认 256 MiB；
  缓存按 LRU 淘汰。它们是内容软上限，当前可见覆盖及必要祖先可能超过预算，
  以避免为了达成预算而产生空洞。GPU 数字不包含驱动开销和瞬时解码内存。
- `statistics` 提供请求、失败、缓存、当前选中页、最深 LOD 和 GPU 缓冲/纹理大小。
  `tilesLoaded` 表示上一正常渲染视图没有待加载内容；失败数另行检查。

```js
const hit = viewer.scene.pick(windowPosition);
if (hit?.primitive?.id === layer && typeof hit.getProperty === "function") {
  console.log(hit.getProperty("s3mId")); // Authored ID, as a string.
  console.log(hit.getProperty("idKind")); // "object" or "geometry".
  console.log(hit.getProperty("geometry")); // Geometry name within the picked Model.
}
viewer.scene.primitives.remove(layer); // Default collection ownership destroys it.
```

没有业务 ID 的倾斜摄影仍可按原生 ModelFeature 拾取，`idKind` 为 `geometry`，
`s3mId` 为空字符串。不会伪造业务 ID。实例化保留原始实例 ID，按实例颜色分组后
交给原生 GPU instancing，不按每个业务对象创建独立 Model。

## 运行时变换

`layer.modelMatrix` 可读写，也允许原地修改，支持平移、旋转和缩放。它是完整的
**S3M 局部米制坐标到当前 World 的放置矩阵**；球面默认值已包含 SCP 的 ENU
定位，赋值会替换整个放置矩阵。需要相对初始位置调整时，应先保存初始矩阵并组合：

```js
const initialMatrix = Cesium.Matrix4.clone(layer.modelMatrix);
// Move 20 metres along the original local up axis; preserve the ENU frame.
layer.modelMatrix = Cesium.Matrix4.multiplyByTranslation(
  initialMatrix,
  new Cesium.Cartesian3(0, 0, 20),
  new Cesium.Matrix4(),
);
viewer.camera.flyToBoundingSphere(layer.boundingSphere);

// Restore in place. In requestRenderMode, explicitly request a frame.
Cesium.Matrix4.clone(initialMatrix, layer.modelMatrix);
viewer.scene.requestRender();
```

赋值会复制输入并请求渲染；`boundingSphere` 立即反映新矩阵，可在首次渲染前定位。
下一正常渲染帧同步更新已缓存模型、瓦片包围体、距离与几何误差 LOD 阈值，像素
LOD 阈值保持像素单位。异步完成的模型也使用最新矩阵；不会因修改矩阵而重新解码、
清空缓存或重建 GPU 模型。位置变化导致新区域可见时，仍按正常 LOD 选择请求数据。
单独的拾取帧沿用上一正常渲染帧的位置，与当前画面保持一致。

矩阵必须有限、仿射且最大缩放非零。变换不会改变绑定的 World，也不会自动投影
数据坐标或重新解释实例内部变换。示例提供局部 XYZ 偏移、旋转、缩放和复位控件。

## 本轮资格范围

已用官方精模 CBD、comModel 实例化构件、晋江倾斜摄影在球面与平面验证。
首版限定 S3M 1.0、standard triangle vertices、17-float 实例布局、
DXT1 / DXT5 与 JSON 材质。其他版本、压缩顶点、不同实例布局、点云、骨骼动画、
外部属性数据库以及 Gaussian splatting 均未接入，不宣称完整商业 iClient 兼容。

材质映射到原生非金属粗糙 PBR 表面。缺少法线时生成面法线，保留官方开源
Shader 实际启用的首张纹理，不擅自解释其被注释的第二纹理路径。
DXT 在 Worker 转为嵌入 PNG；这会增加解码中间内存和 GPU 纹理大小，
换取原生 Model 对资源、材质及生命周期的统一管理。

开发入口：[S3M 图层加载](../../Test/S3M/图层加载.html)。
本地 CBD 仓库样例缺少深层引用文件，因此示例明确使用 `maximumDepth: 2`；
实例化样例完整加载至 depth 4。在线倾斜摄影原配置的 10 个根中有 8 个返回 404，
因此示例通过本地最小 SCP 明确引用已验证的官方在线子区，使用 `maximumDepth: 1`，
服务不可用时可选择本地样例。离线资格缓存准备和测试方法见
[数据说明](../../Test/S3M/data/README.md)。

解码来源及许可证：[provenance](../../packages/engine/Source/Assets/SceneGIS/S3M/README.md)。
架构与升级边界：[ADR-0174](Decisions/ADR-0174-s3m-model-loading.md)。
