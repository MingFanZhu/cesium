# Phase Plan: V1 独立矢量瓦片前端

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Phase: `V1`
- Owner role: `architecture/execution`
- Architecture review: `approved`（设计与实现）
- Architecture reviewer: 当前 Agent 自审
- Created: `2026-09-12`
- Updated: `2026-09-13`
- Entry checkpoint: `122cd2db2e`（V0）
- Delivery checkpoint: `80089a0a91`（V1）
- ADR: [ADR-0058](../../../Documentation/SceneGIS/Decisions/ADR-0058-vector-tile-frontend-contract.md)
- SGP: `SGP-0011`（独立样式依赖声明）

## Objective and non-goals

完成可独立测试的 MVT 数据、单根坐标映射、URL source 与版本化样式前端。
本 phase 不写 renderer、Worker、terrain backend 或 symbol placement；
不以数据解析成功宣称地图已渲染。V2 才建立 `Test/vector-tiles/` 地图页面。

## Current source facts

V0 checkpoint 后复查当前 tiling scheme：`tileXYToExtent` 保留共边边界精度，
支持有明确 `maximumSafeLevel` 的无 wrap 单根 matrix。
复用它而不另写未经验证的 quadtree 边界算法。

Engine 已直接声明 `protobufjs ^8.6.5`，当前 install 为 8.7.1。
Minimal Reader 提供 length/float/string/Long，但 uint32 与 uint64 低层可截取过宽值，
需要在本扩展的明确 unsigned/MVT 边界验证 varint 宽度与消息长度。
不使用 Cesium decoder 或其输出。MVT 标准几何 grammar、属性字典、ring 分组由 SceneGIS 独立实现。

用户 MapLibre fork 已安装 `@maplibre/maplibre-gl-style-spec 24.8.1`，
registry 确认 ISC 许可证和独立 ESM/CJS 入口、sideEffects false。
其 `validateStyleMin`、`createPropertyExpression`、`featureFilter` 可与 renderer 分离。
采用固定版本，不导入 GL JS 地图引擎。源码图谱未覆盖 dependency 分发代码，已定向只读审计实际入口。

## Public contracts

详见 ADR-0058。新增四个根入口：

- `SceneGISVectorTile`：同步 decode；layer/feature/无损整数与 tile-local geometry 数据。
- `SceneGISVectorTileCoordinates`：单 tile 的 u/v→米制坐标和 CSS meters-per-pixel→style zoom。
- `SceneGISVectorTileSource`：显式匹配 tilingScheme 的 XYZ/TMS URL template，按调用请求并解码。
- `SceneGISVectorTileStyle`：固定 V1 profile 的样式预检、编译、逐 layer 求值与依赖分类。

不冻结 GPU packing，不承诺 decoded TypedArray 为不可写内存；
输入 buffer 不被修改或转移，输出数据归调用方。
Style 编译复制输入 JSON，隐藏依赖库对象；source 克隆 Resource 配置，不拥有 World/GPU。

## Steps and affected paths

1. 登记 SGP-0011；固定 engine 样式依赖，补 ThirdParty.extra 名录。
2. 在 `packages/engine/Source/SceneGIS/Core/` 实现四个公共模块；仅必要共享 helper 使用私有模块。
3. 镜像 Core Specs；用独立 fixture writer 构造合法/畸形 bytes，加入手写规范样本。
4. 文档记录 profile、错误和 ownership，使用真实 engine/root 导出验证。
5. 定向 Specs、ESLint/格式、完整 build/types；依赖变化补 release 与 installed engine package smoke。
6. 实现自审、记录偏差和结果，形成独立 V1 checkpoint；再进入 V2。

普通 JS/Specs 由现有 recursive glob 收集，index/SpecList/types 不手工修改。
不添加特殊 Worker/Shader/asset entry。

## Validation tied to risks

- 解码：每 layer extent、乱序字段、所有 scalar、最大 uint64、负 sint64、无 ID/0 ID、多部件/孔洞/buffer；
  截断消息、过宽 varint、非法 tag/type/geometry、字典越界与无效版本明确失败。
- 坐标：同 bytes 在不同米制 root 映射；共边、完整 3857 数值、单次 Y 翻转、TMS 与 geometry 无关。
- Source：URL/level/config 验证；throttled undefined、204/空 payload、404/network、取消与解码错误。
- Style：诊断路径、类型/值域、属性/zoom 表达式、缺失值规范默认、layer/filter/visibility/zoom、
  CSS 颜色与 alpha、超安全整数的样式表示；输入 mutation 不改变编译结果。
- 交付：根 API 与 TS 类型可消费；无 native MVT import、无生成文件入 diff；
  独立包拥有依赖/许可证声明，bundle 可加载，无新增浏览器全局或 Worker。

## Risks, completion and handoff

V1 profile 是计算前端资格，rendered stroke/alpha/pick 仍由 V2 验证。
不做一般计算几何拓扑修复、跨 tile identity 推断、TileJSON/托管服务或任意重投影。
后续若需超出 profile，先扩矩阵与 Specs，再扩 renderer。
自动验证与 [V1 review](../reviews/2026-09-13-v1-frontend-review.md) 已通过；V1 checkpoint 为 `80089a0a91`。
后续工作见 [V2 plan](2026-09-13-v2-planar-batch-and-ground.md)。

仓库 `.npmrc` 设置 `package-lock=false`，Git 忽略 lockfile；遵循既有策略，
仅在 engine 声明固定样式库版本，不新增或提交 lockfile。间接依赖仍服从既有 npm 解析策略。

## Deviations and results

- JSON manifest-only 审计器与根 AGENTS 存在已复现冲突，修复自有 audit 脚本并加回归；JavaScript marker 纪律保持。
- npm test 的 workspace SpecList 需由完整 build 刷新；首次零测试不计成功。最终 focused Specs 35/35，审计器回归 27/27。
- build、build-ts、tsc、release 与独立 engine tarball runtime/types 消费通过；生成文件未进入 diff。
- 改动过的 upstream-owned files 只有 engine package.json 与 ThirdParty.extra.json，对应 SGP-0011。
- 本阶段未建立地图页面或 GPU 资格；V2 承担 Test 场景、flat 批量、层序/接缝/pick/销毁及 ground 可行性。
