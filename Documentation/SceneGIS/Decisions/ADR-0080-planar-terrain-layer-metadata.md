# ADR-0080：平面地形服务元数据入口

- Status: approved for implementation
- Date: 2026-09-18
- Owner: 当前 Agent；项目负责人已授权接入能力
- Plan: [地形元数据接入](../../../AgentDocs/planar-terrain-advanced/plans/2026-09-18-terrain-layer-metadata.md)
- SGP: None

## 上下文

Cesium 1.144 的 `CesiumTerrainProvider.fromUrl` 先读取 layer.json，再创建同步 ready provider。
SceneGIS 的 ADR-0007 预留相同异步工厂边界；ADR-0011/0028 的 URL providers 则保持显式配置与
coordinate-agnostic 瓦片职责。本决定新增服务层，不让这些低层 provider 推断 CRS。

## 决策

新增 owned Core 类型 `SceneGISPlanarLayerTerrainProvider`，只通过 `fromUrl(url, options)` 创建。
工厂读取目录下的 layer.json 或显式 JSON 地址，保留 Resource 的 headers/query/proxy，解析相对 tiles 模板与 version。
支持 TileWorker 的 `scenegis-planar-heightmap-rgb24-v2` 与 `scenegis-planar-quantized-mesh-v2`，
仅支持上述当前 profile，其余格式统一按不支持处理；拒绝 parentUrl 与 metadataAvailability。
公开 quantized-mesh 的 v 是纬度插值，即使 projection 为 EPSG:3857 也不等于平面 Y，不静默复用。

metadata 必须声明 private、metre、east/north/up、正方形 rootRange、0..maxzoom 与完整 Level-0 root。
available 保持 Cesium 公共含义，始终按 TMS 行方向解释并统一到 northwest XYZ，独立于网络 URL scheme。
URL scheme 支持 Cesium 当前实现的 tms / slippyMap，不另设 xyz 别名；TileWorker 新地形输出统一为 tms，
实际目录和 HTTP 行号同步采用 TMS，内部 matrix rowDirection 不变。
所有层显式提供，空数组代表无数据。geometry 请求只发送到已知存在的 tile；后续 fallback 复用现有 runtime。
稀疏 metadata 不改变低层 URL provider 的 full-pyramid contract。

RGB24 profile 使用声明的 boundary posts、structure 与全局 heightRange；decoded data 仍通过原 provider 验证。
正式准备的 TileWorker v2 layer 发布 source-scan-conservative 的 heightRange.minimum/maximum，
由完整有效源高程扫描、补零、重采样/编码误差及 QM Float32 外扩推导，覆盖所有成功解码的地表和逐片头边界。
编码容量另放 encodingRange。调用方可显式提供保守的 minimumHeight/maximumHeight；
根 tile extrema 不代表所有后代，不能充当默认值。数据源范围不混入消费端裙边。几何误差可显式覆盖；
有 grid posts 时使用既有 heightmap 的 quarter sample-spacing 名义误差，mesh 另保留 quantization/skirt 下限。
不引入逐帧 metadata 请求、额外 Worker、GPU resource 或缓存。

`fromUrl` 可复用调用方的 tilingScheme，校验其 extent 与 rootRange 完全一致；无 scheme 时从显式 rootRange 创建。
私有 coordinateSpace.id 只作为 opaque id，不用于转换或强制匹配已有 CRS 标签。
`SceneGISPlanarWorld` 增加 optional tilingScheme：可由其取得 coordinateSystem，若两者同时提供必须 identity 一致。
World、provider 和 imagery 保持同一 canonical object，provider 仍 caller-owned，挂载继续使用 world.terrainProvider。

## 取舍与交付

不把 metadata factory 加到 abstract interface，也不复用 Globe provider/runtime；独立服务类型使错误边界与
支持格式明确。原 URL provider、Worker、renderer、shader、上游文件不因本入口改写。
新 Core 文件由现有 basename barrel / JSDoc 自动交付，验证根导出、类型、metadata Specs 与本地真实产物加载。
无新的 upstream seam / SGP。生产端公开格式的兼容 finding 单独记录，不以平面私有 profile 通过宣称完整标准认证。

## 跨仓库协议对齐

负责人要求公共字段沿用 Cesium 定义，平面特需字段集中在 scenegis 命名空间。
生产端与消费端已确认完整协议；具体确认和联合交接见
[协议讨论](../../../AgentDocs/planar-terrain-advanced/discussions/2026-09-18-terrain-layer-contract.md)。
