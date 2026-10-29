# 静态几何与 3D Tiles 体素化

引擎提供两个独立的实验 API：`SceneGISVoxelizer` 处理显式三角网格，
`SceneGIS3DTilesVoxelizer` 按区域主动加载静态 3D Tiles，再调用同一体素化核心。
结果可以供 SDK、风场或离线保存消费；本功能没有修改 SDK，也不需要复制发行包。

## 3D Tiles 最小调用

```js
const tileset = scene.primitives.add(
  await Cesium.Cesium3DTileset.fromUrl(tilesetUrl),
);
const localToWorld = Cesium.Transforms.eastNorthUpToFixedFrame(
  Cesium.Cartesian3.fromDegrees(-74.006, 40.713, 0),
);
const job = scene.primitives.add(
  new Cesium.SceneGIS3DTilesVoxelizer({
    scene,
    tileset,
    maximumGeometricError: 1,
    grid: {
      minimum: new Cesium.Cartesian3(-128, -128, -4),
      dimensions: new Cesium.Cartesian3(128, 128, 32),
      cellSize: 2,
      modelMatrix: localToWorld,
      fillMode: "surface",
    },
  }),
);

let voxels;
try {
  voxels = await job.resultPromise;
} finally {
  scene.primitives.remove(job);
}
```

`minimum` 是局部网格最小角，`dimensions` 是正整数格数，`cellSize` 是米制立方格宽。
上例覆盖 256 × 256 × 64 米。`modelMatrix` 只允许刚体变换：Globe 使用 ENU，
Planar 使用其 World 坐标中的刚体矩阵；不自动转换 CRS，也不自动移动源 tileset。
源数据与网格必须处于同一个世界坐标系。源 tileset 与 job 需直接挂载在同一
`scene.primitives`，使用 WebGL2 / SCENE3D；不支持 Cesium 的 SCENE2D/MORPHING。

`maximumGeometricError` 必须显式指定，单位为经过 tile transform 缩放后的世界米。
它选择源模型 LOD，**不等于体素格宽，也不是实际建筑误差证明**。REPLACE 选择目标子层，
ADD 保留必要祖先内容，因此结果中的 ADD 祖先 error 可以大于请求值。终端内容仍达不到
误差要求时明确失败，不静默使用较粗 LOD。空节点、外部 tileset 和 implicit subtree
继续遍历。区域请求独立于主相机，不修改显示选择；无需把相机移到目标区域。

## 结果与数据所有权

`voxels` 是普通数据对象，包含：

| 字段         | 含义                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| `version`    | 布局版本，目前为 1                                                      |
| `grid`       | 不可变的 `minimum/dimensions/cellSize/modelMatrix/fillMode` 快照        |
| `data`       | caller-owned `Uint8Array`，每格一字节：0 空、1 保守表面、2 网格封闭内部 |
| `statistics` | 三角形数、候选格测试数、表面/内部格数、输入/输出字节、Worker 计算毫秒   |
| `source`     | 3D Tiles adapter 才有：完整性、选中 URL/error、加载/快照/总耗时         |

布局为 `index = x + nx * (y + ny * z)`。格心的局部坐标是
`minimum + (ijk + 0.5) * cellSize`；乘 `grid.modelMatrix` 得到世界坐标。
`data` 可修改、持久化或转移给调用方 Worker。释放其引用即可回收，不需要 `destroy()`。
销毁 job、源 tileset 或 Scene 后，已返回的数据仍然有效。

`source.complete === true` 仅表示显式 tileset 层级中所需的区域内容已按选级规则读取，
不表示建筑水密、真实城市无缺失或物理实体已识别。加载失败、超时、unsupported content
都拒绝 Promise，不把未知区域当成空气。`tileset.tilesLoaded` 不用于这项判断。

## 表面和内部规则

默认 `fillMode: "surface"` 用三角形/格盒 SAT 保守覆盖，包括恰好接触格边界的三角形。
薄墙可以被覆盖，但会变厚；退化三角形、非有限坐标和非法索引报错，不自动修复。

显式 `"enclosed"` 从六个域边界，对非表面格做六邻接 flood fill，将不可达格记为 2。
这是一种**网格封闭区域填充**，不是连续几何内外分类或 manifold 检验。粗格网可能封住
窄孔，开口模型可能漏填；切到域边界的建筑不会自动补盖。域完全处于大建筑内部且没有
任何表面穿过时，也无法靠这个算法推断其内部。用于风场前，应保证源几何适用、留足边界
空隙，并做格宽对比；倾斜摄影、桥下空间和缺底建筑不能假定会自动变成正确实体。

## 支持的几何及语义

当前适用静态 Model-backed glTF/GLB、b3dm、i3dm TRIANGLES，复用原生解码、量化还原、
node/axis/instance 变换，可遍历 composite 和 multiple contents。Explicit 与 implicit
层级共用区域选择。点云、Gaussian、vector content、TRIANGLE_STRIP/FAN、skin、morph、
动画、customShader 和垂直夸大不在资格内，遇到时明确报错。

