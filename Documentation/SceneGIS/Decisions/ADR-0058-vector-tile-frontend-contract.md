# ADR-0058：Vector Tile Frontend Contract

- Status: Accepted
- Date: 2026-09-12
- Related: ADR-0057、ADR-0002
- Plan: [V1](../../../AgentDocs/vector-tiles/plans/2026-09-12-v1-vector-frontend.md)
- Upstream changes: `packages/engine/package.json`、`ThirdParty.extra.json`
- SGP: `SGP-0011`（JSON manifest-only）

## Context and alternatives

独立 MVT 前端必须保存 identity、数值与 tile-local 几何，且与 Scene/World 解耦。
当前 engine 已有 protobufjs minimal Reader；使用它避免重写完整 protobuf。
独立 `@mapbox/vector-tile` 默认 Number identity 不能直接满足本项目无损 uint64 契约，
本阶段选择自有 MVT schema/grammar 层加现有 protobuf Reader，而非移植 Cesium decoder。

样式采用 `@maplibre/maplibre-gl-style-spec 24.8.1` 独立前端，
用成熟的类型/表达式语义减少自有解释器与规范的偏差。
包为 ISC，独立 ESM/CJS、无 renderer/DOM 注册，固定版本并限制 SceneGIS profile。
加入依赖不意味着自动支持该库的全部 layer/property/expression。

## Data and geometry

`SceneGISVectorTile.decode(ArrayBuffer|Uint8Array)` 返回纯数据 `{layers}`。
Layer 保存 name/version/extent/features；Feature 保存可缺省的十进制 string ID、
MVT type（1/2/3）、null-prototype properties、geometry。
整数属性在 JS safe range 内返回 number，超出返回 bigint；原始字符串与整数不混淆。
Geometry 保存 `parts: Float64Array[]`（交错 XY）及 `polygonStarts: Uint32Array`。
Point 的一个 part 可有多个点；line 每 part 一条线；polygon 每 part 一个不重复末端的 ring，
polygonStarts 标识 exterior ring 的 part index，随后直到下一个 exterior 的 rings 为 holes。

严格检查 MVT 2 所需 name/version/extent，拒绝未知版本和 UNKNOWN geometry；
检查消息/varint 边界、属性 tags、命令顺序/数量、截断参数、polygon winding/非零面积。
支持 buffer 坐标与多 layer extent，不 clamp 至 tile bounds，不输出 ECEF，不读取 CRS。
这不是全拓扑校验器，不修复自交或重新安排不符合规范的 rings。
输入 byte buffer 被借读、不修改/转移，输出归调用方；不拥有 GPU、请求或 destroy。
错误 payload 用 RuntimeError；API 配置错误用 DeveloperError。

## Coordinates and source

`SceneGISVectorTileCoordinates` 将匹配的 `SceneGISPlanarTilingScheme`、
canonical XYZ、layer extent 和 u/v 映射为完整 double Cartesian3。
只对 Y 做一次翻转。height 明确为绝对米制 Z，默认 0，不读取 terrain。
Style zoom 由 `log2(rootWidth / (tileSize * metersPerPixel))` 得到；
默认 reference tileSize 512 CSS pixels，metersPerPixel 由 V2 在明确参考平面求得。
该公式不从 source maxzoom、terrain LOD 或 camera height 猜测 zoom。

`SceneGISVectorTileSource` 接受 url（string/Resource）、tilingScheme、
minimumLevel/maximumLevel（默认 0/22）、scheme（xyz/tms）与可选 credit。
构造无请求；地址严格校验且不自动 wrap/overzoom。
`getTileResource` 创建派生资源，`requestTile` 返回解码 Promise，
或在 Cesium scheduler 未发出请求时同步返回 undefined。
兑现的空响应/204/零字节是合法空 tile；404/网络/取消/畸形 payload 不转换为空成功。
Source 不 retry、不建立 cache、不拥有 World；调用方拥有 Request，V2 处理 generation/stale completion。
本阶段 URL templates；TileJSON、任意 matrix 重映射和托管服务协议延后。

## Style profile and evaluation

`SceneGISVectorTileStyle` 接受独立 style JSON，构造前校验/编译，复制配置，
不得依靠调用者后续修改 JSON 改变已编译状态。
V1 profile 名为 `scenegis-vector-v1`：

- Root：version、name、metadata、sources、layers。Source：vector、tiles、minzoom/maxzoom、scheme、attribution。
- Layers：background、fill、line、circle；id/type/source/source-layer、filter、minzoom/maxzoom、
  metadata、layout、paint。暂不接收 symbol、extrusion、raster、terrain、sprite/glyph 与 camera 配置。
- Paint：background color/opacity；fill color/opacity/outline-color/antialias；
  line color/opacity/width/gap-width/offset/blur/dasharray；circle color/radius/opacity/stroke-color/stroke-width/stroke-opacity/blur。
- Layout：visibility；line-cap、line-join、line-miter-limit、line-round-limit。
- Expressions：literal、get/has、id、geometry-type、zoom、比较与逻辑、match/case/coalesce、
  step/interpolate（linear/exponential）、基本算术、number/string/boolean 断言、
  to-number/to-string/to-boolean/to-color、concat、rgb/rgba；legacy filter 采用相同库规则。
  不接收 feature-state、global-state、geometry-dependent filter、未知 operator 或旧 style function objects。

`evaluateLayer(layerId, feature, zoom)` 返回显式 show、基础 layer 信息及 layout/paint 值，
保留 style layer 顺序。Paint 按 fractional zoom，layout/filter 按 floor zoom；
minzoom inclusive/maxzoom exclusive，visibility=none 或 filter 不匹配时 show=false。
Color 对调用方表现为 Cesium Color，不泄漏 MapLibre expression/Color 对象。
Property 的 constant/source/camera/composite 分类可查询，供 V2 建立失效边界；
本阶段没有 GPU 更新或自动 mutation observer。

Style 输入里的 Feature ID 固定 string；超安全整数属性转换为十进制 string 后进入样式，
避免隐式数值舍入。显式 to-number 是调用方选择的浮点转换，不承诺任意 64 位精度。
缺失值/合法表达式运行时类型错误遵循库的 default/error 语义；
unknown profile 能力在应用前带路径拒绝，不能静默忽略。

## Build, upgrade and qualification

四个入口在 SceneGIS/Core，Specs 镜像；由既有根 barrel/JSDoc/types 自动生成。
SGP-0011 仅登记 JSON 依赖和第三方名录，不新增构建器、Scene pass 或实验性 MVT 修改。
Minimal protobuf 与样式库通过既有 bundler，运行时不拉 CDN 或加载 GL JS。
升级需复核固定样式库的导出、默认值/颜色/zoom 行为及 protobuf Long/边界；
已测试 profile 不随 dependency upgrade 静默扩大。
依赖变更验证 development/release、types、focused Specs 与 installed package consumer。
实际地图及直接贴地画面资格在 V2/V4，不由本 ADR 的前端测试替代。

仓库 `.npmrc` 设置 `package-lock=false`，Git 忽略 lockfile；遵循既有策略，
仅在 engine 声明固定样式库版本，不新增或提交 lockfile。间接依赖仍服从既有 npm 解析策略。

## V1 delivery note

2026-09-13 完成 V1；实现与资格见 [V1 review](../../../AgentDocs/vector-tiles/reviews/2026-09-13-v1-frontend-review.md)。
JSON manifest-only 在根 AGENTS 已被允许，但原自有审计器只接受 rename/delete/binary；
本次补齐 JSON 条件及正/反回归，不放宽 JavaScript paired marker 要求。
