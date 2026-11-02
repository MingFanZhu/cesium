# 分段 Gaussian 泼溅

`SceneGISGaussianSegmentedPrimitive` 加载 `segmented-active-cut-v3` 的 MCI4/GSP 产品。
这是旧自定义分段路线的迁移，保留 Active Cut、CPU Worker 排序、Core/SH page atlas、
预算控制及 IndexedDB 缓存；不包含 fixed10 加载器/切片器、训练蒸馏或 SDK 接入。

## 引擎用法

```js
const MiB = 1024 ** 2;
const splats = viewer.scene.primitives.add(
  new Cesium.SceneGISGaussianSegmentedPrimitive({
    url: "/assets/capture/scene.mcl.json",
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(116.4, 39.9, 20),
    ),
    maximumSelectedSplats: 1_000_000,
    maximumCoverageSlots: 10000,
    maximumCpuBytes: 512 * MiB,
    maximumGpuBytes: 256 * MiB,
    maximumCpuPageBytes: 128 * MiB,
    replacementCpuEscrowBytes: 32 * MiB,
    maximumGpuPageBytes: 128 * MiB,
    replacementGpuEscrowBytes: 32 * MiB,
    maximumSortWorkingSetBytes: 128 * MiB,
    minimumLeafLogicalLevel: 0,
    usePersistentCache: false,
  }),
);
```

平面世界使用米制 Cartesian 刚体矩阵，例如 `Matrix4.fromTranslation(new Cartesian3(x, y, z))`。
实际变换为 `modelMatrix * artifact.localToFixed`；已经带 ECEF 放置的数据通常使用 identity
`modelMatrix`，不能再叠加一次 ENU。源坐标要求 `metersPerUnit=1`，矩阵不允许缩放、剪切或反射。

| API                           | 含义                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| `show`                        | 控制绘制；隐藏时继续流式更新并保留驻留缓存                         |
| `color`                       | 捕获颜色的乘子（默认 WHITE）                                       |
| `falloff`                     | 正数 alpha 衰减倍率（默认 1）                                      |
| `modelMatrix`                 | 赋新矩阵触发放置、选择和排序更新；不要原地修改 getter 返回值       |
| `boundingSphere`              | 索引加载后的世界包围球，可用于定位；不要修改返回值                 |
| `ready`                       | 已有可绘制的当前内容，不表示所有细节已加载                         |
| `state` / `error`             | 加载与失败状态；预算阻塞保留当前可绘制内容                         |
| `statistics`                  | 按需读取只读快照：选择数量、atlas 字节、上传、排序、缓存与清理计数 |
| `destroy()` / `isDestroyed()` | 停止工作、释放自有资源；完成异步清理后 `isDestroyed()` 为 true     |

图元拥有请求、Worker、atlas 和 presentation；加入 collection 后由 collection 销毁。
`scene.primitives.remove(splats)` 会启动清理，`destroy()` 返回 undefined。
绘制资源同步释放，Worker acknowledgement 和缓存释放由自有定时清理完成，不依赖下一帧。
允许随 Scene 一起销毁。需要确认全部释放时检查 `isDestroyed()`。

## 质量、预算与平台

要求 WebGL2、integer texture array 和可用 Web Worker。运行时不逐帧回读 GPU。
排序在 Worker 中进行，不是 GPU 排序；每个图元内部全局排序，多图元之间仍按 command 排序。
渲染捕获外观及最多 3 阶 SH，不提供 PBR 重光照、单点拾取或 Gaussian 实体碰撞。
沿用当前引擎 Gaussian pass，服从不透明场景深度，支持球面/平面及 log depth。

CPU/GPU 总预算、page 子预算、替换 reserve 和排序工作集必须显式配置；示例值只是起点。
atlas 按配置和设备限制预分配，`maximumGpuPageBytes` 不能按当前已显示点数估算。
应根据真实数据与设备调整上限，`statistics.gpuAtlasAllocatedBytes` 可检查实际容量。
`maximumCoverageSlots` 控制选择复杂度，`maximumSelectedSplats` 控制可见点上限。
`refineErrorPixels=16`、`coarsenErrorPixels=12` 提供滞回；默认最细叶 LOD 为 1，设置 0 可用原始层。

默认启用独立 IndexedDB page 缓存，容量默认 4 GiB、暂存默认 64 MiB，仍受浏览器 quota 限制。
`usePersistentCache=false` 完全关闭；`requestPersistentStorage=false` 禁止请求持久化许可。
数据页按内容身份和校验隔离，失败的浏览器缓存不应阻止 HTTP 加载。

## 视频投射

可作为 `SceneGISVideoProjection.gaussianTargets` 的接收者并提供近似遮挡。
不需重新切片或训练，复用同一套选级预算、Worker 与 GPU 图集；
用法、颜色契约、透明度阈值和资源所有权见[视频投射](VideoProjection.md#自有分段高斯)。

## 切片与部署

CPU 工具位于 [Tools/GaussianSplatTiler](../../Tools/GaussianSplatTiler/README.md)，
从完整仓库运行，Node.js 22+，不需要训练框架。支持 binary little/big-endian Gaussian PLY 和已有 PLY LOD 打包。
全部参数、坐标系/中心点配置及普通切片的大坐标精度限制见
[切片器使用说明](../../Tools/GaussianSplatTiler/使用说明.md)。
分段层次的 XYZ cell 参数不是旧 fixed10 XY 产品路线；保留其参数是为了兼容当前分段协议。

部署保留 `scene.mcl.json`、`scene.mci`、`packs/` 相对结构，服务器需要 byte Range 支持；
跨域部署配置 CORS，允许读取 `Content-Range`。运行时只接受当前 MCI4 分段产品，拒绝旧 fixed10/MCI3。
引擎构建与 npm 包交付两个 owned Worker；必须部署完整 Workers 目录及依赖 chunks，
正确设置 `CESIUM_BASE_URL`。新增 Worker 后需重启已经运行的开发服务器以更新构建入口。

本地示例：先运行 `node Tools/GaussianSplatTiler/examples/create-demo.js`，再打开
`/Test/Rendering/分段高斯泼溅.html`。支持平面与球面、其他数据 URL、遮挡和位置变换。
大型真实资产的性能与最终视觉质量仍需在目标设备上验收。
