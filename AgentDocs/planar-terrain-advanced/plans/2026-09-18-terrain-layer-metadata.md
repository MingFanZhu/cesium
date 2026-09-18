# 平面地形 layer.json 接入与 TileWorker 兼容核验

- Type: standalone plan
- Status: active
- Created / Updated: 2026-09-18
- Owner / architecture review: 当前 Agent；confirmed
- Parent: [平面高级地形](2026-08-10-planar-terrain-advanced-extension.md)
- Decision: [ADR-0080](../../../Documentation/SceneGIS/Decisions/ADR-0080-planar-terrain-layer-metadata.md)
- Baseline: `scenegis/develop@69f76a94c6`；已有独立大气修复保留，不混入本项
- Branch: `feature/planar-terrain-layer-metadata`
- Upstream-owned files / SGP: None

## 当前事实与范围

用户授权接入地形服务元数据，并与 SceneGISDataTool 的 TileWorker 维护任务统一地形协议。
公共字段沿用 Cesium 定义，平面及自定义坐标系特需字段放在 scenegis 下；只支持当前格式，
未知格式统一拒绝。双方各自维护自己的仓库。

TileWorker 的私有 profile 是 `scenegis-planar-heightmap-rgb24-v2` 与
`scenegis-planar-quantized-mesh-v2`；rootRange 是米制正方形，available 始终使用 TMS。
heightRange 由完整有效源扫描、补零及误差外扩形成，编码容量单列 encodingRange。
公开 quantized-mesh 使用经纬度 u/v，不能直接当作投影平面坐标。

现有 URL provider 支持 image/LERC 和 quantized mesh。新增服务层组合它们并提供静态稀疏 availability。
World 提供显式 canonical scheme 复用入口。现有 build 自动发现 owned Core 文件，Specs 自动进入 SpecList；
不手改生成入口或类型。既有 Worker、terrain runtime 与 availability 优先级可复用。

## 实现与验证

1. 新增异步 `SceneGISPlanarLayerTerrainProvider.fromUrl`，解析目录或 layer.json、相对模板、version、
   profile、rootRange、sample structure、levels、available 和 credit；组合现有两个 URL provider。
2. World 可显式复用 metadata provider 的 canonical tilingScheme；已建 World 可传入自身 scheme，
   校验 rootRange，不把私有 id 当作公共 CRS 或执行转换。
3. 支持两种当前私有 profile，读取 metadata 的全局保守高度范围，并允许调用方显式覆盖。
   未知格式、公开经纬度 mesh、parentUrl/dynamic metadata 明确拒绝。
4. Specs 验证解析、TMS availability 与两种 URL scheme、稀疏覆盖、错误输入、Request/Resource 和 World identity。
   真实 TileWorker 产物验证加载、采样、Worker、渲染、拾取和资源生命周期。
5. 完整 build/buildTs/tsc、相关 lint、ownership 审计；核对 producer 字节编码与 Cesium 官方规范。
   更新技术自审与 producer finding，不扩大到无关格式或全量性能矩阵。

## 当前交接

[两端契约](../discussions/2026-09-18-terrain-layer-contract.md) 已确认，ADR-0080 已同步。
生产端按其步骤 43 实施，产物对应提交 `77e2acfb524de2d723ab3a915a4cf7e339f2c3ba`；
源码身份核对与双方联合验收已完成。TW-R001/R002/R003 已关闭，见
[兼容性清单](../reviews/2026-09-18-tileworker-compatibility.md)。

provider 当前 11 项 Specs 全部通过，覆盖当前格式与未知格式校验。
当前格式范围清理由双方完成；生产端提交 `606bc911a5a96da5aa6cc41b0ec830fcd4594dbe`，
Go 地形定向测试通过，协议与产物字节不变；消费端两个 Chromium E2E 复核通过。
未改的 URL providers / World 保留 18 + 25 项通过证据。
两个真实 Chromium E2E 通过：完整 private 双格式、private 北侧及原生 Cesium 3857/4326 北侧可用性和 TMS 请求。
完整 build/buildTs/tsc、lint 与画面检查通过，示例直接读取服务公布的高度范围。
完整技术自审与范围限制见 [review](../reviews/2026-09-18-terrain-layer-metadata.md)。

本项源文件与 AgentDocs 的显式 Prettier 检查、AgentDocs 全量 markdownlint 已通过。
全量 AgentDocs Prettier 有 291 个既有文件格式问题，本项涉及文件通过，未格式化其他扩展。
上游补丁审计和 git diff --check 通过：本项 upstream-owned files / SGP 均无，generated status 为 0。
用法见 [PlanarWorldGuide](../../../Documentation/SceneGIS/PlanarWorldGuide.md) 和
[地形服务](../../../Test/Planar/地形服务.html)。

状态 active，仅待项目负责人视觉验收。本项未提交或 push，既有大气变更保持独立。
