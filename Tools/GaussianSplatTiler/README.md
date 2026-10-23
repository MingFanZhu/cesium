# SceneGIS 分段 Gaussian CPU 切片器

Node.js 22+，从完整 SceneGIS 仓库运行，无额外 npm 依赖或训练框架。
仅生成 `segmented-active-cut-v3` 产品，不提供 fixed10 加载/切片。
分段层次自身仍使用可配置 XYZ cell（默认 10×10×20 米），这与旧 fixed10 XY 渲染路线不同。

## 使用

在仓库根目录执行，输出目录必须尚不存在：

```powershell
node Tools/GaussianSplatTiler/src/segmentedCli.js build input.ply --output output-scene --fixed-grid-origin 0,0,0 --tile-size 10,10,20 --workers 4
node Tools/GaussianSplatTiler/src/segmentedCli.js inspect output-scene
node Tools/GaussianSplatTiler/src/segmentedCli.js validate output-scene
npm test --prefix Tools/GaussianSplatTiler
```

输入为 Gaussian PLY，保留位置、旋转、尺度、不透明度及球谐系数。源坐标以米为单位，
当前 ABI 要求 `metersPerUnit=1`、proper rigid transform，不能用矩阵缩放代替单位转换。
`--coordinate-system local|ecef`、`--local-origin x,y,z`、`--local-to-fixed` 的 16 个
列主序元素用于数据放置元信息；工具不自动推断 CRS 或投影。

`--workers` 默认取可用并行度减一并限制在 1–32。单物理 part 上限 400000 splats；
`--batch-size` 默认 16384，`--max-pack-bytes` 默认 512MiB，
`--temporary-directory` 可指定临时盘。需为 PLY、临时 spool 和产品预留足够磁盘；
worker 数影响 CPU/RAM，并非实时或固定内存保证。失败清理自有临时目录，不覆盖既有输出。

输出包含 `scene.mcl.json`、`scene.mci` 和 Core/SH packs。部署时保留目录结构，
HTTP 服务应支持 byte Range。图元 URL 指向 `scene.mcl.json`。
保持旧 MCI4/GSP 格式、CRC 与 producer policy，原分段产品无需重切。

## 已有 LOD 导入

CPU 工具也可以打包已制作的 PLY LOD，不在此训练或蒸馏：

```powershell
node Tools/GaussianSplatTiler/src/prebuiltLodCli.js build --manifest levels.json --output imported-scene
node Tools/GaussianSplatTiler/src/prebuiltLodCli.js validate --input imported-scene
```

输入 schema 和约束由 `src/prebuiltLodSource.js` 定义，完整最小用例见
`test/prebuiltLod.test.js`。不把普通 CPU producer 的严格 half-rate 校验放宽给其他产品。

## 维护与来源

迁自旧 Cesium 1.141 自有实现，基线 `9f90975b4f478b4795df96a1112bd6518f9d22a7`，
包含迁移时工作树内的分段修正和 authored LOD 导入。按仓库 Apache-2.0 许可证维护。
边界见 [ADR-0188](../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)。

Node I/O/reducer 位于本工具；纯协议和数学直接引用
`packages/engine/Source/SceneGIS/Core/_private/Gaussian`。分发此工具时需要完整仓库，
不能单独复制 Tools 子目录。它不进入 Cesium npm 包，不修改根 workspace。

测试迁移保留当前有效的分段行为用例。旧 runtime 测试中 24 项在原工作树也失败，
涉及旧 XY fixtures、未计 atlas padding 的 GPU receipts 和旧选择指标；未作为有效用例搬入。
其处置及新增运行时资格在 [AgentDocs](../../AgentDocs/gaussian-splats/README.md) 跟踪。