读取的是**全部静态源三角形**。样式隐藏、透明材质、裁剪平面/多边形和屏幕遮挡不参与
实体判定。窗玻璃、树叶或车辆也不会因为材质/语义自动排除。需要只计算建筑时，应提供
相应的建筑 tileset 或显式清理后的网格。任务期间源几何和变换必须保持静态；检测到
root modelMatrix 变化或所选 content 替换/卸载会中止。源本身的 per-node 修改由调用方
遵守静态契约，不进行任意场景变化扫描。

## 生命周期、预算与性能

- `job.status`：`loading / snapshot / voxelizing / complete / failed / cancelled`。
- `job.progress`：visited / waiting / selected / captured tiles 与三角形数。
- `job.cancel()` 拒绝未完成 Promise；job 是一次性任务，重算创建新 job。
- 移除 job 默认调用 `destroy()`，释放 owned Worker/timer；不销毁借用的 tileset。
- 取消后不再维持区域 cache pin；原生请求和缓存继续遵守 tileset 所有权，不强行取消
  可能仍被正常渲染使用的请求。完成后没有逐帧体素化或几何回读。
- `requestRenderMode` 下任务在需要加载/快照时请求后续帧；Worker 完成后也请求一次更新。

默认预算为：4096 个待选内容候选、每次 walk 100000 个节点测试、每正常帧快照 1 个
content tile、总计 120000 ms。`grid` 的默认预算为 16777216 格、256 MiB 输入
快照、2000000 三角形、50000000 个三角形候选格测试。选中模型的读取前内存预检使用
Float64 positions / Uint32 indices 的保守上界。超预算报错，不改变格宽。预算可显式配置。

体素化为 CPU Worker 预处理，不是 GPU LBM。Native Model 不保留 CPU 数据时，几何快照
通过现有 WebGL2 buffer readback 读取一次；每帧 tile 数预算不能阻止单个大 buffer 读取
造成主线程停顿。原生瓦片 cache 必须容纳待读取区域，预算不足可能导致超时。
总内存还包括源模型/纹理缓存、输入快照及输出；enclosed 模式额外使用每格 4 字节的
flood-fill queue，不应把 `outputBytes` 当作整个任务的峰值内存。

`statistics.computeMilliseconds` 是 Worker 计算时间，不包含加载、复制和消息传输。
`source.snapshotMilliseconds` 是主线程几何读取耗时，`loadMilliseconds` 包含加载与等帧，
`totalMilliseconds` 是任务总墙钟时间。示例展示这些数值，不用显示 FPS 代替计算性能。

## 显式三角网格入口

```js
const voxelizer = new Cesium.SceneGISVoxelizer({
  minimum,
  dimensions,
  cellSize,
  modelMatrix: localToWorld,
  fillMode: "surface",
});
try {
  const voxels = await voxelizer.voxelize([
    { positions, indices, modelMatrix: meshLocalToWorld },
  ]);
} finally {
  voxelizer.destroy();
}
```

`positions` 为紧密 XYZ 的 Float32Array/Float64Array；可选 indices 为 unsigned typed
array 的三角索引，无索引则每三个顶点组成三角形。mesh transform 可为仿射，grid transform
必须为刚体。入口复制输入后转移自有快照，不 detach 调用方数组。同实例同时一个任务，
完成或 `cancel()` 后可复用，不依赖 Scene。

## SDK 接入风场

```js
const g = voxels.grid;
const simulation = scene.primitives.add(
  new Cesium.SceneGISWindSimulation({
    minimum: g.minimum,
    dimensions: g.dimensions,
    cellSize: g.cellSize,
    modelMatrix: g.modelMatrix,
    solidMask: Cesium.SceneGISVoxelizer.createSolidMask(voxels),
    windSpeed: 3,
    timeStep: 0.02,
    paused: true,
  }),
);
```

`createSolidMask` 只把 1/2 转为 1，不再次验证物理实体。风场自己的格数、低马赫数和
时间步约束仍需满足，体素化支持的最大网格不等于风场支持的最大网格。速度和示踪量
随后沿已有 GPU 风场接口共享；这里仅初始化一次固体掩码，不每帧回读/上传。
参见 [UrbanWind.md](UrbanWind.md) 的运行和销毁顺序。

## 可复现示例

运行仓库开发服务器后打开 `/Test/Voxel/?world=globe` 或 `?world=planar`。
四个本地 glTF 瓦片包含八栋解析盒建筑，默认 128×128×32 / 2 米；可以选择 1/2/4 米，
对照源建筑、表面格心和水平切片。示例仅组装公开 API、显示结果与导出，不实现体素算法。
导出文件使用 4-byte little-endian JSON header 长度、UTF-8 JSON header、原始 Uint8
occupancy；这是示例的简易封装，不是新的引擎交换格式。通用 SDK 可自行保存 metadata + array。

构建、Specs、实测结果和限制见 [阶段记录](../../AgentDocs/mesh-voxelization/README.md)。
